import { NextResponse } from "next/server";
import { withAdminGet, withAdminWrite } from "@/lib/with-admin";
import { createCategorySchema } from "@/lib/schemas";
import {
  getAllCategoriesForAdmin,
  createCategory,
} from "@/lib/repositories/categories";
import { revalidatePublicNavContent } from "@/lib/admin/revalidate-public";

/** 查询管理分类，并禁止共享缓存持有后台数据。 */
export const GET = withAdminGet(async () => {
  const startedAt = performance.now();
  const categories = await getAllCategoriesForAdmin();
  return NextResponse.json(
    { categories },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    }
  );
});

/** 创建管理分类，并规范化可空展示字段。 */
export const POST = withAdminWrite(createCategorySchema, async ({ parsed }) => {
  const category = await createCategory({
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description || null,
    icon: parsed.icon || "",
    sort_order: parsed.sort_order,
    parent_id: parsed.parent_id ?? null,
  });
  revalidatePublicNavContent();
  return NextResponse.json({ category });
});
