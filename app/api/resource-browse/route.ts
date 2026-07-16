import { NextResponse } from "next/server";
import { z } from "zod";
import { browseResources } from "@/lib/resource-library/browse";

// 资源库浏览 API
// 优先用资源库 anon key 读取公开 view；未配置时才退回 service_role。
// 搜索场景走 /api/resource-search 代理；浏览（首屏、分类浏览）走本路由。

const BROWSE_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export const dynamic = "force-dynamic";

const browseSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = browseSchema.safeParse({
    category: searchParams.get("category") || undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await browseResources(parsed.data);
  if (!result.ok) {
    const status = result.reason === "not_configured" ? 503 : 500;
    const error = result.reason === "not_configured" ? "资源浏览服务未配置" : "读取资源失败";
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json(
    { results: result.results },
    { headers: { "Cache-Control": BROWSE_CACHE_CONTROL } }
  );
}
