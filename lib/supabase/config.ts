/**
 * 共享 Supabase 配置（单库模式）
 *
 * ADR-001 已决定从双库架构合并为单库。
 * 所有读写操作统一使用同一个 Supabase 实例，
 * 通过 RLS 策略保证数据安全。
 */

/**
 * 获取 Supabase URL
 */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "未配置 NEXT_PUBLIC_SUPABASE_URL。\n" +
      "请检查 .env.local 文件或环境变量设置。"
    );
  }
  return url;
}

/**
 * 获取 Supabase anon key
 */
export function getSupabaseKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("未配置 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return key;
}
