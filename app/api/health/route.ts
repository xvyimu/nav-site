import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  buildEmbedRequestHeaders,
  describeEmbedSkipReason,
  resolveEmbedEndpoint,
} from "@/lib/embedding-runtime";
import { logger } from "@/lib/logger";
import {
  RESOURCE_LIBRARY_URL,
  getResourceLibraryAnonKey,
} from "@/lib/resource-library/client";

const EMBED_HEALTH_TIMEOUT_MS = 8000;
const RESOURCE_LIBRARY_HEALTH_TIMEOUT_MS = 1500;

type HealthCheck = {
  status: "ok" | "error" | "skipped";
  latency_ms: number;
  detail?: string;
};

function readFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function getBuildVersion() {
  return {
    node: process.version,
    app: process.env.npm_package_version || "0.1.0",
    commit: readFirstEnv([
      "NEXT_PUBLIC_BUILD_COMMIT",
      "COMMIT_REF",
      "NETLIFY_COMMIT_REF",
      "GITHUB_SHA",
      "VERCEL_GIT_COMMIT_SHA",
    ]),
    branch: readFirstEnv([
      "BRANCH",
      "HEAD",
      "GITHUB_REF_NAME",
      "VERCEL_GIT_COMMIT_REF",
    ]),
    deployId: readFirstEnv(["DEPLOY_ID", "NETLIFY_DEPLOY_ID", "VERCEL_DEPLOYMENT_ID"]),
  };
}

function getEmbedHealthEndpoint() {
  return resolveEmbedEndpoint({
    raw: process.env.EMBED_SERVER_URL,
    path: "/health",
  });
}

async function checkResourceLibrarySearchHealth(): Promise<HealthCheck> {
  const start = Date.now();
  const anonKey = getResourceLibraryAnonKey();

  if (!anonKey) {
    return {
      status: "skipped",
      latency_ms: Date.now() - start,
      detail: "RESOURCE_LIBRARY_ANON_KEY not configured",
    };
  }

  try {
    const supabase = createSupabaseClient(RESOURCE_LIBRARY_URL, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase
      .rpc("resource_search_health")
      .abortSignal(AbortSignal.timeout(RESOURCE_LIBRARY_HEALTH_TIMEOUT_MS));

    if (error) {
      logger.warn("Resource library search health RPC unavailable", {
        source: "api-health",
        code: error.code,
      });
      return {
        status: "error",
        latency_ms: Date.now() - start,
        detail: "public resource search RPC unavailable",
      };
    }

    return {
      status: "ok",
      latency_ms: Date.now() - start,
      detail: "public resource search RPC reachable",
    };
  } catch (e) {
    logger.warn("Resource library search health probe failed", {
      source: "api-health",
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      status: "error",
      latency_ms: Date.now() - start,
      detail: "public resource search RPC probe failed",
    };
  }
}

export async function GET() {
  const start = Date.now();

  const checks: Record<string, HealthCheck> = {};
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
  const { endpoint: embedEndpoint, reason: embedSkipReason } = getEmbedHealthEndpoint();
  if (embedEndpoint === null) {
    checks.embedding = {
      status: "skipped",
      latency_ms: Date.now() - embedStart,
      detail: describeEmbedSkipReason(embedSkipReason),
    };
  } else {
    try {
      const response = await fetch(embedEndpoint, {
        headers: buildEmbedRequestHeaders({ json: false }),
        signal: AbortSignal.timeout(EMBED_HEALTH_TIMEOUT_MS),
      });
      checks.embedding = {
        status: response.ok ? "ok" : "error",
        latency_ms: Date.now() - embedStart,
        detail: response.ok
          ? "embed service reachable"
          : `embed service returned ${response.status}; semantic search will fall back`,
      };
      // 默认 embedding 失败不拖垮全局 healthy；生产探针可设 HEALTH_REQUIRE_EMBEDDING=1
      if (
        !response.ok &&
        process.env.HEALTH_REQUIRE_EMBEDDING === "1"
      ) {
        healthy = false;
      }
    } catch (e) {
      checks.embedding = {
        status: "error",
        latency_ms: Date.now() - embedStart,
        detail: e instanceof Error
          ? `embed service unavailable: ${e.message}`
          : "embed service unavailable; semantic search will fall back",
      };
      if (process.env.HEALTH_REQUIRE_EMBEDDING === "1") {
        healthy = false;
      }
    }
  }

  checks.resourceLibrarySearch = await checkResourceLibrarySearchHealth();

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
      version: getBuildVersion(),
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
