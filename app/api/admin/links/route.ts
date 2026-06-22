import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdminWrite } from "@/lib/admin-middleware-write";
import { z } from "zod";

const createLinkSchema = z.object({
  title: z.string().min(1, "名称不能为空").max(100, "名称不能超过 100 字符"),
  url: z.string().url("URL 格式不正确").max(2000, "URL 不能超过 2000 字符"),
  description: z.string().max(500, "描述不能超过 500 字符").nullish(),
  icon: z.string().max(20, "图标不能超过 20 字符").nullish(),
  category_id: z.string().uuid("分类 ID 格式不正确").nullable().nullish(),
  approved: z.boolean().optional().default(true),
  featured: z.boolean().optional().default(false),
});

export const GET = withAdminWrite(async () => {
  const supabase = await createAdminClient();
  const { data: links, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ links });
});

export const POST = withAdminWrite(async (request: Request) => {
  const supabase = await createAdminClient();
  const body = await request.json();

  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  const { title, url, description, icon, category_id, approved, featured } = parsed.data;

  const { data, error } = await supabase
    .from("nav_links")
    .insert({
      title,
      url,
      description: description || null,
      icon: icon || "🔗",
      category_id: category_id || null,
      approved,
      featured,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: data });
});
