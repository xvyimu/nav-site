#!/usr/bin/env node
/**
 * 链接健康度检查脚本
 *
 * 遍历所有已批准的导航链接，检查每个 URL 是否可用，
 * 对失败/重定向的链接输出诊断报告。
 *
 * 用法：
 *   node scripts/check-links.mjs              # 正常检测
 *   node scripts/check-links.mjs --strict     # HEAD 失败后用 GET 重试
 *   node scripts/check-links.mjs --report     # 同时生成 Markdown 报告文件
 *
 * 环境变量：
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   LINK_CHECK_TIMEOUT     (默认 10000 ms)
 *   LINK_CHECK_CONCURRENCY (默认 5)
 */

import { createClient } from "@supabase/supabase-js";

const TIMEOUT = parseInt(process.env.LINK_CHECK_TIMEOUT || "10000", 10);
const CONCURRENCY = parseInt(process.env.LINK_CHECK_CONCURRENCY || "5", 10);
const isStrict = process.argv.includes("--strict");
const genReport = process.argv.includes("--report");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ 缺少环境变量 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BROKEN = [];
const REDIRECTS = [];
const OK_COUNT = { total: 0, ok: 0 };
const START = Date.now();

/** 带 timeout 的 fetch */
async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 检测单个链接 */
async function checkLink(link, index, total) {
  const { id, title, url } = link;
  const prefix = `  [${index}/${total}]`;

  // 1. HEAD 请求
  let res;
  try {
    res = await fetchWithTimeout(url, { method: "HEAD" });
  } catch (err) {
    // HEAD 失败，要不要用 GET 重试？
    if (isStrict) {
      try {
        res = await fetchWithTimeout(url, { method: "GET" });
      } catch (err2) {
        BROKEN.push({ id, title, url, status: "FETCH_ERR", error: err2.message });
        console.log(`${prefix} ❌ ${title} — 连接失败: ${err2.message}`);
        return;
      }
    } else {
      BROKEN.push({ id, title, url, status: "FETCH_ERR", error: err.message });
      console.log(`${prefix} ❌ ${title} — 连接失败: ${err.message}`);
      return;
    }
  }

  const status = res.status;

  if (status >= 200 && status < 400) {
    if (status >= 300 && status < 400) {
      const location = res.headers.get("location") || "(无 location 头)";
      REDIRECTS.push({ id, title, url, status, location });
      console.log(`${prefix} ⚠️  ${title} — ${status} → ${truncate(location, 60)}`);
    } else {
      OK_COUNT.ok++;
    }
  } else if (status === 403 || status === 429) {
    // 被拒绝访问 / 频率限制 — 不算链接本身坏了
    console.log(`${prefix} 🔶 ${title} — ${status} (可能被反爬) — 视为正常`);
    OK_COUNT.ok++;
  } else {
    BROKEN.push({ id, title, url, status, error: `HTTP ${status}` });
    console.log(`${prefix} ❌ ${title} — HTTP ${status}`);
  }
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

async function main() {
  console.log(`========================================`);
  console.log(`  导航站链接健康度检查`);
  console.log(`  模式: ${isStrict ? "严格 (HEAD+GET)" : "标准 (HEAD)"}`);
  console.log(`  超时: ${TIMEOUT}ms | 并发: ${CONCURRENCY}`);
  console.log(`========================================\n`);

  // 1. 获取所有已批准链接
  const { data: links, error } = await supabase
    .from("nav_links")
    .select("id, title, url")
    .eq("approved", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(`❌ 查询链接失败: ${error.message}`);
    process.exit(1);
  }

  if (!links || links.length === 0) {
    console.log("没有找到已批准的链接");
    return;
  }

  OK_COUNT.total = links.length;
  console.log(`📊 共 ${links.length} 个链接需要检查\n`);

  // 2. 并发检测（限流）
  const queue = [...links];
  const running = [];

  while (queue.length || running.length) {
    while (running.length < CONCURRENCY && queue.length) {
      const link = queue.shift();
      const idx = OK_COUNT.total - queue.length;
      const p = checkLink(link, idx, OK_COUNT.total).finally(() => {
        const i = running.indexOf(p);
        if (i > -1) running.splice(i, 1);
      });
      running.push(p);
    }
    if (running.length) {
      await Promise.race(running);
    }
  }

  // 3. 汇总
  const elapsed = ((Date.now() - START) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`  📊 检查完成 (${elapsed}s)`);
  console.log(`  ✅ 正常: ${OK_COUNT.ok}/${OK_COUNT.total}`);
  console.log(`  ⚠️  重定向: ${REDIRECTS.length}`);
  console.log(`  ❌ 异常: ${BROKEN.length}`);

  if (BROKEN.length > 0) {
    console.log(`\n❌ 异常链接:`);
    for (const b of BROKEN) {
      console.log(`  • ${b.title} (${b.url})`);
      console.log(`    ${b.status === "FETCH_ERR" ? `错误: ${b.error}` : `状态码: ${b.status}`}`);
    }
  }

  if (REDIRECTS.length > 0) {
    console.log(`\n⚠️  重定向链接:`);
    for (const r of REDIRECTS) {
      console.log(`  • ${r.title} (${r.url})`);
      console.log(`    ${r.status} → ${truncate(r.location, 80)}`);
    }
  }

  // 4. 可选：生成 Markdown 报告
  if (genReport) {
    const date = new Date().toISOString().slice(0, 10);
    const report = [
      `# 链接健康度报告 · ${date}`,
      ``,
      `| 指标 | 数值 |`,
      `|------|:----:|`,
      `| 总计 | ${OK_COUNT.total} |`,
      `| 正常 | ${OK_COUNT.ok} |`,
      `| 重定向 | ${REDIRECTS.length} |`,
      `| 异常 | ${BROKEN.length} |`,
      `| 耗时 | ${elapsed}s |`,
      ``,
    ];

    if (BROKEN.length > 0) {
      report.push(`## ❌ 异常链接`, ``);
      report.push(`| 标题 | URL | 状态 |`);
      report.push(`|------|-----|:----:|`);
      for (const b of BROKEN) {
        report.push(`| ${b.title} | \`${b.url}\` | ${b.status === "FETCH_ERR" ? b.error : `HTTP ${b.status}`} |`);
      }
      report.push(``);
    }

    if (REDIRECTS.length > 0) {
      report.push(`## ⚠️  重定向链接`, ``);
      report.push(`| 标题 | URL | 状态 | 目标 |`);
      report.push(`|------|-----|:----:|------|`);
      for (const r of REDIRECTS) {
        report.push(`| ${r.title} | \`${r.url}\` | ${r.status} | \`${truncate(r.location, 80)}\` |`);
      }
      report.push(``);
    }

    const reportPath = `link-check-report-${date}.md`;
    const fs = await import("fs");
    fs.writeFileSync(reportPath, report.join("\n"), "utf-8");
    console.log(`\n📝 报告已保存: ${reportPath}`);
  }

  // 异常链接 > 0 时以非零退出
  if (BROKEN.length > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
