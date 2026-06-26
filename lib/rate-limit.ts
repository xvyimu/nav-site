/**
 * 共享速率限制模块
 *
 * 统一所有 API 路由的速率限制逻辑，避免在多个文件中重复实现。
 * 基于 Supabase 表的分布式速率限制，支持惰性清理。
 * 对敏感操作（如登录）提供内存级备用限制，数据库故障时 fail-close。
 */

import { createClient } from "@/lib/supabase/server";
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
 * 清理指定表中超过 24h 的过期记录（惰性清理）
 */
export async function cleanupOldAttempts(
  supabase: SupabaseClient,
  table: string
): Promise<void> {
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
  failClose: boolean = false
): Promise<{ allowed: boolean; count: number }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - windowMs).toISOString();

  // 惰性清理过期记录
  await cleanupOldAttempts(supabase, table);

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", since);

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

  return { allowed: (count ?? 0) < maxAttempts, count: count ?? 0 };
}

/**
 * 记录一次尝试（成功或失败）
 */
export async function recordAttempt(
  table: string,
  ip: string,
  success: boolean,
  extra?: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .insert({ ip, success, ...extra });

  if (error) {
    logger.warn("Rate limit record failed", { table, ip, error: error.message });
  }
}

/**
 * 点击速率限制 — 同一 IP 对同一链接在窗口内只计一次
 *
 * @returns { allowed } - 是否允许记录点击
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
    .select("*", { count: "exact", head: true })
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
 * 记录点击（窗口内去重）
 *
 * 用 DB UNIQUE 约束 (ip, url, window_start) 替代 SELECT-then-INSERT，
 * 消除并发竞争条件（TOCTOU）。唯一约束冲突说明窗口内已记录过。
 */
export async function recordClick(ip: string, url: string): Promise<void> {
  const supabase = await createClient();

  // 15 分钟固定桶：0/15/30/45 分钟
  const now = new Date();
  const minutes = now.getMinutes();
  const windowStart = new Date(now);
  windowStart.setMinutes(Math.floor(minutes / 15) * 15, 0, 0);

  const { error } = await supabase
    .from("click_rate_limits")
    .insert({ ip, url, window_start: windowStart.toISOString() });

  // 23505 = unique_violation — 窗口内已存在相同 (ip, url, window_start)
  if (error && error.code === "23505") {
    return;
  }
  if (error) {
    logger.warn("Click record failed", { ip, url, error: error.message });
  }
}

/**
 * 递增链接点击计数（通过 RPC）
 */
export async function incrementClickCount(url: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("increment_click", { link_url: url });
  if (error) {
    logger.warn("Click increment failed", { url, error: error.message });
  }
}
