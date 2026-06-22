import crypto from "crypto";
import { cookies } from "next/headers";

const CSRF_COOKIE = "csrf_token";

function generateCsrfToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export async function getCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  let token = cookieStore.get(CSRF_COOKIE)?.value;
  if (!token) {
    token = generateCsrfToken();
    cookieStore.set(CSRF_COOKIE, token, {
      httpOnly: false, // 允许客户端 JS 读取，double-submit cookie 模式
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 3600,
    });
  }
  return token;
}

export async function verifyCsrf(requestBodyToken: string | null): Promise<boolean> {
  if (!requestBodyToken) return false;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value;
  if (!cookieToken) return false;
  return crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(requestBodyToken),
  );
}
