import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/admin";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("nav_links")
    .update({
      title: body.title,
      url: body.url,
      description: body.description,
      icon: body.icon,
      category_id: body.category_id,
      approved: body.approved,
      featured: body.featured,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createAdminClient();

  const { error } = await supabase.from("nav_links").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}