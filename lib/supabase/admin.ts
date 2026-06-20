import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAdminSupabaseUrl, getAdminSupabaseKey } from "./config";

/**
 * 管理员专用 Supabase 客户端
 *
 * 始终连接开发库（nzaocqwumlmbewoddysd），所有增删改操作都在开发库执行。
 * 开发库是唯一写入源，生产库通过 GitHub Actions 定时同步。
 */
export async function createAdminClient() {
  const cookieStore = await cookies();

  return createServerClient(getAdminSupabaseUrl(), getAdminSupabaseKey(), {
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