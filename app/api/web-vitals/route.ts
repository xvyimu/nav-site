import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

/**
 * Web Vitals 上报端点
 *
 * 接收 useReportWebVitals hook 通过 sendBeacon 上报的 Core Web Vitals 指标，
 * 写入 Sentry 用于性能监控。
 *
 * 安全：
 *   - same-origin 检查（防跨站滥用）
 *   - Zod 严格校验（防字段注入）
 *   - 不写入数据库（仅 Sentry 上报，无持久化开销）
 *
 * 详见 docs/superpowers/specs/2026-06-29-performance-optimization-design.md §3.1 管线 B
 */

const metricSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.enum(["TTFB", "FCP", "LCP", "CLS", "INP", "FID"]),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  delta: z.number().finite(),
  navigationType: z.string().max(50),
});

export async function POST(request: Request) {
  // same-origin 检查（防跨站刷量）
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "invalid origin" }, { status: 400 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = metricSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid metric" }, { status: 400 });
  }

  const m = parsed.data;

  // 写入 Sentry：用 captureMessage + tags 便于 Dashboard 聚合
  Sentry.captureMessage(`web-vital: ${m.name}`, {
    level: "info",
    tags: {
      metric: m.name,
      rating: m.rating,
      navigationType: m.navigationType,
    },
    extra: {
      id: m.id,
      value: m.value,
      delta: m.delta,
    },
  });

  // 关联 measurement 到当前 Sentry transaction（若存在）
  // CLS 是无单位分数，其他指标是毫秒
  const unit = m.name === "CLS" ? "none" : "millisecond";
  try {
    Sentry.setMeasurement(m.name, m.value, unit);
  } catch {
    // setMeasurement 在无 active transaction 时可能抛错，静默忽略
  }

  return NextResponse.json({ ok: true });
}
