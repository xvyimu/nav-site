import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";

/**
 * 共享密码验证函数 — 供 Credentials provider 和登录 API 统一调用
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

export const { handlers, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: { password: { label: "密码", type: "password" } },
      authorize: async (credentials) => {
        const password = credentials?.password as string | undefined;
        if (!password) return null;

        const valid = await verifyAdminPassword(password);
        if (!valid) return null;

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
      // 首次登录时，从 user 对象读取 role
      if (user) {
        token.role = user.role ?? "admin";
      }
      token.role ??= "admin";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.id = token.sub ?? "admin";
      }
      return session;
    },
  },
  trustHost: true,
});
