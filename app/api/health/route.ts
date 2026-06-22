import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const start = Date.now();

  const checks: Record<string, "ok" | "error" | "skipped"> = {};
  let healthy = true;

  // 1. 数据库连通性
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("nav_categories").select("id", { count: "exact", head: true });
    checks.database = error ? "error" : "ok";
    if (error) healthy = false;
  } catch {
    checks.database = "error";
    healthy = false;
  }

  // 2. 环境变量完整性（不暴露值）
  const requiredEnvVars = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  checks.env = requiredEnvVars.every((key) => process.env[key])
    ? "ok"
    : "error";
  if (checks.env === "error") healthy = false;

  const latency = Date.now() - start;

  const statusCode = healthy ? 200 : 503;

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      latency_ms: latency,
      checks,
    },
    { status: statusCode }
  );
}
