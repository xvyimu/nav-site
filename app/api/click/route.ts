import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

    const supabase = await createClient();
    // Increment click_count via raw SQL for atomicity
    await supabase.rpc("increment_click", { link_url: url });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}