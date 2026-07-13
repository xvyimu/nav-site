/**
 * 分布式速率限制适配器（S2）
 *
 * 高 QPS 公开端点（search / favicon / resource-search）原用进程内桶，
 * 在 Vercel 多实例下有效配额 = 阈值 × 实例数，形同虚设。
 *
 * 本模块提供一个后端可插拔的滑动窗口限流器：
 *   - 配置了 Upstash Redis REST（UPSTASH_REDIS_REST_URL + TOKEN）→ 走 Redis，
 *     跨实例共享，真正生效；
 *   - 未配置 → 回退到进程内桶（与旧行为一致，不引入新依赖 / 不阻断部署）。
 *
 * 选型说明：Upstash REST 是纯 HTTP、无常驻连接，天然契合 serverless；
 * 且已在本机记忆体系中作为缓存基础设施使用。未配置时的回退保证零基础设施可跑。
 */

import { checkInMemoryRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

type EnvLike = Record<string, string | undefined>;

interface UpstashConfig {
  url: string;
  token: string;
}

function readUpstashConfig(env: EnvLike): UpstashConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Upstash 固定窗口计数：INCR + 首次 EXPIRE。
 * 用 pipeline 单次 HTTP 往返完成两条命令。
 */
async function upstashFixedWindow(
  cfg: UpstashConfig,
  bucketKey: string,
  windowMs: number,
  maxAttempts: number,
  timeoutMs: number
): Promise<{ allowed: boolean; count: number }> {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  // 固定窗口 key：把时间对齐到窗口起点，天然过期
  const windowId = Math.floor(Date.now() / windowMs);
  const key = `rl:${bucketKey}:${windowId}`;

  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSeconds), "NX"],
    ]),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`upstash pipeline HTTP ${res.status}`);
  }

  const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  const incr = data?.[0];
  if (!incr || incr.error || typeof incr.result !== "number") {
    throw new Error(`upstash INCR bad result: ${incr?.error ?? "unknown"}`);
  }

  const count = incr.result;
  return { allowed: count <= maxAttempts, count };
}

const UPSTASH_TIMEOUT_MS = 800;

/**
 * 分布式滑动窗口限流（固定窗口近似）。
 *
 * @returns allowed — 是否放行；backend — 实际使用的后端（可观测）
 */
export async function checkDistributedRateLimit(
  bucketKey: string,
  windowMs: number,
  maxAttempts: number,
  env: EnvLike = process.env
): Promise<{ allowed: boolean; backend: "upstash" | "memory" }> {
  const cfg = readUpstashConfig(env);
  if (!cfg) {
    // 无 Redis：回退进程内（旧行为，单实例仍有效）
    return { allowed: checkInMemoryRateLimit(bucketKey, windowMs, maxAttempts).allowed, backend: "memory" };
  }

  try {
    const { allowed } = await upstashFixedWindow(
      cfg,
      bucketKey,
      windowMs,
      maxAttempts,
      UPSTASH_TIMEOUT_MS
    );
    return { allowed, backend: "upstash" };
  } catch (e) {
    // Redis 抖动 → 回退进程内，避免误伤正常用户（fail-open 到本地桶）
    logger.warn("Distributed rate limit fell back to memory", {
      bucketKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return { allowed: checkInMemoryRateLimit(bucketKey, windowMs, maxAttempts).allowed, backend: "memory" };
  }
}
