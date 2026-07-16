/**
 * Embedding 提供方抽象（S3 · 消除本机 SPOF）
 *
 * 两种后端，按 EMBED_PROVIDER 选择：
 *
 *   1. "cloudflare" — Cloudflare Workers AI REST（@cf/baai/bge-m3，1024-d，多语言含中文）。
 *      常开、无本机依赖、无需部署 Worker（Vercel 直连 REST）。
 *      需要 CF_ACCOUNT_ID + CF_AI_API_TOKEN（仅 ai:run 权限即可）。
 *
 *   2. "embed-server"（默认） — 既有 BGE-small-zh-v1.5 512-d 微服务
 *      （loopback 或 Worker 反代 Named Tunnel → 本机 18003）。
 *
 * 维度由后端决定：cloudflare=1024，embed-server=512。调用方用 EMBED_DIM 做期望校验。
 *
 * 任一后端失败都返回 null，让上层降级到 Fuse/FTS——与既有语义一致。
 */

import {
  buildEmbedRequestHeaders,
  describeEmbedSkipReason,
  resolveEmbedEndpoint,
} from "@/lib/embedding-runtime";
import { logger } from "@/lib/logger";

type EnvLike = Record<string, string | undefined>;

const DEFAULT_EMBED_SERVER_URL = "http://127.0.0.1:8003";
const CF_MODEL = "@cf/baai/bge-m3";
const REQUEST_TIMEOUT_MS = 10_000;

export type EmbedProvider = "cloudflare" | "embed-server";

export function resolveEmbedProvider(env: EnvLike = process.env): EmbedProvider {
  return env.EMBED_PROVIDER?.trim().toLowerCase() === "cloudflare"
    ? "cloudflare"
    : "embed-server";
}

/** 期望维度：显式 EMBED_DIM 优先，否则按 provider 推断（cloudflare=1024, 其它=512） */
export function resolveExpectedDim(env: EnvLike = process.env): number {
  const raw = Number(env.EMBED_DIM);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return resolveEmbedProvider(env) === "cloudflare" ? 1024 : 512;
}

function extractCloudflareVector(json: unknown): number[] | null {
  // REST /ai/run 返回 { result: { data: [[...]], shape, pooling }, success }
  const result = (json as { result?: { data?: unknown } })?.result;
  const data = result?.data;
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0] as number[];
  }
  // 兼容直接返回 { data: [[...]] } 的形状
  const flat = (json as { data?: unknown })?.data;
  if (Array.isArray(flat) && Array.isArray(flat[0])) {
    return flat[0] as number[];
  }
  return null;
}

/**
 * Cloudflare Workers AI 单条 embed。
 * @returns 1024-d 向量或 null（未配置 / HTTP 失败 / 形状非法）
 */
async function embedViaCloudflare(
  text: string,
  env: EnvLike = process.env
): Promise<number[] | null> {
  const accountId = env.CF_ACCOUNT_ID?.trim();
  const token = env.CF_AI_API_TOKEN?.trim();
  if (!accountId || !token) {
    logger.warn("EMBED_PROVIDER=cloudflare but CF_ACCOUNT_ID/CF_AI_API_TOKEN missing", {
      source: "embed-provider",
    });
    return null;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text] }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    logger.warn("Cloudflare Workers AI embed HTTP error", {
      source: "embed-provider",
      status: res.status,
    });
    return null;
  }

  const json = await res.json();
  const vector = extractCloudflareVector(json);
  if (!vector || vector.length === 0) {
    logger.warn("Cloudflare Workers AI embed returned invalid shape", {
      source: "embed-provider",
    });
    return null;
  }
  return vector;
}

/** 解析 embed-server 的 /embed-query 端点（loopback 或远程 HTTPS+key） */
export function getEmbedServerEndpoint(env: EnvLike = process.env): string | null {
  const { endpoint, reason } = resolveEmbedEndpoint({
    raw: env.EMBED_SERVER_URL,
    fallback: resolveEmbedProvider(env) !== "embed-server" ? undefined : DEFAULT_EMBED_SERVER_URL,
    path: "/embed-query",
    env,
  });
  if (endpoint !== null) return endpoint;
  if (reason !== "missing") {
    logger.warn("Ignoring EMBED_SERVER_URL", {
      source: "embed-provider",
      reason: describeEmbedSkipReason(reason),
    });
  }
  return null;
}

export function getEmbeddingCacheEndpoint(env: EnvLike = process.env): string | null {
  if (resolveEmbedProvider(env) !== "embed-server") {
    return `cloudflare:${CF_MODEL}`;
  }

  const { endpoint } = resolveEmbedEndpoint({
    raw: env.EMBED_SERVER_URL,
    fallback: undefined,
    path: "/embed-query",
    env,
  });
  return endpoint;
}

async function embedViaEmbedServer(
  text: string,
  env: EnvLike = process.env
): Promise<{ vector: number[] | null; endpoint: string | null }> {
  const endpoint = getEmbedServerEndpoint(env);
  if (!endpoint) return { vector: null, endpoint: null };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: buildEmbedRequestHeaders({ json: true, env }),
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) return { vector: null, endpoint };

  const data = await res.json();
  if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
    return { vector: null, endpoint };
  }
  return { vector: data.embedding as number[], endpoint };
}

/**
 * RL 资源库专用 embed：**始终**走 embed-server（512-d），忽略 EMBED_PROVIDER。
 *
 * 理由：RL 向量表 pages.embedding 与外部 Edge Function search-api-v3 固定 512-d，
 * 不在本仓库控制范围内。即使 nav 侧切到 Cloudflare 1024-d，RL 也必须保持 512-d，
 * 否则 query 向量维度与 RL 库不一致，检索全断。
 */
export async function generateResourceEmbedding(
  text: string,
  env: EnvLike = process.env
): Promise<number[] | null> {
  const { vector } = await embedViaEmbedServer(text, env);
  return vector;
}

/**
 * 生成查询向量（按 provider 分派）。
 *
 * 返回 { vector, provider, endpoint }：
 *  - provider=cloudflare 时 endpoint 为 REST（不参与「临时不可用」缓存 key）
 *  - provider=embed-server 时 endpoint 用于既有 30s 不可用缓存
 */
export async function generateEmbedding(
  text: string,
  env: EnvLike = process.env
): Promise<{ vector: number[] | null; provider: EmbedProvider; endpoint: string | null }> {
  const provider = resolveEmbedProvider(env);
  if (provider === "cloudflare") {
    const vector = await embedViaCloudflare(text, env);
    return { vector, provider, endpoint: "cloudflare:@cf/baai/bge-m3" };
  }
  const { vector, endpoint } = await embedViaEmbedServer(text, env);
  return { vector, provider, endpoint };
}
