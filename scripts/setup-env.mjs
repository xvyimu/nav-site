#!/usr/bin/env node
/**
 * 环境配置初始化脚本
 *
 * 从 .env.local.example 复制模板，引导填入真实值。
 * 用法：node scripts/setup-env.mjs
 *       npm run setup
 */

import { readFileSync, existsSync, copyFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const template = join(projectRoot, ".env.local.example");
const target = join(projectRoot, ".env.local");

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(q) {
  return new Promise((r) => rl.question(q, r));
}

async function main() {
  console.log("========================================");
  console.log("  公益API导航站 - 环境配置初始化");
  console.log("========================================\n");

  if (!existsSync(template)) {
    console.error("❌ 未找到 .env.local.example，请确保在项目根目录运行。");
    process.exit(1);
  }

  if (existsSync(target)) {
    const ans = await ask("⚠️  .env.local 已存在，覆盖？(y/N) ");
    if (ans.toLowerCase() !== "y") {
      console.log("取消。");
      process.exit(0);
    }
  }

  copyFileSync(template, target);
  console.log("✅ 已从模板创建 .env.local\n");
  console.log("接下来需要填入以下关键信息：\n");

  const required = [
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "生产库 Supabase anon key" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV", label: "开发库 Supabase anon key" },
    { key: "ADMIN_PASSWORD", label: "管理面板密码" },
    { key: "NEXT_PUBLIC_SITE_URL", label: "站点 URL" },
  ];

  const env = readFileSync(target, "utf-8").split("\n");

  for (const { key, label } of required) {
    const val = await ask(`  ${label} (${key}): `);
    if (val.trim()) {
      const idx = env.findIndex((l) => l.startsWith(key + "="));
      if (idx !== -1) env[idx] = `${key}=${val.trim()}`;
    }
  }

  // Write back
  writeFileSync(target, env.join("\n"), "utf-8");
  console.log("\n✅ 配置写入完成。\n");

  rl.close();
}

main().catch((e) => {
  console.error(e);
  rl.close();
  process.exit(1);
});