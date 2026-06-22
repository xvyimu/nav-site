import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const submitSchema = z.object({
  title: z.string().min(1, "站点名称不能为空").max(100, "站点名称不能超过 100 字符"),
  url: z.string().url("URL 格式不正确").max(2000, "URL 不能超过 2000 字符"),
  description: z.string().max(500, "描述不能超过 500 字符").nullish().default(null),
  category_id: z.string().uuid("分类 ID 格式不正确").nullable().nullish().default(null),
});

async function checkRateLimit(ip: string): Promise<boolean> {
  const supabase = await createClient();
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("submit_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", windowStart);
  return (count ?? 0) < 3; // 每 15 分钟最多 3 次提交
}

async function recordSubmitAttempt(ip: string, success: boolean) {
  const supabase = await createClient();
  await supabase.from("submit_attempts").insert({ ip, success });
}

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-nf-client-connection-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    // 速率限制
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "提交过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    const body = await request.json();

    // 输入验证
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "输入验证失败", details: errors },
        { status: 400 }
      );
    }

    const { title, url, description, category_id } = parsed.data;

    // 重复 URL 检测
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("nav_links")
      .select("id, approved")
      .eq("url", url)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: existing.approved ? "该站点已收录" : "该站点已提交，等待审核中" },
        { status: 409 }
      );
    }

    const { error, data } = await supabase.from("nav_links").insert({
      title,
      url,
      description,
      category_id,
      approved: false,
      paid: false,
      featured: false,
    });

    const success = !error && !!data;
    await recordSubmitAttempt(ip, success);

    if (error) {
      console.error("Submit error:", error);
      return NextResponse.json(
        { error: "提交失败，请重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Submit route error:", e);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
