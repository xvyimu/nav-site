import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdmin } from "@/lib/admin";

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const supabase = await createAdminClient();

  const { data: links, error } = await supabase
    .from("nav_links")
    .select("*, nav_categories(name, slug)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ links });
}

export async function POST(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

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
}