import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 服务端双库路由：开发环境走旧库，生产环境自古就走当新库
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

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component 中 set 可能失败，忽略
        }
      },
    },
  });
}
