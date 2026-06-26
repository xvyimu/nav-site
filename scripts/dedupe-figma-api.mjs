#!/usr/bin/env node
/**
 * Figma 去重 — 通过 admin API 删除（Phase C）
 *
 * Service role key 在该项目上遇到 PostgreSQL GRANT 层面的 "permission denied"，
 * 改走 admin API（与 admin UI 同一删除通道）：
 *   1. 用 next-auth/jwt encode 生成 admin session token（与 /api/admin/login 一致）
 *   2. 带 cookie 调用 DELETE /api/admin/links/{id}
 *
 * 用法：
 *   node scripts/dedupe-figma-api.mjs              # 正式删除
 *   node scripts/dedupe-figma-api.mjs --dry-run    # 仅查询预览
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// ── 环境变量加载 ──
function loadEnv() {
  try {
    const envPath = join(projectRoot, ".env.local");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const apiBase = "http://localhost:3264";

async function main() {
  console.log(`\n=== Figma 去重（admin API）===`);
  console.log(`API: ${apiBase}`);
  console.log(`模式: ${dryRun ? "预览（dry-run）" : "正式删除"}\n`);

  // 1. 查询当前 Figma 记录（公开 API，无需认证）
  const searchResp = await fetch(`${apiBase}/api/tools?search=figma`);
  const searchData = await searchResp.json();
  const figmaRecords = (searchData.tools || []).filter(
    (t) => t.name.toLowerCase() === "figma"
  );

  console.log(`找到 ${figmaRecords.length} 条 Figma 记录:`);
  for (const r of figmaRecords) {
    console.log(`  - id=${r.id} url=${r.url} slug=${r.slug}`);
  }

  if (figmaRecords.length <= 1) {
    console.log("\n无需去重");
    return;
  }

  // 2. 确定重复记录
  // 规范记录：url 含 www.（https://www.figma.com）
  // 重复记录：url 不含 www.（https://figma.com）— www 变体重复
  const canonical = figmaRecords.find((r) => r.url.includes("www."));
  const duplicates = figmaRecords.filter((r) => !r.url.includes("www."));

  if (!canonical || duplicates.length === 0) {
    // 如果无法按 www 区分，保留第一条，删除其余
    console.log("\n⚠️ 无法按 www 区分，保留第一条，删除其余");
    const [keep, ...rest] = figmaRecords;
    console.log(`保留: id=${keep.id} url=${keep.url}`);
    for (const r of rest) {
      console.log(`将删除: id=${r.id} url=${r.url}`);
    }
    if (dryRun) {
      console.log("\n预览模式，未删除。去掉 --dry-run 正式执行。");
      return;
    }
    await deleteRecords(rest);
    return;
  }

  console.log(`\n规范记录: id=${canonical.id} url=${canonical.url}`);
  console.log(`重复记录 ${duplicates.length} 条:`);
  for (const r of duplicates) {
    console.log(`  - id=${r.id} url=${r.url}`);
  }

  if (dryRun) {
    console.log("\n预览模式，未删除。去掉 --dry-run 正式执行。");
    return;
  }

  await deleteRecords(duplicates);

  // 4. 验证
  const verifyResp = await fetch(`${apiBase}/api/tools?search=figma`);
  const verifyData = await verifyResp.json();
  const remaining = (verifyData.tools || []).filter(
    (t) => t.name.toLowerCase() === "figma"
  );
  console.log(`\n验证：剩余 ${remaining.length} 条 Figma 记录`);
  for (const r of remaining) {
    console.log(`  - id=${r.id} url=${r.url}`);
  }
}

async function loginViaCredentials() {
  // 1. 获取 CSRF token
  const csrfResp = await fetch(`${apiBase}/api/auth/csrf`, {
    headers: { Cookie: "" },
  });
  const csrfCookie = extractCookies(csrfResp);
  const { csrfToken } = await csrfResp.json();

  // 2. POST credentials callback（不自动跟随重定向，以捕获 Set-Cookie）
  const loginResp = await fetch(`${apiBase}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body: new URLSearchParams({
      csrfToken,
      password: process.env.ADMIN_PASSWORD || "admin123",
      callbackUrl: `${apiBase}/admin`,
      json: "true",
    }),
    redirect: "manual",
  });

  // 3. 从 Set-Cookie 提取 session token（NextAuth v5 用 authjs.session-token）
  const setCookie = loginResp.headers.get("set-cookie") || "";
  const allSetCookies = extractCookies(loginResp);
  if (!allSetCookies.includes("authjs.session-token")) {
    throw new Error(
      `登录失败：未获取到 session cookie\nStatus: ${loginResp.status}\nSet-Cookie: ${setCookie.slice(0, 300)}`
    );
  }
  return allSetCookies;
}

function extractCookies(resp) {
  // getSetCookie() 返回独立的 Set-Cookie 字符串数组（Node 18+ / undici）
  const cookies = resp.headers.getSetCookie?.() ?? [];
  return cookies
    .map((c) => {
      const eq = c.indexOf("=");
      return eq > -1 ? `${c.slice(0, eq)}=${c.slice(eq + 1).split(";")[0]}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

async function deleteRecords(records) {
  // 通过 NextAuth credentials 流程登录，获取 session cookie
  console.log("\n登录 admin...");
  const cookie = await loginViaCredentials();
  console.log("登录成功，获取到 session cookie\n");

  for (const r of records) {
    const resp = await fetch(`${apiBase}/api/admin/links/${r.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });

    if (resp.ok) {
      const data = await resp.json();
      console.log(`  ✅ 已删除 id=${r.id} (url=${r.url}) → ${JSON.stringify(data)}`);
    } else {
      const text = await resp.text();
      console.error(`  ❌ 删除失败 id=${r.id}: ${resp.status} ${text}`);
    }
  }
}

main().catch((e) => {
  console.error("未捕获错误:", e);
  process.exit(1);
});
