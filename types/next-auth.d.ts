import type { DefaultSession } from "next-auth";

/**
 * NextAuth 类型增强
 *
 * 将 role 和 id 字段添加到 Session.user，
 * 消除代码中的 `as unknown as { id: string }` 类型断言。
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: "admin" | "user";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "admin" | "user";
  }
}
