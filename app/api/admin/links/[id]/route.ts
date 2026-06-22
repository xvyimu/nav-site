import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdminWrite } from "@/lib/admin-middleware-write";
import { z } from "zod";

const updateLinkSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  url: z.string().url().max(2000).optional(),
  description: z.string().max(500).nullish(),
  icon: z.string().max(20).nullish(),
  category_id: z.string().uuid().nullable().nullish(),
  approved: z.boolean().optional(),
  featured: z.boolean().optional(),
});

export const PUT = withAdminWrite(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const supabase = await createAdminClient();
  const body = await request.json();

  const parsed = updateLinkSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return NextResponse.json({ error: "输入验证失败", details: errors }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("nav_links")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ link: data });
});

export const DELETE = withAdminWrite(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const supabase = await createAdminClient();
  const { error } = await supabase.from("nav_links").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
});
