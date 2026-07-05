import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const EMBED_HEALTH_TIMEOUT_MS = 1500;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

function getEmbedHealthEndpoint(): string | null {
  const raw = process.env.EMBED_SERVER_URL;
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !LOOPBACK_HOSTS.has(normalizeHostname(url.hostname))) {
      return null;
    }
    return new URL("/health", url).toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const start = Date.now();

  const checks: Record<
    string,
    { status: "ok" | "error" | "skipped"; latency_ms: number; detail?: string }
  > = {};
  let healthy = true;

  // 1. 数据库连通性 + 表计数
  const dbStart = Date.now();
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("nav_categories")
      .select("*", { count: "exact", head: true });

    if (error) {
      checks.database = {
        status: "error",
        latency_ms: Date.now() - dbStart,
        detail: error.message,
      };
      healthy = false;
    } else {
      checks.database = {
        status: "ok",
        latency_ms: Date.now() - dbStart,
        detail: `${count ?? 0} categories`,
      };
    }
  } catch (e) {
    checks.database = {
      status: "error",
      latency_ms: Date.now() - dbStart,
      detail: e instanceof Error ? e.message : "unknown",
    };
    healthy = false;
  }

  // 2. 环境变量完整性（不暴露值）
  const envStart = Date.now();
  const requiredEnvVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const missing = requiredEnvVars.filter((key) => !process.env[key]);
  checks.env = {
    status: missing.length === 0 ? "ok" : "error",
    latency_ms: Date.now() - envStart,
    detail: missing.length === 0 ? "all required vars present" : `missing: ${missing.join(", ")}`,
  };
  if (missing.length > 0) healthy = false;

  // 3. Sentry DSN 配置检查
  const sentryStart = Date.now();
  checks.sentry = {
    status: process.env.NEXT_PUBLIC_SENTRY_DSN ? "ok" : "skipped",
    latency_ms: Date.now() - sentryStart,
    detail: process.env.NEXT_PUBLIC_SENTRY_DSN ? "configured" : "not configured (optional)",
  };

  const embedStart = Date.now();
  const embedEndpoint = getEmbedHealthEndpoint();
  if (!embedEndpoint) {
    checks.embedding = {
      status: "skipped",
      latency_ms: Date.now() - embedStart,
      detail: "not configured or non-loopback EMBED_SERVER_URL",
    };
  } else {
    try {
      const response = await fetch(embedEndpoint, {
        signal: AbortSignal.timeout(EMBED_HEALTH_TIMEOUT_MS),
      });
      checks.embedding = {
        status: response.ok ? "ok" : "error",
        latency_ms: Date.now() - embedStart,
        detail: response.ok
          ? "optional embed service reachable"
          : `optional embed service returned ${response.status}; semantic search will fall back`,
      };
    } catch (e) {
      checks.embedding = {
        status: "error",
        latency_ms: Date.now() - embedStart,
        detail: e instanceof Error
          ? `optional embed service unavailable: ${e.message}`
          : "optional embed service unavailable; semantic search will fall back",
      };
    }
  }

  const latency = Date.now() - start;
  const statusCode = healthy ? 200 : 503;

  // 内存使用情况
  const memory = process.memoryUsage();

  if (!healthy) {
    logger.warn("Health check failed", { checks, latency_ms: latency });
  }

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV,
      latency_ms: latency,
      version: {
        node: process.version,
        app: process.env.npm_package_version || "0.1.0",
      },
      memory: {
        rss_mb: Math.round(memory.rss / 1024 / 1024),
        heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
      },
      checks,
    },
    {
      status: statusCode,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
