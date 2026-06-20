/**
 * 共享 Supabase 配置
 * 从环境变量中提取数据库路由逻辑，避免 client.ts / server.ts / admin.ts 重复
 */

/**
 * 获取当前环境对应的 Supabase URL
 * 开发环境（npm run dev）→ 开发库
 * 生产环境（Vercel）     → 生产库
 */
export function getSupabaseUrl(): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_URL_DEV ||
      process.env.NEXT_PUBLIC_SUPABASE_URL!
    );
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

/**
 * 获取当前环境对应的 Supabase anon key
 */
export function getSupabaseKey(): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

/**
 * 获取管理员专用 Supabase 配置（始终指向开发库）
 */
export function getAdminSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL_DEV ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!
  );
}

export function getAdminSupabaseKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
