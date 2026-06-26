import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/admin-auth";
import { updateLinkSchema } from "@/lib/schemas";
import { updateLink, deleteLink } from "@/lib/repositories";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const parsed = updateLinkSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  try {
    const link = await updateLink(id, parsed.data as Record<string, unknown>);
    return NextResponse.json({ link });
  } catch {
    return NextResponse.json({ error: "更新链接失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const { id } = await params;
  try {
    await deleteLink(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "删除链接失败" }, { status: 500 });
  }
}
