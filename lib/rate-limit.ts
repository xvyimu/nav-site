/**
 * 共享速率限制模块
 *
 * 统一所有 API 路由的速率限制逻辑，避免在多个文件中重复实现。
 * 基于 Supabase 表的分布式速率限制，支持惰性清理。
 * 对敏感操作（如登录）提供内存级备用限制，数据库故障时 fail-close。
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/** 24 小时毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ── 内存级备用速率限制（数据库故障时启用）──

interface MemoryBucket {
  count: number;
  windowStart: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();

/**
 * 内存级速率限制检查（备用方案）
 *
 * 当数据库不可用时，使用内存计数器作为后备。
 * 对敏感操作采用 fail-close 策略。
 * 也可直接用于无 DB 表的高 QPS 公开 API（search / favicon）。
 */
function checkMemoryRateLimit(
  key: string,
  windowMs: number,
  maxAttempts: number
): boolean {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    memoryBuckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= maxAttempts) {
    return false;
  }

  bucket.count++;
  return true;
}

/**
 * 进程内速率限制（无 DB）
 *
 * Serverless 多实例下不跨节点共享，但能挡住单实例刷量与误用。
 */
export function checkInMemoryRateLimit(
  bucketKey: string,
  windowMs: number,
  maxAttempts: number
): { allowed: boolean } {
  cleanupMemoryBuckets(windowMs);
  return {
    allowed: checkMemoryRateLimit(bucketKey, windowMs, maxAttempts),
  };
}

/** 定期清理过期的内存桶（避免内存泄漏） */
function cleanupMemoryBuckets(windowMs: number): void {
  const now = Date.now();
  for (const [key, bucket] of memoryBuckets) {
    if (now - bucket.windowStart > windowMs) {
      memoryBuckets.delete(key);
    }
  }
}

/**
 * 清理指定表中超过 24h 的过期记录（惰性 / 抽样）
 *
 * 热路径每次 DELETE 会放大写负载；默认约 2% 请求触发清理。
 * 测试可设 RATE_LIMIT_CLEANUP_ALWAYS=1 强制每次清理。
 */
export async function cleanupOldAttempts(
  supabase: SupabaseClient,
  table: string
): Promise<void> {
  const always = process.env.RATE_LIMIT_CLEANUP_ALWAYS === "1";
  if (!always && Math.random() > 0.02) return;

  const cutoff = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const { error } = await supabase.from(table).delete().lt("created_at", cutoff);
  if (error) {
    logger.warn("Rate limit cleanup failed", { table, error: error.message });
  }
}

/**
 * 通用速率限制检查
 *
 * @param table - 速率限制表名（如 "login_attempts"、"submit_attempts"）
 * @param ip - 客户端 IP
 * @param windowMs - 时间窗口（毫秒）
 * @param maxAttempts - 窗口内最大尝试次数
 * @param failClose - 若为 true，数据库故障时拒绝请求（敏感操作）；否则放行（默认）
 * @returns { allowed, count } — 是否允许操作及当前计数
 */
export async function checkRateLimit(
  table: string,
  ip: string,
  windowMs: number,
  maxAttempts: number,
  failClose: boolean = false,
  client?: SupabaseClient
): Promise<{ allowed: boolean; count: number }> {
  const supabase = client ?? createServiceRoleClient();
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const result = await supabase.rpc("consume_rate_limit", {
      p_bucket_key: `${table}:${ip}`,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      p_max_attempts: maxAttempts,
    });
    data = result.data;
    error = result.error;
  } catch (e) {
    error = { message: e instanceof Error ? e.message : String(e) };
  }

  if (error) {
    // 数据库故障时，对敏感操作使用内存备用限制（fail-close）
    if (failClose) {
      cleanupMemoryBuckets(windowMs);
      const memoryAllowed = checkMemoryRateLimit(
        `${table}:${ip}`,
        windowMs,
        maxAttempts
      );
      logger.warn("Rate limit DB failed, using memory fallback (fail-close)", {
        table, ip, error: error.message, memoryAllowed,
      });
      return { allowed: memoryAllowed, count: 0 };
    }
    // 非敏感操作放行
    logger.warn("Rate limit check failed (fail-open)", { table, ip, error: error.message });
    return { allowed: true, count: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as { allowed?: unknown }).allowed !== "boolean" ||
    typeof (row as { current_count?: unknown }).current_count !== "number"
  ) {
    logger.warn("Rate limit RPC returned an invalid payload", { table, ip });
    if (failClose) {
      cleanupMemoryBuckets(windowMs);
      const allowed = checkMemoryRateLimit(`${table}:${ip}`, windowMs, maxAttempts);
      return { allowed, count: 0 };
    }
    return { allowed: true, count: 0 };
  }

  return {
    allowed: (row as { allowed: boolean }).allowed,
    count: (row as { current_count: number }).current_count,
  };
}

