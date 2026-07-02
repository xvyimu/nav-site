import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils";
import { linkIdsSchema } from "@/lib/schemas";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import {
  getUserFavorites,
  addUserFavorites,
  removeUserFavorite,
  clearUserFavorites,
} from "@/lib/repositories";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 速率限制参数：每 IP 每 15 分钟最多 30 次写操作（POST/DELETE）
const FAVORITES_WINDOW_MS = 15 * 60 * 1000;
const FAVORITES_MAX_ATTEMPTS = 30;

/**
 * 收藏写操作（POST/DELETE）的速率限制包装。
 * GET 不限速（只读），但所有写操作都会先经过 IP 限流再走 repository 层。
 *
 * 限流策略：
 * - fail-open：DB 故障时放行（避免影响正常用户）
 * - 每条记录都通过 recordAttempt 留痕，便于审计
 */
async function enforceFavoritesRateLimit(ip: string): Promise<{ allowed: boolean; count: number }> {
  return checkRateLimit(
    "favorites_rate_limits",
    ip,
    FAVORITES_WINDOW_MS,
    FAVORITES_MAX_ATTEMPTS,
    false // fail-open
  );
}

// GET /api/favorites — 获取当前用户的收藏列表
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const favorites = await getUserFavorites(session.user.id);
    return NextResponse.json({ favorites });
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

    const ip = getClientIp(request);

    // IP 速率限制（防御凭证滥用）
    const { allowed } = await enforceFavoritesRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "操作过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { linkIds } = body as { linkIds?: string[] };

    const parsed = linkIdsSchema.safeParse(linkIds);
    if (!parsed.success) {
      return NextResponse.json({ error: "linkIds 格式不正确" }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();
    const result = await addUserFavorites(supabase, session.user.id, parsed.data);
    await recordAttempt("favorites_rate_limits", ip, !("error" in result));

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, added: result.added });
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

    const ip = getClientIp(request);

    const { allowed } = await enforceFavoritesRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "操作过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");
    const all = searchParams.get("all") === "true";

    let result: { ok?: true; cleared?: true; error?: string };
    if (all) {
      result = await clearUserFavorites(session.user.id);
    } else if (!linkId) {
      return NextResponse.json({ error: "缺少 linkId 或 all 参数" }, { status: 400 });
    } else {
      result = await removeUserFavorite(session.user.id, linkId);
    }

    await recordAttempt("favorites_rate_limits", ip, !("error" in result));

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.cleared ? { ok: true, cleared: true } : { ok: true });
  } catch (e) {
    logger.error("Favorites DELETE error", { source: "api-favorites" }, e instanceof Error ? e : undefined);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
