import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/admin-auth";
import { updateTagSchema } from "@/lib/schemas";
import { updateTag, deleteTag } from "@/lib/repositories";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const parsed = updateTagSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  // 过滤掉 undefined 字段，避免覆盖为 null
  const updateInput: { name?: string; slug?: string } = {};
  if (parsed.data.name !== undefined) updateInput.name = parsed.data.name;
  if (parsed.data.slug !== undefined) updateInput.slug = parsed.data.slug;

  if (Object.keys(updateInput).length === 0) {
    return NextResponse.json({ error: "未提供任何可更新字段" }, { status: 400 });
  }

  try {
    const tag = await updateTag(id, updateInput);
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "更新标签失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const { id } = await params;
  try {
    await deleteTag(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "删除标签失败" }, { status: 500 });
  }
}
