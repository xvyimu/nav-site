import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/utils";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";
import { findExistingLinkByUrl, submitLink } from "@/lib/repositories";
import { submitLinkSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // 速率限制
    const { allowed } = await checkRateLimit("submit_attempts", ip, 15 * 60 * 1000, 3);
    if (!allowed) {
      return NextResponse.json(
        { error: "提交过于频繁，请 15 分钟后再试" },
        { status: 429 }
      );
    }

    const body = await request.json();

    // 输入验证
    const parsed = submitLinkSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "输入验证失败", details: errors },
        { status: 400 }
      );
    }

    const { title, url, description, category_id } = parsed.data;

    // 重复 URL 检测
    const existing = await findExistingLinkByUrl(url);
    if (existing) {
      return NextResponse.json(
        { error: existing.approved ? "该站点已收录" : "该站点已提交，等待审核中" },
        { status: 409 }
      );
    }

    const success = await submitLink({ title, url, description, category_id });
    await recordAttempt("submit_attempts", ip, success);

    if (!success) {
      return NextResponse.json(
        { error: "提交失败，请重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("Submit route error", { source: "submit-api" }, e instanceof Error ? e : undefined);
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    );
  }
}
