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
 *   node scripts/check-links.mjs --json       # 写出 link-health-report.json
 *   node scripts/check-links.mjs --json out.json
 *   node scripts/check-links.mjs --persist    # service_role 写入 open findings（不自动 resolve）
 *
 * 环境变量：
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY   (--persist 需要)
 *   LINK_CHECK_TIMEOUT     (默认 10000 ms)
 *   LINK_CHECK_CONCURRENCY (默认 5)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, isAbsolute, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { buildLinkHealthReport } from "./link-health-report-shape.mjs";
import { loadProjectEnv } from "./lib/load-project-env.mjs";

export { buildLinkHealthReport };

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const TIMEOUT = parseInt(process.env.LINK_CHECK_TIMEOUT || "10000", 10);
const CONCURRENCY = parseInt(process.env.LINK_CHECK_CONCURRENCY || "5", 10);

/** Parse --json [path]; bare --json → link-health-report.json */
function parseJsonFlag(args) {
  const idx = args.indexOf("--json");
  if (idx === -1) return { enabled: false, path: null };
  const next = args[idx + 1];
  if (next && !next.startsWith("--")) {
    return { enabled: true, path: next };
  }
  return { enabled: true, path: "link-health-report.json" };
}

/** 带 timeout 的 fetch */
async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

/**
 * Persist open findings via service_role.
 * Same link_id+kind open row → update; else insert.
 * Does NOT auto-resolve recovered links.
 */
