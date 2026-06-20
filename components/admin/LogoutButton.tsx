"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <button
      onClick={logout}
      className="rounded-lg bg-white/10 px-3 py-1.5 text-white/70 transition hover:bg-red-500/20 hover:text-red-400"
    >
      退出
    </button>
  );
}