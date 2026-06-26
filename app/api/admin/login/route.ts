import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";
import { getClientIp } from "@/lib/utils";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { verifyAdminPassword } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const DELAY_MS = 800;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 天

const loginSchema = z.object({
  password: z.string().min(1, "缺少密码").max(256, "密码过长"),
});

async function createSessionCookie(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not configured");
  return encode({
    token: { sub: "admin", name: "管理员", role: "admin" },
    secret,
    salt: "next-auth.session-token",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // 分布式速率限制（fail-close：数据库故障时使用内存备用限制）
  const { allowed } = await checkRateLimit(
    "login_attempts",
    ip,
    15 * 60 * 1000,
    MAX_ATTEMPTS,
    true
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "尝试过于频繁，请 15 分钟后再试" },
      { status: 429 }
    );
  }

  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "输入验证失败", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { password } = parsed.data;

  // 恒定时间延迟：无论结果如何都等待，防止时序攻击
  await new Promise((r) => setTimeout(r, DELAY_MS));

  // 密码验证（使用共享函数，消除重复逻辑）
  const success = await verifyAdminPassword(password);

  // 记录登录结果
  await recordAttempt("login_attempts", ip, success);

  if (!success) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  // 创建加密会话 JWT 并设置 cookie
  const sessionToken = await createSessionCookie();

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ success: true });
  response.cookies.set("next-auth.session-token", sessionToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("next-auth.session-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
