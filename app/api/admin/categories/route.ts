import { NextResponse } from "next/server";
import { withAdminGet, withAdminWrite } from "@/lib/with-admin";
import { createCategorySchema } from "@/lib/schemas";
import { getAllCategoriesForAdmin, createCategory } from "@/lib/repositories";

export const GET = withAdminGet(async () => {
  try {
    const categories = await getAllCategoriesForAdmin();
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ error: "获取分类列表失败" }, { status: 500 });
  }
});

export const POST = withAdminWrite(createCategorySchema, async ({ parsed }) => {
  try {
    const category = await createCategory({
      name: parsed.name,
      slug: parsed.slug,
      description: parsed.description || null,
      icon: parsed.icon || "📁",
      sort_order: parsed.sort_order,
      parent_id: parsed.parent_id ?? null,
    });
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "创建分类失败" }, { status: 500 });
  }
});
