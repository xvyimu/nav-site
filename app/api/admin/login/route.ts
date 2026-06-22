import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { encode } from "@auth/core/jwt";

const MAX_ATTEMPTS = 5;
const DELAY_MS = 800;

// 使用 Supabase 做分布式失败计数（Serverless 下 in-memory 不共享）
async function checkLoginAttempts(ip: string): Promise<{ allowed: boolean }> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", windowStart);

  return { allowed: (count ?? 0) < MAX_ATTEMPTS };
}

async function recordLoginAttempt(ip: string, success: boolean) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.from("login_attempts").insert({ ip, success });
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "未配置管理员密码" }, { status: 500 });
  }

  // 速率限制检查（分布式）
  const { allowed } = await checkLoginAttempts(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "登录尝试过于频繁，请 15 分钟后再试" },
      { status: 429 },
    );
  }

  // 恒定时间比较
  const passwordBuf = Buffer.from(password ?? "");
  const expectedBuf = Buffer.from(adminPassword);

  let isMatch: boolean;
  if (passwordBuf.length !== expectedBuf.length) {
    // 长度不同时，用定时安全的"假比较"防止时序泄露
    const dummy = crypto.randomBytes(expectedBuf.length);
    crypto.timingSafeEqual(dummy, dummy);
    isMatch = false;
  } else {
    isMatch = crypto.timingSafeEqual(passwordBuf, expectedBuf);
  }

  // 无论成功失败都等 800ms（防暴力破解 + 时序攻击）
  await new Promise((r) => setTimeout(r, DELAY_MS));
  await recordLoginAttempt(ip, isMatch);

  if (!isMatch) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  // 创建 Auth.js JWT 会话
  const AUTH_SECRET = process.env.AUTH_SECRET;
  if (!AUTH_SECRET) {
    return NextResponse.json({ error: "未配置会话密钥" }, { status: 500 });
  }

  const isSecure = process.env.NODE_ENV === "production";
  const cookieName = isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  const sessionToken = await encode({
    secret: AUTH_SECRET,
    token: {
      sub: "admin",
      role: "admin",
    },
    maxAge: 4 * 60 * 60, // 4 小时，与之前一致
  });

  const cookieStore = await cookies();
  cookieStore.set({
    name: cookieName,
    value: sessionToken,
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 4 * 60 * 60,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const isSecure = process.env.NODE_ENV === "production";
  cookieStore.delete(isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token");
  return NextResponse.json({ success: true });
}