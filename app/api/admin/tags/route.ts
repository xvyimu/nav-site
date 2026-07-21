import { NextResponse } from "next/server";
import { withAdminGet, withAdminWrite } from "@/lib/with-admin";
import { createTagSchema } from "@/lib/schemas";
import { getAllTagsForAdmin, createTag } from "@/lib/repositories/tags";
import { revalidatePublicNavContent } from "@/lib/admin/revalidate-public";

/** 查询全部管理标签。 */
export const GET = withAdminGet(async () => {
  const tags = await getAllTagsForAdmin();
  return NextResponse.json({ tags });
});

/** 创建经过 contract 校验的管理标签。 */
export const POST = withAdminWrite(createTagSchema, async ({ parsed }) => {
  const tag = await createTag(parsed);
  revalidatePublicNavContent();
  return NextResponse.json({ tag });
});
