import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminGet, withAdminWrite } from "@/lib/with-admin";
import { createLinkSchema } from "@/lib/schemas";
import { getAdminLinksPage, createLink } from "@/lib/repositories/admin-links";
import { revalidatePublicNavContent } from "@/lib/admin/revalidate-public";

const adminLinksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().max(100).default(""),
  category: z.string().uuid().optional(),
  status: z.enum(["all", "pending", "featured"]).default("all"),
});

/** 查询经过鉴权和参数校验的管理链接分页。 */
export const GET = withAdminGet(async (request) => {
  const startedAt = performance.now();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = adminLinksQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "查询参数格式不正确" }, { status: 400 });
  }

  const result = await getAdminLinksPage({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    search: parsed.data.q,
    categoryId: parsed.data.category,
    status: parsed.data.status,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
    },
  });
});

/** 创建管理链接，并由 repository 选择普通写入或标签事务 RPC。 */
export const POST = withAdminWrite(createLinkSchema, async ({ parsed }) => {
  const link = await createLink({
    title: parsed.title,
    url: parsed.url,
    description: parsed.description || null,
    icon: parsed.icon || "",
    category_id: parsed.category_id || null,
    approved: parsed.approved,
    featured: parsed.featured,
    tag_ids: parsed.tag_ids,
  });
  revalidatePublicNavContent({ slug: link.slug });
  return NextResponse.json({ link });
});
