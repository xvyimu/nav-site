import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminWrite, withAdminDelete } from "@/lib/with-admin";
import { updateLinkSchema } from "@/lib/schemas";
import { updateLink, deleteLink } from "@/lib/repositories";

function validateId(id: string | undefined): NextResponse | null {
  if (!id) {
    return NextResponse.json({ error: "缺少 id 参数" }, { status: 400 });
  }
  const uuidResult = z.string().uuid("ID 格式不正确").safeParse(id);
  if (!uuidResult.success) {
    return NextResponse.json({ error: "ID 格式不正确" }, { status: 400 });
  }
  return null;
}

export const PUT = withAdminWrite(updateLinkSchema, async ({ parsed, params }) => {
  const id = params?.id;
  const idError = validateId(id);
  if (idError) return idError;
  const link = await updateLink(id!, parsed as Record<string, unknown>);
  return NextResponse.json({ link });
});

export const DELETE = withAdminDelete(async ({ params }) => {
  const id = params?.id;
  const idError = validateId(id);
  if (idError) return idError;
  await deleteLink(id!);
  return NextResponse.json({ success: true });
});
