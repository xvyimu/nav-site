#!/usr/bin/env node
/**
 * Bundle 体积摘要提取脚本
 *
 * 从 .next/analyze/ 目录的 HTML 报告中提取 chunk 清单，
 * 输出 JSON 摘要用于后续 PR 对比与基线追踪。
 *
 * 用法：
 *   pnpm analyze              # 先跑 analyzer 生成 HTML 报告
 *   node scripts/extract-bundle-stats.mjs  # 提取并写入 docs/perf/
 *
 * 详见 docs/superpowers/specs/2026-06-29-performance-optimization-design.md §3.1 管线 A
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ANALYZE_DIR = ".next/analyze";
const PERF_DIR = "docs/perf";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 从 HTML 报告中提取 chunk 信息。
 * bundle-analyzer 的 HTML 是 webpack-bundle-analyzer 生成，
 * 数据嵌入在 <script> 标签的 window.chartData = {...} 中。
 */
function extractChunksFromHtml(html) {
  // 匹配 window.chartData = {...};
  const match = html.match(/window\.chartData\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data;
  } catch {
    return null;
  }
}

/**
 * 递归遍历 chartData 树，收集所有叶子节点的 chunk 信息
 */
function walkTree(node, parentPath = "", acc = []) {
  if (!node) return acc;
  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      walkTree(child, currentPath, acc);
    }
  } else {
    // 叶子节点
    acc.push({
      path: currentPath,
      size: node.size || 0,
      sizeFormatted: formatBytes(node.size || 0),
    });
  }
  return acc;
}

async function main() {
  if (!existsSync(ANALYZE_DIR)) {
    console.error(`✗ 未找到 ${ANALYZE_DIR}，请先运行 \`pnpm analyze\``);
    process.exit(1);
  }

  const files = await readdir(ANALYZE_DIR);
  const htmlFiles = files.filter((f) => f.endsWith(".html"));

  if (htmlFiles.length === 0) {
    console.error(`✗ ${ANALYZE_DIR} 中没有 HTML 报告`);
    process.exit(1);
  }

  console.log(`发现 ${htmlFiles.length} 个 bundle 报告：`);

  const summary = {
    timestamp: new Date().toISOString(),
    reports: [],
  };

  for (const file of htmlFiles) {
    const filePath = join(ANALYZE_DIR, file);
    const html = await readFile(filePath, "utf-8");
    const chartData = extractChunksFromHtml(html);

    if (!chartData) {
      console.log(`  ⚠ ${file} — 无法解析 chartData，跳过`);
      continue;
    }

    // chartData 可能是数组或单个对象
    const trees = Array.isArray(chartData) ? chartData : [chartData];
    let totalSize = 0;
    const chunks = [];

    for (const tree of trees) {
      const leaves = walkTree(tree);
      for (const leaf of leaves) {
        totalSize += leaf.size;
        chunks.push(leaf);
      }
    }

    // 按 size 降序排序，取 top 20
    chunks.sort((a, b) => b.size - a.size);
    const topChunks = chunks.slice(0, 20);

    console.log(`  ✓ ${file} — 总计 ${formatBytes(totalSize)}, top ${topChunks.length} chunks`);

    summary.reports.push({
      file,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      chunkCount: chunks.length,
      topChunks,
    });
  }

  // 写入 docs/perf/
  if (!existsSync(PERF_DIR)) {
    await mkdir(PERF_DIR, { recursive: true });
  }

  const date = new Date().toISOString().slice(0, 10);
  const outputPath = join(PERF_DIR, `baseline-bundle-${date}.json`);
  await writeFile(outputPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\n✓ 摘要已写入 ${outputPath}`);
  console.log(`  提示：将该文件提交到 git 以建立基线，后续 PR 可对比差异`);
}

main().catch((err) => {
  console.error("✗ 提取失败:", err);
  process.exit(1);
});
