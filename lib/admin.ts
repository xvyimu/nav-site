import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const COOKIE_NAME = "admin_session";
const SESSION_EXPIRY_HOURS = 4;
const NONCE_STORE_TTL_HOURS = 8; // nonce 白名单有效期 > token 有效期

/**
 * 生成会话 token（含时间戳 + 随机 nonce，nonce 存入服务端白名单实现一次性防重放）
 */
async function generateToken(password: string): Promise<string> {
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = JSON.stringify({
    h: crypto.createHmac("sha256", password).update("admin-session").digest("hex"),
    i: nonce,
    e: Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000,
  });

  // 将 nonce 存入服务端白名单（Supabase admin_sessions）
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_DEV || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.from("admin_sessions").insert({
      nonce,
      expires_at: new Date(Date.now() + NONCE_STORE_TTL_HOURS * 60 * 60 * 1000).toISOString(),
    });
  } catch {
    // 服务端存储失败时仍允许生成 token（nonce 白名单是可选的额外保护层）
  }

  return Buffer.from(payload).toString("base64url");
}

export async function setSessionCookie(password: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, await generateToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
  });
}

export async function verifyAdmin(): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;

    // 解析 base64url token
    let payload: { h: string; i: string; e: number };
    try {
      payload = JSON.parse(Buffer.from(token, "base64url").toString());
    } catch {
      return false;
    }

    // 过期检查
    if (Date.now() > payload.e) {
      cookieStore.delete(COOKIE_NAME);
      return false;
    }

    // nonce 白名单检查（一次性 token 防重放）
    const isValidNonce = await checkNonce(payload.i);
    if (!isValidNonce) {
      cookieStore.delete(COOKIE_NAME);
      return false;
    }

    // HMAC 验证（恒定时间比较）
    const expectedHash = crypto.createHmac("sha256", adminPassword).update("admin-session").digest("hex");
    const hashBuf = Buffer.from(payload.h);
    const expectedBuf = Buffer.from(expectedHash);

    if (hashBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * 检查 nonce 是否在白名单中（一次性，检查后删除）
 */
async function checkNonce(nonce: string): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL_DEV || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("nonce", nonce)
      .maybeSingle();

    if (!data) return false;

    // 一次性：删除已使用的 nonce
    await supabase.from("admin_sessions").delete().eq("id", data.id);
    return true;
  } catch {
    // 服务端存储不可用时，降级为跳过 nonce 检查（仅 HMAC + 过期保护）
    return true;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
