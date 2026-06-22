import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdminWrite } from "@/lib/admin-middleware-write";
import { z } from "zod";

const createCategorySchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过 50 字符"),
  slug: z.string().min(1, "Slug 不能为空").max(50, "Slug 不能超过 50 字符")
    .regex(/^[a-z0-9-]+$/, "Slug 只能包含小写字母、数字和连字符"),
  description: z.string().max(200, "描述不能超过 200 字符").nullish(),
  icon: z.string().max(20, "图标不能超过 20 字符").nullish(),
  sort_order: z.number().int("排序必须是整数").optional().default(0),
});

export const GET = withAdminWrite(async () => {
  const supabase = await createAdminClient();
  const { data: categories, error } = await supabase
    .from("nav_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ categories });
});

export const POST = withAdminWrite(async (request: Request) => {
  const supabase = await createAdminClient();
  const body = await request.json();

  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  const { name, slug, description, icon, sort_order } = parsed.data;

  const { data, error } = await supabase
    .from("nav_categories")
    .insert({
      name,
      slug,
      description: description || null,
      icon: icon || "📁",
      sort_order,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ category: data });
});
