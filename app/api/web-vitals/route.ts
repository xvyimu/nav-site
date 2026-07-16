import { NextResponse } from "next/server";
import { captureMessage, setMeasurement } from "@sentry/nextjs";
import { webVitalMetricSchema } from "@/lib/schemas";
import { checkDistributedRateLimit } from "@/lib/rate-limit-distributed";
import { getClientIp } from "@/lib/utils";

const WEB_VITALS_WINDOW_MS = 60_000;
const WEB_VITALS_MAX_PER_MIN = 30;

function shouldSample(id: string): boolean {
  const configured = Number(process.env.SENTRY_WEB_VITALS_SAMPLE_RATE);
  const rate = Number.isFinite(configured)
    ? Math.min(1, Math.max(0, configured))
    : process.env.NODE_ENV === "production" ? 0.1 : 1;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash / 0xffffffff < rate;
}

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

export async function POST(request: Request) {
  // same-origin 检查（防跨站刷量）
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const { allowed } = await checkDistributedRateLimit(
    `web-vitals:${ip}`,
    WEB_VITALS_WINDOW_MS,
    WEB_VITALS_MAX_PER_MIN
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = webVitalMetricSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid metric" }, { status: 400 });
  }

  const m = parsed.data;

  // 写入 Sentry：用 captureMessage + tags 便于 Dashboard 聚合
  if (shouldSample(m.id)) {
    captureMessage(`web-vital: ${m.name}`, {
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
  }

  // 关联 measurement 到当前 Sentry transaction（若存在）
  // CLS 是无单位分数，其他指标是毫秒
  const unit = m.name === "CLS" ? "none" : "millisecond";
  try {
    setMeasurement(m.name, m.value, unit);
  } catch {
    // setMeasurement 在无 active transaction 时可能抛错，静默忽略
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
