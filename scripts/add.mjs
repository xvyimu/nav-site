#!/usr/bin/env node
/**
 * 一键添加链接到旧库，同时触发同步到生产库
 *
 * 用法：
 *   node scripts/add.mjs "站点名" "https://xxx.com" "描述" "分类slug" "icon"
 *
 * 分类 slug：
 *   free-relay  — 公益中转站
 *   big-tech    — 大厂API
 *   oss-model   — 开源模型
 *   gpu         — 算力GPU
 *
 * 示例：
 *   node scripts/add.mjs "某公益站" "https://xxx.com/register" "注册送10刀" free-relay
 *
 * 同时还会自动同步到生产库，无需手动跑 SQL。
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// 读取 .env.local 文件
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

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
用法: node scripts/add.mjs "名称" "URL" "描述" "分类slug" "图标"

分类 slug:
  free-relay  — 公益中转站 🆓
  big-tech    — 大厂API   🏢
  model-ranking — 模型排行榜 🏆

示例:
  node scripts/add.mjs "某站" "https://xxx.com" "描述" free-relay
  node scripts/add.mjs "某站" "https://xxx.com" "" big-tech "🤖"
`);
  process.exit(0);
}

const [title, url, description = "", categorySlug = "free-relay", icon = "🔗"] = args;

// 旧库
const SOURCE_URL = process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL_DEV;
const SOURCE_KEY = process.env.SOURCE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV;

// 新库
const TARGET_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error("❌ 缺少旧库环境变量");
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_KEY);
const target = TARGET_URL && TARGET_KEY ? createClient(TARGET_URL, TARGET_KEY) : null;

async function main() {
  // 1. 查分类
  const { data: cat, error: catErr } = await source
    .from("nav_categories")
    .select("id")
    .eq("slug", categorySlug)
    .single();

  if (catErr || !cat) {
    console.error(`❌ 分类 "${categorySlug}" 不存在，请用 free-relay / big-tech / model-ranking`);
    process.exit(1);
  }

  // 2. 检查是否已存在
  const { data: existing } = await source
    .from("nav_links")
    .select("id")
    .eq("url", url)
    .maybeSingle();

  if (existing) {
    console.log(`⚠️  链接已存在: ${title} (${url})`);
    console.log("   跳过添加。");
    process.exit(0);
  }

  // 3. 写入旧库
  const { data: inserted, error: insertErr } = await source
    .from("nav_links")
    .insert({
      title,
      url,
      description: description || null,
      icon,
      category_id: cat.id,
      approved: true,
      featured: false,
    })
    .select()
    .single();

  if (insertErr) {
    console.error(`❌ 写入旧库失败: ${insertErr.message}`);
    process.exit(1);
  }

  console.log(`✅ 已写入旧库: ${title} → ${categorySlug}`);

  // 4. 同步到新库
  if (target) {
    // 先检查是否已存在
    const { data: existingInTarget } = await target
      .from("nav_links")
      .select("id")
      .eq("url", url)
      .maybeSingle();

    if (!existingInTarget) {
      const { error: syncErr } = await target.from("nav_links").insert(inserted);
      if (syncErr) {
        console.error(`⚠️  同步到生产库失败: ${syncErr.message}`);
        console.log("   可稍后手动执行: node scripts/sync-db.mjs");
      } else {
        console.log(`✅ 已同步到生产库!`);
      }
    } else {
      console.log(`✅ 生产库已存在（跳过）`);
    }
  } else {
    console.log("ℹ️  未配置生产库，跳过同步。");
    console.log("   手动同步: node scripts/sync-db.mjs");
  }

  console.log(`\n🌐 打开 https://yuanjia1314.ccwu.cc 查看效果`);
}

main().catch(console.error);
