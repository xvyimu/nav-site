#!/usr/bin/env node
/**
 * 双库数据同步脚本
 *
 * 自动将旧库（开发）的新数据同步到新库（生产）
 * 可手动运行、定时运行、或作为 Vercel Cron Job
 *
 * 用法：
 *   node scripts/sync-db.mjs              # 同步所有数据
 *   node scripts/sync-db.mjs --dry-run    # 仅查看差异不写入
 *
 * 环境变量：
 *   SOURCE_SUPABASE_URL / SOURCE_SUPABASE_ANON_KEY  (旧库)
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY  (新库/生产)
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

const isDryRun = process.argv.includes("--dry-run");
const shouldDedupe = !process.argv.includes("--no-dedupe");

// 旧库（源）
const SOURCE_URL =
  process.env.SOURCE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL_DEV;
const SOURCE_KEY =
  process.env.SOURCE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV;

// 新库（目标）
const TARGET_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
  console.error("❌ 缺少环境变量，请检查 SUPABASE 配置");
  process.exit(1);
}

const source = createClient(SOURCE_URL, SOURCE_KEY);
const target = createClient(TARGET_URL, TARGET_KEY);

async function syncTable(table, idCol = "id") {
  console.log(`\n📋 同步表: ${table}`);

  // 1. 读取源库
  const { data: sourceData, error: srcErr } = await source
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (srcErr) {
    console.error(`  ❌ 读取源库失败: ${srcErr.message}`);
    return 0;
  }
  console.log(`  📤 源库: ${sourceData.length} 条`);

  // 2. 读取目标库（用 * 来兼容 PROD/DEV 可能不同的 schema）
  const { data: targetData, error: tgtErr } = await target
    .from(table)
    .select("*");

  if (tgtErr) {
    console.error(`  ❌ 读取目标库失败: ${tgtErr.message}`);
    return 0;
  }
  console.log(`  📥 目标库: ${targetData.length} 条`);

  // 3. 构建目标记录集合（用于去重）
  const targetDedupSet = new Set();
  const targetIdSet = new Set();
  for (const item of targetData || []) {
    if (item[idCol]) targetDedupSet.add(item[idCol]);
    targetIdSet.add(item.id);
  }

  // 4. 构建源 ID 集合，并找出需要新增的记录
  const toInsert = [];
  const sourceIdSet = new Set();
  for (const item of sourceData) {
    sourceIdSet.add(item.id);
    if (shouldDedupe && (targetDedupSet.has(item[idCol]) || targetIdSet.has(item.id))) {
      continue;
    }
    toInsert.push(item);
  }

  // 5. 找出目标库中不再存在于源库的旧记录（需要清理的孤儿记录）
  const toDelete = [];
  for (const item of targetData || []) {
    if (!sourceIdSet.has(item.id)) {
      toDelete.push(item.id);
      // 从去重集中移除，防止孤儿删除后同条目的新版本被跳过
      if (item[idCol]) targetDedupSet.delete(item[idCol]);
      targetIdSet.delete(item.id);
    }
  }

  // 6. 先删除孤儿记录
  if (toDelete.length > 0) {
    console.log(`  🗑️ 待清理: ${toDelete.length} 条`);

    if (!isDryRun) {
      // 分批删除，避免 SQL 过长
      let deleted = 0;
      for (let i = 0; i < toDelete.length; i += 10) {
        const batch = toDelete.slice(i, i + 10);
        const { error: delErr } = await target
          .from(table)
          .delete()
          .in("id", batch);
        if (delErr) {
          console.error(`  ❌ 第 ${i / 10 + 1} 批删除失败: ${delErr.message}`);
        } else {
          deleted += batch.length;
        }
      }
      console.log(`  ✅ 实际清理: ${deleted} 条`);
    } else {
      console.log(`  👁️ (DRY RUN - 未实际删除)`);
      for (const id of toDelete.slice(0, 5)) {
        const item = targetData.find(d => d.id === id);
        console.log(`    - ${item?.title || id}`);
      }
      if (toDelete.length > 5) {
        console.log(`    ... 还有 ${toDelete.length - 5} 条`);
      }
    }
  } else {
    console.log(`  ✅ 无孤儿记录`);
  }

  if (toInsert.length === 0) {
    console.log(`  ✅ 已是最新，无新增`);
    return toDelete.length > 0 ? toDelete.length : 0;
  }
  console.log(`  ➕ 待同步: ${toInsert.length} 条`);

  if (isDryRun) {
    console.log(`  👁️  (DRY RUN - 未实际写入)`);
    for (const item of toInsert.slice(0, 5)) {
      console.log(`    - ${item.title} (${item.url})`);
    }
    if (toInsert.length > 5) {
      console.log(`    ... 还有 ${toInsert.length - 5} 条`);
    }
    return toInsert.length;
  }

  // 5. 分批写入目标库（使用 insert 而非 upsert）
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 10) {
    const batch = toInsert.slice(i, i + 10);
    const { error: insErr } = await target.from(table).insert(batch);
    if (insErr) {
      console.error(`  ❌ 第 ${i / 10 + 1} 批写入失败: ${insErr.message}`);
    } else {
      inserted += batch.length;
    }
  }
  console.log(`  ✅ 实际写入: ${inserted} 条`);
  return inserted;
}

async function main() {
  console.log(`========================================`);
  console.log(`  公益API导航站 - 双库同步`);
  console.log(`  源: ${SOURCE_URL.slice(0, 40)}...`);
  console.log(`  目标: ${TARGET_URL.slice(0, 40)}...`);
  console.log(`  模式: ${isDryRun ? "👁️ DRY RUN" : "🚀 实际写入"}`);
  console.log(`========================================`);

  // 先同步分类（保持 ID 一致）
  const catCount = await syncTable("nav_categories", "id");

  // 再同步链接
  const linkCount = await syncTable("nav_links", "url");

  // 同步模型排行榜（按 id 去重）
  const rankCount = await syncTable("model_rankings", "id");

  console.log(`\n📊 汇总: 分类 ${catCount} 条, 链接 ${linkCount} 条, 排行榜 ${rankCount} 条`);

  if (!isDryRun && (catCount > 0 || linkCount > 0 || rankCount > 0)) {
    console.log(`\n✅ 同步完成! 新数据已写入生产库。`);
  } else if (isDryRun) {
    console.log(`\n👁️ DRY RUN 完成。移除 --dry-run 即可实际写入。`);
  }
}

main().catch((err) => {
  console.error("同步脚本异常:", err);
  process.exit(1);
});
