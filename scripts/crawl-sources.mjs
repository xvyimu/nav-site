#!/usr/bin/env node
/**
 * 公益API导航站 - 爬虫脚本
 *
 * 从多个源站爬取公益API中转站数据，写入 Supabase。
 *
 * 用法:
 *   node scripts/crawl-sources.mjs
 *
 * 定时执行（Vercel Cron）:
 *   改为 API 路由后部署，vercel.json 配置 `"cron": "0 *\\/6 * * *"`
 */

import { createClient } from "@supabase/supabase-js";

// 从环境变量读取
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("缺少 SUPABASE 环境变量");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 源站配置
const SOURCES = [
  {
    name: "freetokennav",
    url: "https://freetokennav.com",
    category: "free-relay",
  },
  {
    name: "link.hcnsec",
    url: "https://link.hcnsec.cn",
    category: "big-tech",
  },
  {
    name: "free.52ccl",
    url: "https://free.52ccl.cn",
    category: "free-relay",
  },
];

async function crawlSource(source) {
  console.log(`[${source.name}] 开始爬取 ${source.url}...`);

  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    console.log(`[${source.name}] 获取到 ${html.length} 字符`);

    // 提取链接数据 - 通用正则
    const links = [];

    // 1. 查找所有 /go/?url= 跳转链接 (freetokennav 格式)
    const goUrlRegex = /\/go\/\?url=([a-zA-Z0-9+/=]+)/g;
    let match;
    while ((match = goUrlRegex.exec(html)) !== null) {
      try {
        const decoded = atob(match[1]);
        if (decoded.startsWith("http")) links.push(decoded);
      } catch {}
    }

    // 2. 查找所有直接 a 标签链接
    const aTagRegex = /<a[^>]*href=["'](https?:\/\/(?:[^"']*?))["'][^>]*>(.+?)<\/a>/g;
    while ((match = aTagRegex.exec(html)) !== null) {
      const [, url, text] = match;
      const cleanText = text.replace(/<[^>]+>/g, "").trim();
      if (cleanText && cleanText.length > 1 && !url.includes("beian") && !url.includes("gov.cn")) {
        links.push({ url, text: cleanText });
      }
    }

    // 3. 提取页面中所有链接
    const allLinks = html.match(/https?:\/\/[^\s"'>]+/g) || [];

    console.log(`[${source.name}] 找到 ${allLinks.length} 个链接`);
    return { html, links: allLinks, source: source.name };
  } catch (err) {
    console.error(`[${source.name}] 爬取失败: ${err.message}`);
    return null;
  }
}

async function saveToDatabase(entries, categorySlug) {
  // 获取分类 ID
  const { data: cat } = await supabase
    .from("nav_categories")
    .select("id")
    .eq("slug", categorySlug)
    .single();

  if (!cat) {
    console.error(`分类 ${categorySlug} 不存在`);
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    if (!entry.url || !entry.url.startsWith("http")) continue;

    // 去重检查
    const { data: existing } = await supabase
      .from("nav_links")
      .select("id")
      .eq("url", entry.url)
      .maybeSingle();

    if (existing) {
      // 已存在，跳过
      continue;
    }

    const { error } = await supabase.from("nav_links").insert({
      title: entry.title || entry.text || entry.url.split("/")[2] || "未知",
      url: entry.url,
      description: entry.description || "",
      icon: "🔗",
      category_id: cat.id,
      approved: false, // 新爬取的默认未审核
      featured: false,
    });

    if (!error) count++;
  }

  return count;
}

async function main() {
  console.log("=== 公益API导航站爬虫 ===");
  console.log(`目标数据库: ${supabaseUrl}`);
  console.log(`源站数: ${SOURCES.length}\n`);

  let total = 0;

  for (const source of SOURCES) {
    const result = await crawlSource(source);
    if (!result) continue;

    // 提取有意义的外部链接
    const externalLinks = result.links
      .filter((l) => {
        const url = typeof l === "string" ? l : l.url;
        return (
          url.startsWith("http") &&
          !url.includes(source.url) &&
          !url.includes("beian") &&
          !url.includes("gov.cn") &&
          !url.includes("w3.org") &&
          !url.includes("github.com") &&
          !url.includes("claude.ai") &&
          !url.includes("chatgpt.com") &&
          !url.includes("chat.openai")
        );
      })
      .slice(0, 50); // 最多取50条

    const entries = externalLinks.map((l) =>
      typeof l === "string" ? { url: l } : l
    );

    console.log(`[${source.name}] 过滤后 ${entries.length} 个有效链接`);

    const saved = await saveToDatabase(entries, source.category);
    total += saved;
    console.log(`[${source.name}] 新增 ${saved} 条\n`);
  }

  console.log(`\n=== 完成！共新增 ${total} 条链接 ===`);
}

main().catch(console.error);
