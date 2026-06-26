import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/admin-auth";
import { createTagSchema } from "@/lib/schemas";
import { getAllTagsForAdmin, createTag } from "@/lib/repositories";

export async function GET() {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  try {
    const tags = await getAllTagsForAdmin();
    return NextResponse.json({ tags });
  } catch {
    return NextResponse.json({ error: "获取标签列表失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { authorized } = await requireAdmin();
  if (!authorized) return unauthorized();

  const body = await request.json();
  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  try {
    const tag = await createTag(parsed.data);
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "创建标签失败" }, { status: 500 });
  }
}
