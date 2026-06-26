import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils";
import { urlSchema } from "@/lib/schemas";
import { checkClickRateLimit, recordClick, incrementClickCount } from "@/lib/rate-limit";
import { findApprovedLinkByUrl } from "@/lib/repositories";

const clickSchema = z.object({
  url: urlSchema,
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    const body = await request.json();
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

    // IP+URL 去重：同一 IP 对同一链接 15 分钟内只计一次点击
    const { allowed } = await checkClickRateLimit(ip, url);
    if (!allowed) {
      // 已记录过，静默返回成功（不阻断用户跳转）
      return NextResponse.json({ success: true, deduplicated: true });
    }

    // 点击数 +1（通过 RPC 原子递增）
    await incrementClickCount(url);

    // 记录本次点击（用于后续去重判断）
    await recordClick(ip, url);

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("Click route error", { source: "click-api" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
