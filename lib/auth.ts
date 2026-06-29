import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/utils";
import { logger } from "@/lib/logger";

/**
 * 共享密码验证函数 — 供 Credentials provider 调用
 *
 * 使用 timingSafeEqual 防止时序攻击。
 * @returns true 如果密码匹配
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  const encoder = new TextEncoder();
  const a = encoder.encode(password);
  const b = encoder.encode(adminPassword);

  if (a.length !== b.length) return false;

  const { timingSafeEqual } = await import("crypto");
  return timingSafeEqual(a, b);
}

// 登录速率限制参数：每 IP 每 15 分钟最多 5 次尝试
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// 恒定时间延迟，防止时序攻击
const LOGIN_DELAY_MS = 800;

export const { handlers, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: { password: { label: "密码", type: "password" } },
      authorize: async (credentials, request) => {
        // ── IP 级速率限制（fail-close：DB 故障时使用内存备用限制）──
        // 与原 /api/admin/login 行为一致，防止凭证爆破
        const ip = getClientIp(request);
        const { allowed } = await checkRateLimit(
          "login_attempts",
          ip,
          LOGIN_WINDOW_MS,
          LOGIN_MAX_ATTEMPTS,
          true // fail-close
        );
        if (!allowed) {
          // 通过抛错让 NextAuth 把用户重定向回登录页（error=AccessDenied）
          await new Promise((r) => setTimeout(r, LOGIN_DELAY_MS));
          throw new Error("RateLimitExceeded");
        }

        const password = credentials?.password as string | undefined;

        // 恒定时间延迟：无论结果如何都等待，防止时序攻击
        await new Promise((r) => setTimeout(r, LOGIN_DELAY_MS));

        if (!password) {
          await recordAttempt("login_attempts", ip, false);
          return null;
        }

        const success = await verifyAdminPassword(password);
        await recordAttempt("login_attempts", ip, success);

        if (!success) {
          return null;
        }

        // 仅在密码正确时显式赋予 admin 角色
        return { id: "admin", name: "管理员", role: "admin" };
      },
    }),
    // GitHub OAuth — 仅在配置了环境变量时启用
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [GitHub({
          profile: (p) => ({ ...p, id: String(p.id), role: "user" as const }),
        })]
      : []),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      // 首次登录时，从 user 对象读取 role（来自 provider 的 profile/authorize 返回值）
      if (user) {
        token.role = (user as { role?: string }).role;
      }
      // 默认 role 为 user（更安全：未显式赋予 admin 的会话无管理员权限）
      token.role ??= "user";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as "admin" | "user";
        session.user.id = token.sub ?? "";
      }
      return session;
    },
  },
  trustHost: true,
});

/**
 * 静默捕获 authorize 抛出的 RateLimitExceeded，转成客户端可识别的错误
 *
 * NextAuth v5 在 CredentialsSignin 时会把 Error.message 暴露在 URL 的 ?error= 参数中，
 * 但我们不想把内部错误细节暴露给客户端。这里通过 logger 留痕，登录页根据
 * 返回的 error=CredentialsSignin 显示通用提示。
 */
logger.debug("NextAuth configured with rate-limited Credentials authorize", {
  source: "auth",
  maxAttempts: LOGIN_MAX_ATTEMPTS,
  windowMs: LOGIN_WINDOW_MS,
});
