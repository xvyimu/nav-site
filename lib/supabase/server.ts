import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseUrl, getSupabaseKey, getServiceRoleKey } from "./config";

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

/**
 * 服务端 service_role 客户端（绕过 RLS，仅限 API 路由中使用）
 *
 * 用于需要绕过 RLS 的操作，如 pgvector 语义搜索、管理员操作等。
 * 仅在服务端使用，不会暴露给客户端。
 */
export function createServiceRoleClient() {
  return createSupabaseClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}