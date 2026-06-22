import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase 分布式限流（替代 in-memory，Serverless 下共享状态）
const CLICK_RATE_LIMIT_MAX = 50; // 每 15 分钟最多 50 次

async function checkRateLimit(ip: string): Promise<boolean> {
  const supabase = await createClient();
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("click_rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", windowStart);
  return (count ?? 0) < CLICK_RATE_LIMIT_MAX;
}

async function recordClick(ip: string) {
  const supabase = await createClient();
  await supabase.from("click_rate_limits").insert({ ip });
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-nf-client-connection-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown";

    // Rate limit check (distributed via Supabase)
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json({ error: "too many requests" }, { status: 429 });
    }

    const { url } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "missing url" }, { status: 400 });
    }

    // Validate URL protocol
    if (!isSafeUrl(url)) {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify the URL exists in the database
    const { data: link } = await supabase
      .from("nav_links")
      .select("id")
      .eq("url", url)
      .eq("approved", true)
      .maybeSingle();

    if (!link) {
      return NextResponse.json({ error: "link not found" }, { status: 404 });
    }

    // Increment click_count via RPC
    await supabase.rpc("increment_click", { link_url: url });
    await recordClick(ip);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}