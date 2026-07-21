import { NextResponse } from "next/server";
import { withAdminIdWrite, withAdminIdDelete } from "@/lib/with-admin";
import { updateTagSchema } from "@/lib/schemas";
import { updateTag, deleteTag } from "@/lib/repositories/tags";
import { revalidatePublicNavContent } from "@/lib/admin/revalidate-public";

/** 更新指定 UUID 的管理标签。 */
export const PUT = withAdminIdWrite(updateTagSchema, async ({ parsed, id }) => {

  // 过滤掉 undefined 字段，避免覆盖为 null
  const updateInput: { name?: string; slug?: string } = {};
  if (parsed.name !== undefined) updateInput.name = parsed.name;
  if (parsed.slug !== undefined) updateInput.slug = parsed.slug;

  if (Object.keys(updateInput).length === 0) {
    return NextResponse.json({ error: "未提供任何可更新字段" }, { status: 400 });
  }

  const tag = await updateTag(id, updateInput);
  revalidatePublicNavContent();
  return NextResponse.json({ tag });
});

/** 删除指定 UUID 的管理标签。 */
export const DELETE = withAdminIdDelete(async ({ id }) => {
  await deleteTag(id);
  revalidatePublicNavContent();
  return NextResponse.json({ success: true });
});