async function persistFindings(report, supabaseUrl) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn(
      "⚠️  --persist 跳过：缺少 SUPABASE_SERVICE_ROLE_KEY 或 NEXT_PUBLIC_SUPABASE_URL"
    );
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = report.generatedAt.slice(0, 10);
  const checkedAt = report.generatedAt;
  let upserted = 0;

  const items = [
    ...report.broken.map((b) => ({
      link_id: b.id || null,
      title: b.title,
      url: b.url,
      http_status: String(b.status),
      detail: b.error ?? null,
      kind: "broken",
    })),
    ...report.redirects.map((r) => ({
      link_id: r.id || null,
      title: r.title,
      url: r.url,
      http_status: String(r.status),
      detail: r.location ?? null,
      kind: "redirect",
    })),
  ];

  for (const item of items) {
    try {
      if (item.link_id) {
        const { data: existing, error: findError } = await admin
          .from("link_health_findings")
          .select("id")
          .eq("link_id", item.link_id)
          .eq("kind", item.kind)
          .is("resolved_at", null)
          .maybeSingle();

        if (findError) {
          console.warn(`⚠️  persist find failed: ${findError.message}`);
          continue;
        }

        if (existing?.id) {
          const { error: updateError } = await admin
            .from("link_health_findings")
            .update({
              title: item.title,
              url: item.url,
              http_status: item.http_status,
              detail: item.detail,
              checked_at: checkedAt,
              run_id: runId,
            })
            .eq("id", existing.id);

          if (updateError) {
            console.warn(`⚠️  persist update failed: ${updateError.message}`);
            continue;
          }
          upserted += 1;
          continue;
        }
      }

      const { error: insertError } = await admin.from("link_health_findings").insert({
        link_id: item.link_id,
        title: item.title,
        url: item.url,
        http_status: item.http_status,
        detail: item.detail,
        kind: item.kind,
        checked_at: checkedAt,
        run_id: runId,
      });

      if (insertError) {
        console.warn(`⚠️  persist insert failed: ${insertError.message}`);
        continue;
      }
      upserted += 1;
    } catch (err) {
      console.warn(`⚠️  persist error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\n💾 --persist: upserted ${upserted}/${items.length} open findings (no auto-resolve)`
  );
}

async function main() {
  loadProjectEnv(projectRoot);

  const argv = process.argv.slice(2);
  const isStrict = argv.includes("--strict");
  const genReport = argv.includes("--report");
  const doPersist = argv.includes("--persist");
  const jsonOpt = parseJsonFlag(argv);

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

  /** 检测单个链接 */
  async function checkLink(link, index, total) {
    const { id, title, url } = link;
    const prefix = `  [${index}/${total}]`;

    let res;
    try {
      res = await fetchWithTimeout(url, { method: "HEAD" });
    } catch (err) {
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
      console.log(`${prefix} 🔶 ${title} — ${status} (可能被反爬) — 视为正常`);
      OK_COUNT.ok++;
    } else {
      BROKEN.push({ id, title, url, status, error: `HTTP ${status}` });
      console.log(`${prefix} ❌ ${title} — HTTP ${status}`);
    }
  }

  console.log(`========================================`);
  console.log(`  导航站链接健康度检查`);
  console.log(`  模式: ${isStrict ? "严格 (HEAD+GET)" : "标准 (HEAD)"}`);
  console.log(`  超时: ${TIMEOUT}ms | 并发: ${CONCURRENCY}`);
  console.log(`========================================\n`);

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
    const emptyReport = buildLinkHealthReport({
      total: 0,
      ok: 0,
      broken: [],
      redirects: [],
    });
    if (jsonOpt.enabled) {
      const outPath = isAbsolute(jsonOpt.path)
        ? jsonOpt.path
        : join(process.cwd(), jsonOpt.path);
      writeFileSync(outPath, JSON.stringify(emptyReport, null, 2), "utf-8");
      console.log(`\n📦 JSON 报告: ${outPath}`);
    }
    return;
  }

  OK_COUNT.total = links.length;
  console.log(`📊 共 ${links.length} 个链接需要检查\n`);

  let idx = 0;

  async function worker() {
    while (idx < links.length) {
      const currentIdx = idx;
      const link = links[idx];
      idx++;
      await checkLink(link, currentIdx + 1, OK_COUNT.total);
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, links.length) },
    () => worker()
  );
  await Promise.all(workers);

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
      console.log(
        `    ${b.status === "FETCH_ERR" ? `错误: ${b.error}` : `状态码: ${b.status}`}`
      );
    }
  }

  if (REDIRECTS.length > 0) {
    console.log(`\n⚠️  重定向链接:`);
    for (const r of REDIRECTS) {
      console.log(`  • ${r.title} (${r.url})`);
      console.log(`    ${r.status} → ${truncate(r.location, 80)}`);
    }
  }

  const reportObj = buildLinkHealthReport({
    total: OK_COUNT.total,
    ok: OK_COUNT.ok,
    broken: BROKEN,
    redirects: REDIRECTS,
  });

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
        report.push(
          `| ${b.title} | \`${b.url}\` | ${
            b.status === "FETCH_ERR" ? b.error : `HTTP ${b.status}`
          } |`
        );
      }
      report.push(``);
    }

    if (REDIRECTS.length > 0) {
      report.push(`## ⚠️  重定向链接`, ``);
      report.push(`| 标题 | URL | 状态 | 目标 |`);
      report.push(`|------|-----|:----:|------|`);
      for (const r of REDIRECTS) {
        report.push(
          `| ${r.title} | \`${r.url}\` | ${r.status} | \`${truncate(r.location, 80)}\` |`
        );
      }
      report.push(``);
    }

    const reportPath = `link-check-report-${date}.md`;
    writeFileSync(reportPath, report.join("\n"), "utf-8");
    console.log(`\n📝 报告已保存: ${reportPath}`);
  }

  if (jsonOpt.enabled) {
    const outPath = isAbsolute(jsonOpt.path)
      ? jsonOpt.path
      : join(process.cwd(), jsonOpt.path);
    writeFileSync(outPath, JSON.stringify(reportObj, null, 2), "utf-8");
    console.log(`\n📦 JSON 报告: ${outPath}`);
  }

  // persist 失败只 warn；exit 码仍仅由 BROKEN 决定
  if (doPersist) {
    await persistFindings(reportObj, SUPABASE_URL);
  }

  if (BROKEN.length > 0) {
    process.exit(2);
  }
}

const isDirectRun = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectRun) {
  main().catch((err) => {
    console.error("脚本异常:", err);
    process.exit(1);
  });
}
