"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

/**
 * 退出登录 hook
 *
 * 统一退出逻辑：signOut → redirect，失败时 toast 提示 + 不跳转。
 * sonner 动态导入以避免进入首屏 bundle。
 */
export function useLogout() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    if (loading) return;
    setLoading(true);
    try {
      await signOut({ redirect: false });
      router.push("/login");
      router.refresh();
    } catch (e) {
      const { toast } = await import("sonner");
      console.error("登出请求错误:", e);
      toast.error("退出失败，请重试");
      setLoading(false);
    }
  }

  return { logout, loading };
}
