"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 统一走 NextAuth 的 /api/auth/callback/credentials 路径
    // authorize 回调内部做：IP 限流（fail-close）+ 恒定时间密码校验 + recordAttempt
    const result = await signIn("credentials", {
      password,
      redirect: false,
    });

    if (result?.error) {
      // NextAuth 不会区分错误原因，统一显示「密码错误或操作过于频繁」
      // 防止枚举攻击：不在客户端暴露是 rate-limit 还是密码错误
      setError("密码错误或操作过于频繁，请稍后再试");
    } else {
      router.push("/admin");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm animate-fade-in-up">
        <h1 className="mb-6 text-center text-lg font-medium text-foreground/80">
          管理面板
        </h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            className="w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-foreground/80 placeholder:text-muted-foreground/30 outline-none transition-colors focus:border-white/[0.12] focus:bg-white/[0.04]"
            autoComplete="current-password"
            autoFocus
          />
          {error && <p className="text-xs text-red-400/70">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-foreground/[0.08] py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.12] disabled:opacity-50"
          >
            {loading ? "验证中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
