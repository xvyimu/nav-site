import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin } from "@/lib/admin-middleware";

export const GET = withAdmin(async () => {
  const supabase = await createAdminClient();

  const { data: links, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ links });
});

export const POST = withAdmin(async (request: Request) => {
  const supabase = await createAdminClient();
  const body = await request.json();

  const { data, error } = await supabase
    .from("nav_links")
    .insert({
      title: body.title,
      url: body.url,
      description: body.description || null,
      icon: body.icon || "🔗",
      category_id: body.category_id || null,
      approved: body.approved ?? true,
      featured: body.featured ?? false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data });
});
