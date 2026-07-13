import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils";
import { clickSchema } from "@/lib/schemas";
import { tryRecordClick, incrementClickCount } from "@/lib/rate-limit";
import { findApprovedLinkByUrl } from "@/lib/repositories";
import { checkOrigin } from "@/lib/csrf";

export async function POST(request: Request) {
  try {
    const csrfError = checkOrigin(request, "click-api");
    if (csrfError) return csrfError;

    const ip = getClientIp(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = clickSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "URL 格式不正确" },
        { status: 400 }
      );
    }

    const { url } = parsed.data;

    // 验证链接存在且已批准
    const link = await findApprovedLinkByUrl(url);
    if (!link) {
      return NextResponse.json(
        { error: "链接不存在或未批准" },
        { status: 404 }
      );
    }

    // 先原子抢占去重槽，成功后再 +1（消除 check→increment→record TOCTOU）
    const { inserted } = await tryRecordClick(ip, url);
    if (!inserted) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    await incrementClickCount(url);

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("Click route error", { source: "click-api" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
