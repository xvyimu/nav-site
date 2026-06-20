import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin } from "@/lib/admin-middleware";

export const GET = withAdmin(async () => {
  const supabase = await createAdminClient();

  const { data: categories, error } = await supabase
    .from("nav_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories });
});

export const POST = withAdmin(async (request: Request) => {
  const supabase = await createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("nav_categories")
    .insert({
      name: body.name,
      slug: body.slug,
      description: body.description || null,
      icon: body.icon || "📁",
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data });
});
