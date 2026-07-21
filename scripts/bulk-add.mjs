#!/usr/bin/env node
/**
 * 综合导航站 — 批量录入脚本（半自动）
 *
 * 从 JSON / Netscape 书签 HTML / TXT 批量导入站点到 Supabase，支持：
 *   - 自动 slug 生成（与 lib/slugify.ts 一致）
 *   - URL 去重
 *   - 分类自动匹配
 *   - dry-run 预览模式
 *   - 批量插入（单次 API 调用）
 *   - 浏览器导出书签 HTML → bulk JSON（可选 --out）
 *
 * 用法：
 *   node scripts/bulk-add.mjs data.json              # 正式导入
 *   node scripts/bulk-add.mjs data.json --dry-run    # 预览模式
 *   node scripts/bulk-add.mjs data.json --featured    # 标记为精选
 *   node scripts/bulk-add.mjs bookmarks.html --dry-run --default-category dev-tools
 *   node scripts/bulk-add.mjs bookmarks.html --out tmp.json --dry-run
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
 * Netscape HTML：Chrome/Edge/Firefox「导出书签」.html
 *   - 仅 http(s)；忽略 javascript: / 空 href
 *   - 书签夹名写入 description（「来自书签夹: …」），分类用 --default-category
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
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  isNetscapeBookmarkHtml,
  parseNetscapeBookmarks,
} from "./lib/parse-netscape-bookmarks.mjs";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

loadProjectEnv(projectRoot);

/**
 * @param {string[]} argv
 * @param {string} name e.g. "--default-category"
 * @returns {string | undefined}
 */
function getFlagValue(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const defaultFeatured = args.includes("--featured");
const autoTitle = args.includes("--auto-title");
const defaultCategory =
  getFlagValue(args, "--default-category") || "dev-tools";
const outPath = getFlagValue(args, "--out");

// First non-flag that is not a value of a known flag
function resolveFileArg(argv) {
  const valueFlags = new Set(["--default-category", "--out"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      if (valueFlags.has(a)) i += 1;
      continue;
    }
    return a;
  }
  return undefined;
}

const inputFile = resolveFileArg(args);

if (!inputFile) {
  console.log(`
用法:
  node scripts/bulk-add.mjs <file> [选项]

选项:
  --dry-run                 预览模式，不写入数据库
  --featured                将所有条目标记为精选
  --auto-title              从 URL 自动提取标题（适用于纯 URL 列表）
  --default-category <slug>  HTML/TXT 无 category 时使用（默认 dev-tools）
  --out <path.json>         只写出 bulk JSON（可与 --dry-run 同用）

文件格式:
  JSON: [{ "title": "...", "url": "...", "description": "...", "category": "..." }]
  HTML: Netscape 书签导出（.html / .htm）
  TXT:  每行一个 URL（需配合 --auto-title）

示例:
  node scripts/bulk-add.mjs sites.json
  node scripts/bulk-add.mjs sites.json --dry-run
  node scripts/bulk-add.mjs urls.txt --auto-title
  node scripts/bulk-add.mjs bookmarks.html --dry-run --default-category dev-tools
  node scripts/bulk-add.mjs bookmarks.html --out tmp-from-bookmarks.json --dry-run
`);
  process.exit(0);
}

const filePath = join(process.cwd(), inputFile);
if (!existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
  process.exit(1);
}

/**
 * Map Netscape parse result → bulk-add item shape.
 * @param {Array<{ title: string, url: string, description?: string, folder?: string }>} bookmarks
 * @param {string} categorySlug
 */
function mapBookmarksToBulk(bookmarks, categorySlug) {
  return bookmarks.map((b) => ({
    title: b.title,
    url: b.url,
    description: b.folder
      ? `来自书签夹: ${b.folder}`
      : b.description || "",
    category: categorySlug,
  }));
}

// ── 解析输入文件 ──
/**
 * @param {string} path
 * @param {boolean} autoTitleMode
 * @param {string} categorySlug
 */
function parseInput(path, autoTitleMode, categorySlug) {
  const content = readFileSync(path, "utf-8");
  const lower = path.toLowerCase();

  if (lower.endsWith(".json")) {
    return JSON.parse(content);
  }

  const looksHtml =
    lower.endsWith(".html") ||
    lower.endsWith(".htm") ||
    isNetscapeBookmarkHtml(content);

  if (looksHtml) {
    const bookmarks = parseNetscapeBookmarks(content);
    return mapBookmarksToBulk(bookmarks, categorySlug);
  }

  // TXT 模式：每行一个 URL
  if (autoTitleMode) {
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
        return {
          title,
          url,
          description: "",
          category: categorySlug,
        };
      });
  }

  console.error(
    "无法识别输入：JSON / Netscape HTML(.html) / 或 TXT+--auto-title",
  );
  process.exit(1);
}

// ── 主流程 ──
async function main() {
  const items = parseInput(filePath, autoTitle, defaultCategory);

  console.log(`\n=== 批量导入 ===`);
  console.log(`文件: ${inputFile}`);
  console.log(`条目数: ${items.length}`);
  console.log(`默认分类: ${defaultCategory}`);
  console.log(`模式: ${dryRun ? "预览（dry-run）" : "正式导入"}`);
  console.log(`默认精选: ${defaultFeatured ? "是" : "否"}`);
  if (outPath) console.log(`写出 JSON: ${outPath}`);
  console.log("");

  if (outPath) {
    const absOut = join(process.cwd(), outPath);
    writeFileSync(absOut, JSON.stringify(items, null, 2) + "\n", "utf-8");
    console.log(`已写出 bulk JSON: ${absOut}（${items.length} 条）`);
    // --out = convert only, never write DB (review JSON then import without --out)
    console.log("\n--out 模式：仅写出 JSON，不导入。确认后可用：");
    console.log(`  node scripts/bulk-add.mjs ${outPath}${dryRun ? " --dry-run" : ""}`);
    return;
  }

  if (items.length === 0) {
    console.log("没有条目可导入");
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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
    console.log(`\n成功导入 ${toInsert.length} 条！`);
  }
}

main().catch(console.error);
