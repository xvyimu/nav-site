import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin } from "@/lib/admin-middleware";

export const PUT = withAdmin(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const supabase = await createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("nav_categories")
    .update({
      name: body.name,
      slug: body.slug,
      description: body.description,
      icon: body.icon,
      sort_order: body.sort_order,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data });
});

export const DELETE = withAdmin(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const supabase = await createAdminClient();

  const { error } = await supabase.from("nav_categories").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
