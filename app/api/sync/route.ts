import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 旧库（源 - 开发数据）
const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_KEY = process.env.SOURCE_SUPABASE_ANON_KEY;

// 新库（目标 - 生产数据）
const TARGET_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: Request) {
  // 简单鉴权：校验 ?secret=
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
    return NextResponse.json(
      { error: "数据库配置不完整，请设置 SOURCE_SUPABASE_URL/SOURCE_SUPABASE_ANON_KEY" },
      { status: 500 }
    );
  }

  const source = createClient(SOURCE_URL, SOURCE_KEY);
  const target = createClient(TARGET_URL, TARGET_KEY);

  const results: Record<string, number> = {};

  try {
    // 同步分类
    const { data: categories } = await source
      .from("nav_categories")
      .select("*");

    let catInserted = 0;
    for (const cat of categories || []) {
      const { error } = await target.from("nav_categories").upsert(cat, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (!error) catInserted++;
    }
    results.categories = catInserted;
    results.categories_total = (categories || []).length;

    // 同步链接（只同步 approved = true 的）
    const { data: links } = await source
      .from("nav_links")
      .select("*")
      .eq("approved", true);

    // 获取目标库已有 URLs
    const { data: existingLinks } = await target
      .from("nav_links")
      .select("url");

    const existingUrls = new Set((existingLinks || []).map((l) => l.url));

    let linkInserted = 0;
    for (const link of links || []) {
      if (existingUrls.has(link.url)) continue;
      const { error } = await target.from("nav_links").insert(link);
      if (!error) {
        linkInserted++;
        existingUrls.add(link.url);
      }
    }
    results.links = linkInserted;
    results.links_total = (links || []).length;

    return NextResponse.json({
      success: true,
      message: `同步完成`,
      detail: results,
    });
  } catch (err: unknown) {
    console.error("同步失败:", err);
    const message = err instanceof Error ? err.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
