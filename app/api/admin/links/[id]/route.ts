import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin } from "@/lib/admin-middleware";

export const PUT = withAdmin(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
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
});

export const DELETE = withAdmin(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const supabase = await createAdminClient();

  const { error } = await supabase.from("nav_links").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
