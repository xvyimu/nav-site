import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseKey } from "./config";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseKey(), {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {}
      },
    },
  });
}

/**
 * 无 cookie 的静态客户端（用于 sitemap 等 ISR / 静态渲染场景）
 *
 * 不读取 next/headers 的 cookies，避免触发动态渲染。
 * 仅用 anon key + RLS 读取公开数据（分类、已批准链接）。
 * 返回类型与 createClient 一致，可直接传入 repositories 函数。
 */
export function createStaticClient() {
  return createServerClient(getSupabaseUrl(), getSupabaseKey(), {
    cookies: {
      getAll() { return []; },
      setAll() {},
    },
  });
}