/**
 * 共享 Supabase 配置
 * 从环境变量中提取数据库路由逻辑
 */

/**
 * 获取当前环境对应的 Supabase URL
 */
export function getSupabaseUrl(): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const devUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_DEV;
    if (!devUrl) {
      throw new Error(
        "开发环境必须配置 NEXT_PUBLIC_SUPABASE_URL_DEV。\n" +
        "请检查 .env.local 文件或环境变量设置。\n" +
        "禁止回退到生产库（NEXT_PUBLIC_SUPABASE_URL）以避免误操作。"
      );
    }
    return devUrl;
  }
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!prodUrl) {
    throw new Error("生产环境未配置 NEXT_PUBLIC_SUPABASE_URL");
  }
  return prodUrl;
}

/**
 * 获取当前环境对应的 Supabase anon key
 */
export function getSupabaseKey(): string {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const devKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV;
    if (!devKey) {
      throw new Error(
        "开发环境必须配置 NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV。\n" +
        "禁止回退到生产密钥。"
      );
    }
    return devKey;
  }
  const prodKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!prodKey) {
    throw new Error("生产环境未配置 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return prodKey;
}

/**
 * 获取管理员专用 Supabase 配置（始终指向开发库）
 */
export function getAdminSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL_DEV;
  if (!url) {
    throw new Error("管理员客户端必须使用开发库（NEXT_PUBLIC_SUPABASE_URL_DEV），但该环境变量未配置");
  }
  return url;
}

export function getAdminSupabaseKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV;
  if (!key) {
    throw new Error("管理员客户端必须使用开发库密钥（NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV），但该环境变量未配置");
  }
  return key;
}