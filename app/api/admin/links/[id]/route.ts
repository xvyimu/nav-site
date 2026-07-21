import { NextResponse } from "next/server";
import { withAdminIdWrite, withAdminIdDelete } from "@/lib/with-admin";
import { updateLinkSchema } from "@/lib/schemas";
import { updateLink, deleteLink } from "@/lib/repositories/admin-links";
import { revalidatePublicNavContent } from "@/lib/admin/revalidate-public";

/** 更新指定 UUID 的管理链接。 */
export const PUT = withAdminIdWrite(updateLinkSchema, async ({ parsed, id }) => {
  const link = await updateLink(id, parsed);
  revalidatePublicNavContent({ slug: link.slug });
  return NextResponse.json({ link });
});

/** 删除指定 UUID 的管理链接。 */
export const DELETE = withAdminIdDelete(async ({ id }) => {
  await deleteLink(id);
  // 删除后刷首页/站点地图；slug 未知时仍失效列表页
  revalidatePublicNavContent();
  return NextResponse.json({ success: true });
});
