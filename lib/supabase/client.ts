import { createBrowserClient } from "@supabase/ssr";

/**
 * 双库路由：开发环境走旧库，生产环境自古就走当新库
 *
 * 开发时 `npm run dev` → 旧库 (nzaocqw...oddysd)
 * 部署到 Vercel 后   → 新库 (vyqqbypwrbdcafanzwmj)
 */
function getSupabaseUrl() {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_URL_DEV ||
      process.env.NEXT_PUBLIC_SUPABASE_URL!
    );
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

function getSupabaseKey() {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseKey());
}