/** 仅有 ip/created_at、无 success 列的限流表 */
const TABLES_WITHOUT_SUCCESS = new Set([
  "favorites_rate_limits",
  "click_rate_limits",
]);

/**
 * 记录一次尝试（成功或失败）
 *
 * @param client - 可选；favorites 等仅 service_role 可读表的表必须传入 service_role
 */
export async function recordAttempt(
  table: string,
  ip: string,
  success: boolean,
  extra?: Record<string, unknown>,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? (await createClient());
  const row = TABLES_WITHOUT_SUCCESS.has(table)
    ? { ip, ...extra }
    : { ip, success, ...extra };
  const { error } = await supabase.from(table).insert(row);

  if (error) {
    logger.warn("Rate limit record failed", { table, ip, error: error.message });
  }
}

/**
 * 点击速率限制 — 同一 IP 对同一链接在窗口内只计一次
 *
 * @returns { allowed } - 是否允许记录点击
 * @deprecated 优先使用 tryRecordClick（先插后计，消除 TOCTOU）
 */
export async function checkClickRateLimit(
  ip: string,
  url: string,
  windowMs: number = 15 * 60 * 1000
): Promise<{ allowed: boolean }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  // 惰性清理
  await cleanupOldAttempts(supabase, "click_rate_limits");

  const { count, error } = await supabase
    .from("click_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("url", url)
    .gte("created_at", since);

  if (error) {
    logger.warn("Click rate limit check failed", { ip, error: error.message });
    return { allowed: true };
  }

  return { allowed: (count ?? 0) === 0 };
}

/**
 * 尝试记录点击（窗口内去重）
 *
 * 用 DB UNIQUE (ip, url, window_start) 原子抢占：
 * - inserted=true → 本窗口首次，调用方再 increment
 * - inserted=false → 已计过 / 冲突，不得再 +1
 */
export async function tryRecordClick(
  ip: string,
  url: string
): Promise<{ inserted: boolean }> {
  // service_role：click_rate_limits 通常无 anon 写权限
  const supabase = createServiceRoleClient();

  // 15 分钟固定桶：0/15/30/45 分钟
  const now = new Date();
  const minutes = now.getMinutes();
  const windowStart = new Date(now);
  windowStart.setMinutes(Math.floor(minutes / 15) * 15, 0, 0);

  await cleanupOldAttempts(supabase, "click_rate_limits");

  const { error } = await supabase
    .from("click_rate_limits")
    .insert({ ip, url, window_start: windowStart.toISOString() });

  // 23505 = unique_violation — 窗口内已存在
  if (error && error.code === "23505") {
    return { inserted: false };
  }
  if (error) {
    logger.warn("Click record failed", { ip, url, error: error.message });
    // 写失败时不 increment，避免无限刷榜
    return { inserted: false };
  }
  return { inserted: true };
}

/**
 * 记录点击（窗口内去重）— 兼容旧调用
 */
export async function recordClick(ip: string, url: string): Promise<void> {
  await tryRecordClick(ip, url);
}

/**
 * 递增链接点击计数（通过 RPC）
 */
export async function incrementClickCount(url: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("increment_click", { link_url: url });
  if (error) {
    logger.warn("Click increment failed", { url, error: error.message });
  }
}
