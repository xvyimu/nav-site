import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/admin-auth";
import { updateCategorySchema } from "@/lib/schemas";
import { updateCategory, deleteCategory } from "@/lib/repositories";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const { id } = await params;
  const body = await request.json();

  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  try {
    const category = await updateCategory(id, parsed.data);
    return NextResponse.json({ category });
  } catch {
    return NextResponse.json({ error: "更新分类失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const { id } = await params;
  try {
    await deleteCategory(id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "删除分类失败" }, { status: 500 });
  }
}
