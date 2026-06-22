import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, unauthorized } from "@/lib/admin-auth";
import { z } from "zod";

const createLinkSchema = z.object({
  title: z.string().min(1, "名称不能为空").max(100, "名称不能超过 100 字符"),
  url: z.string()
    .url("URL 格式不正确")
    .refine((u) => {
      try {
        return new URL(u).protocol === "http:" || new URL(u).protocol === "https:";
      } catch {
        return false;
      }
    }, "仅允许 http/https 协议")
    .max(2000, "URL 不能超过 2000 字符"),
  description: z.string().max(500, "描述不能超过 500 字符").nullish(),
  icon: z.string().max(20, "图标不能超过 20 字符").nullish(),
  category_id: z.string().uuid("分类 ID 格式不正确").nullable().nullish(),
  approved: z.boolean().optional().default(true),
  featured: z.boolean().optional().default(false),
});

export async function GET() {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const supabase = await createAdminClient();
  const { data: links, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

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
}