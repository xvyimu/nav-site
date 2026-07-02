import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminWrite, withAdminDelete } from "@/lib/with-admin";
import { updateTagSchema } from "@/lib/schemas";
import { updateTag, deleteTag } from "@/lib/repositories";

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

export const PUT = withAdminWrite(updateTagSchema, async ({ parsed, params }) => {
  const id = params?.id;
  const idError = validateId(id);
  if (idError) return idError;

  // 过滤掉 undefined 字段，避免覆盖为 null
  const updateInput: { name?: string; slug?: string } = {};
  if (parsed.name !== undefined) updateInput.name = parsed.name;
  if (parsed.slug !== undefined) updateInput.slug = parsed.slug;

  if (Object.keys(updateInput).length === 0) {
    return NextResponse.json({ error: "未提供任何可更新字段" }, { status: 400 });
  }

  const tag = await updateTag(id!, updateInput);
  return NextResponse.json({ tag });
});

export const DELETE = withAdminDelete(async ({ params }) => {
  const id = params?.id;
  const idError = validateId(id);
  if (idError) return idError;
  await deleteTag(id!);
  return NextResponse.json({ success: true });
});
