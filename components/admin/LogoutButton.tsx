"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      // 统一走 NextAuth 的 /api/auth/signout 路径
      // 这会清除 next-auth.session-token cookie
      await signOut({ redirect: false });
    } catch (e) {
      console.error("登出请求错误:", e);
    } finally {
      setLoading(false);
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="rounded-lg bg-white/10 px-3 py-1.5 text-white/70 transition hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
    >
      {loading ? "退出中..." : "退出"}
    </button>
  );
}
