#!/usr/bin/env node
/**
 * 综合导航站 — 批量录入脚本（半自动）
 *
 * 从 JSON 文件批量导入站点到 Supabase，支持：
 *   - 自动 slug 生成（与 lib/slugify.ts 一致）
 *   - URL 去重
 *   - 分类自动匹配
 *   - dry-run 预览模式
 *   - 批量插入（单次 API 调用）
 *
 * 用法：
 *   node scripts/bulk-add.mjs data.json              # 正式导入
 *   node scripts/bulk-add.mjs data.json --dry-run    # 预览模式
 *   node scripts/bulk-add.mjs data.json --featured    # 标记为精选
 *
 * JSON 格式：
 *   [
 *     {
 *       "title": "站点名称",
 *       "url": "https://example.com",
 *       "description": "简短描述",
 *       "category": "cloud-vps",        // 分类 slug
 *       "icon": "🔗",                    // 可选，默认 🔗
 *       "paid": false,                   // 可选，默认 false
 *       "featured": false                // 可选，默认 false
 *     }
 *   ]
 *
 * 也可以从简单列表导入（每行一个 URL，自动提取标题）：
 *   node scripts/bulk-add.mjs urls.txt --auto-title
 *
 * urls.txt 格式：
 *   https://railway.app
 *   https://vercel.com
 *   https://netlify.com
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
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

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const defaultFeatured = args.includes("--featured");
const autoTitle = args.includes("--auto-title");
const fileArg = args.find((a) => !a.startsWith("--"));

if (!fileArg) {
  console.log(`
用法:
  node scripts/bulk-add.mjs <file> [选项]

选项:
  --dry-run     预览模式，不写入数据库
  --featured    将所有条目标记为精选
  --auto-title  从 URL 自动提取标题（适用于纯 URL 列表）

文件格式:
  JSON: [{ "title": "...", "url": "...", "description": "...", "category": "..." }]
  TXT:  每行一个 URL（需配合 --auto-title）

示例:
  node scripts/bulk-add.mjs sites.json
  node scripts/bulk-add.mjs sites.json --dry-run
  node scripts/bulk-add.mjs urls.txt --auto-title
`);
  process.exit(0);
}

const filePath = join(process.cwd(), fileArg);
if (!existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── 解析输入文件 ──
function parseInput(filePath, autoTitle) {
  const content = readFileSync(filePath, "utf-8");

  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }

  // TXT 模式：每行一个 URL
  if (autoTitle) {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.startsWith("http"))
      .map((url) => {
        let title;
        try {
          const hostname = new URL(url).hostname.replace(/^www\./, "");
          title = hostname.split(".")[0];
          title = title.charAt(0).toUpperCase() + title.slice(1);
        } catch {
          title = url;
        }
        return { title, url, description: "", category: "dev-tools" };
      });
  }

  console.error("TXT 文件需要 --auto-title 选项");
  process.exit(1);
}

// ── 主流程 ──
async function main() {
  const items = parseInput(filePath, autoTitle);

  console.log(`\n=== 批量导入 ===`);
  console.log(`文件: ${fileArg}`);
  console.log(`条目数: ${items.length}`);
  console.log(`模式: ${dryRun ? "预览（dry-run）" : "正式导入"}`);
  console.log(`默认精选: ${defaultFeatured ? "是" : "否"}\n`);

  if (items.length === 0) {
    console.log("没有条目可导入");
    return;
  }

  // 1. 获取分类映射
  const { data: categories, error: catErr } = await supabase
    .from("nav_categories")
    .select("id, slug, name");

  if (catErr || !categories) {
    console.error("获取分类失败:", catErr?.message);
    process.exit(1);
  }

  const catMap = new Map(categories.map((c) => [c.slug, c]));

  // 2. 获取已有 URL 列表（去重）
  const { data: existing } = await supabase
    .from("nav_links")
    .select("url")
    .eq("approved", true);

  const existingUrls = new Set((existing ?? []).map((l) => l.url));

  // 3. 处理每条数据
  const toInsert = [];
  const skipped = [];

  for (const item of items) {
    if (!item.url || !item.title) {
      skipped.push({ ...item, reason: "缺少 url 或 title" });
      continue;
    }

    if (existingUrls.has(item.url)) {
      skipped.push({ ...item, reason: "URL 已存在" });
      continue;
    }

    const cat = item.category ? catMap.get(item.category) : null;
    if (item.category && !cat) {
      skipped.push({ ...item, reason: `分类 "${item.category}" 不存在` });
      continue;
    }

    toInsert.push({
      title: item.title,
      url: item.url,
      description: item.description || null,
      icon: item.icon || "🔗",
      category_id: cat?.id || null,
      approved: true,
      paid: item.paid ?? false,
      featured: item.featured ?? defaultFeatured,
    });
  }

  // 4. 输出预览
  if (toInsert.length > 0) {
    console.log("── 待导入 ──");
    for (const item of toInsert) {
      const catName = categories.find((c) => c.id === item.category_id)?.name || "未分类";
      console.log(`  ${item.title}  →  ${catName}`);
    }
    console.log(`\n共 ${toInsert.length} 条待导入`);
  }

  if (skipped.length > 0) {
    console.log("\n── 跳过 ──");
    for (const item of skipped) {
      console.log(`  ${item.title || item.url}  —  ${item.reason}`);
    }
    console.log(`\n共 ${skipped.length} 条跳过`);
  }

  if (dryRun) {
    console.log("\n预览模式，未写入数据库。去掉 --dry-run 正式导入。");
    return;
  }

  if (toInsert.length === 0) {
    console.log("\n没有需要导入的条目");
    return;
  }

  // 5. 批量插入
  const { error: insertErr } = await supabase
    .from("nav_links")
    .insert(toInsert);

  if (insertErr) {
    console.error("\n批量插入失败:", insertErr.message);
    console.log("\n尝试逐条插入...");

    let success = 0;
    for (const item of toInsert) {
      const { error } = await supabase.from("nav_links").insert(item);
      if (error) {
        console.error(`  失败: ${item.title} — ${error.message}`);
      } else {
        success++;
      }
    }
    console.log(`\n逐条插入完成: ${success}/${toInsert.length} 成功`);
  } else {
    console.log(`\n✅ 成功导入 ${toInsert.length} 条！`);
  }
}

main().catch(console.error);
