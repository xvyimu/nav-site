"use client";

import { useLogout } from "@/hooks/useLogout";

export default function LogoutButton() {
  const { logout, loading } = useLogout();

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
