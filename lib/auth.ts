import { NextAuth } from "@auth/nextjs";
import Credentials from "@auth/core/providers/credentials";

export const { handlers, auth } = NextAuth({
  providers: [
    // 手动管理登录（限流 + 密码验证在 /api/admin/login 中处理），
    // Auth.js 仅用于 JWT 会话管理和中间件保护
    Credentials({
      credentials: { password: { label: "密码", type: "password" } },
      authorize: async () => {
        // 登录走自定义端点，此处不放行任何自动登录
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async authorized() {
      // middleware.ts 自行处理授权逻辑，此处放行
      return true;
    },
    async jwt({ token }) {
      token.role ??= "admin";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).id = token.sub ?? "admin";
      }
      return session;
    },
  },
  trustHost: true,
});