import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { linkIdsSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// GET /api/favorites — 获取当前用户的收藏列表
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userId = session.user.id;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_favorites")
      .select("link_id")
      .eq("user_id", userId);

    if (error) {
      logger.error("Failed to fetch favorites", { source: "api-favorites", userId }, error);
      return NextResponse.json({ error: "获取收藏失败" }, { status: 500 });
    }

    const linkIds = (data ?? []).map((r) => r.link_id);
    return NextResponse.json({ favorites: linkIds });
  } catch (e) {
    logger.error("Favorites GET error", { source: "api-favorites" }, e instanceof Error ? e : undefined);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// POST /api/favorites — 添加收藏（支持批量）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { linkIds } = body as { linkIds?: string[] };

    const parsed = linkIdsSchema.safeParse(linkIds);
    if (!parsed.success) {
      return NextResponse.json({ error: "linkIds 格式不正确" }, { status: 400 });
    }

    const supabase = await createClient();

    const rows = parsed.data.map((link_id) => ({
      user_id: userId,
      link_id,
    }));

    const { error } = await supabase
      .from("user_favorites")
      .upsert(rows, { onConflict: "user_id,link_id", ignoreDuplicates: true });

    if (error) {
      logger.error("Failed to add favorites", { source: "api-favorites", userId }, error);
      return NextResponse.json({ error: "添加收藏失败" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, added: parsed.data.length });
  } catch (e) {
    logger.error("Favorites POST error", { source: "api-favorites" }, e instanceof Error ? e : undefined);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

// DELETE /api/favorites — 删除收藏（支持单条或全部）
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");
    const all = searchParams.get("all") === "true";

    const supabase = await createClient();

    if (all) {
      // 清空当前用户的所有收藏
      const { error } = await supabase
        .from("user_favorites")
        .delete()
        .eq("user_id", userId);

      if (error) {
        logger.error("Failed to clear favorites", { source: "api-favorites", userId }, error);
        return NextResponse.json({ error: "清空收藏失败" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, cleared: true });
    }

    if (!linkId) {
      return NextResponse.json({ error: "缺少 linkId 或 all 参数" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("link_id", linkId);

    if (error) {
      logger.error("Failed to remove favorite", { source: "api-favorites", userId }, error);
      return NextResponse.json({ error: "删除收藏失败" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("Favorites DELETE error", { source: "api-favorites" }, e instanceof Error ? e : undefined);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
