import { NextResponse } from "next/server";
import { withAdminIdWrite, withAdminIdDelete } from "@/lib/with-admin";
import { updateCategorySchema } from "@/lib/schemas";
import {
  updateCategory,
  deleteCategory,
} from "@/lib/repositories/categories";
import { revalidatePublicNavContent } from "@/lib/admin/revalidate-public";

/** 更新指定 UUID 的管理分类。 */
export const PUT = withAdminIdWrite(updateCategorySchema, async ({ parsed, id }) => {
  const category = await updateCategory(id, parsed);
  revalidatePublicNavContent();
  return NextResponse.json({ category });
});

/** 删除指定 UUID 的管理分类。 */
export const DELETE = withAdminIdDelete(async ({ id }) => {
  await deleteCategory(id);
  revalidatePublicNavContent();
  return NextResponse.json({ success: true });
});
