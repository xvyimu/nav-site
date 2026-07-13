/**
 * 管理员密码校验
 *
 * 优先 ADMIN_PASSWORD_HASH（scrypt），兼容过渡期 ADMIN_PASSWORD 明文。
 * 哈希格式：scrypt$N$r$p$saltB64url$hashB64url
 */

import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";

const HASH_PREFIX = "scrypt";
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEYLEN = 64;

export type AdminPasswordSource = "hash" | "plaintext" | "missing";

type EnvLike = Record<string, string | undefined>;

export function describeAdminPasswordSource(
  env: EnvLike = process.env
): AdminPasswordSource {
  if (env.ADMIN_PASSWORD_HASH?.trim()) return "hash";
  if (env.ADMIN_PASSWORD?.trim()) return "plaintext";
  return "missing";
}

/**
 * 生成 scrypt 哈希字符串（写入 ADMIN_PASSWORD_HASH）
 */
export async function hashAdminPassword(
  password: string,
  opts?: { N?: number; r?: number; p?: number; salt?: Buffer }
): Promise<string> {
  if (!password) throw new Error("password required");
  const N = opts?.N ?? DEFAULT_N;
  const r = opts?.r ?? DEFAULT_R;
  const p = opts?.p ?? DEFAULT_P;
  const salt = opts?.salt ?? randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN, { N, r, p });
  return [
    HASH_PREFIX,
    String(N),
    String(r),
    String(p),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

function parseHash(
  encoded: string
): { N: number; r: number; p: number; salt: Buffer; hash: Buffer } | null {
  const parts = encoded.trim().split("$");
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  try {
    const salt = Buffer.from(parts[4], "base64url");
    const hash = Buffer.from(parts[5], "base64url");
    if (!salt.length || hash.length !== KEYLEN) return null;
    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}

async function verifyScryptHash(
  password: string,
  encoded: string
): Promise<boolean> {
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  const { N, r, p, salt, hash } = parsed;
  try {
    const derived = scryptSync(password, salt, hash.length, { N, r, p });
    if (derived.length !== hash.length) return false;
    return timingSafeEqual(derived, hash);
  } catch {
    return false;
  }
}

function verifyPlaintext(password: string, expected: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isProductionLike(env: EnvLike): boolean {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

/**
 * 校验管理员密码
 *
 * 1. 有 ADMIN_PASSWORD_HASH → 仅走 scrypt
 * 2. 否则有 ADMIN_PASSWORD → 仅非生产环境允许明文 timingSafeEqual
 * 3. 生产缺 HASH → false（不可回退明文）
 */
export async function verifyAdminPassword(
  password: string,
  env: EnvLike = process.env
): Promise<boolean> {
  if (!password) return false;

  const hash = env.ADMIN_PASSWORD_HASH?.trim();
  if (hash) {
    return verifyScryptHash(password, hash);
  }

  // 生产禁止明文口令路径
  if (isProductionLike(env)) {
    return false;
  }

  const plain = env.ADMIN_PASSWORD?.trim();
  if (plain) {
    return verifyPlaintext(password, plain);
  }

  return false;
}
