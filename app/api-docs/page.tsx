import type { Metadata } from "next";
import { FileJson, Search, MousePointerClick, Star, Shield, Heart } from "lucide-react";

export const metadata: Metadata = {
  title: "API 文档 — 综合导航站",
  description: "Agent API 接口文档，支持分类过滤、搜索和数量限制",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight">API 文档</h1>
          <p className="mt-2 text-muted-foreground">
            综合导航站提供结构化 JSON API，供 AI Agent 和开发者程序化访问站点数据。
          </p>
        </div>

        {/* Quick Stats */}
        <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "站点数", value: "287+" },
            { label: "分类数", value: "11" },
            { label: "认证", value: "无需" },
            { label: "限流", value: "100/请求" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-4">
              <div className="text-2xl font-bold text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Endpoints */}
        <div className="space-y-8">
          {/* GET /api/tools */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileJson className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">GET /api/tools</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              获取已收录的站点列表，支持分类过滤、关键词搜索和数量限制。返回 JSON 格式。
            </p>

            <h3 className="text-sm font-semibold text-foreground mb-2">参数</h3>
            <div className="overflow-x-auto rounded-lg border border-border mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">参数</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">类型</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">默认</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-2 font-mono text-primary">category</td>
                    <td className="px-4 py-2 text-muted-foreground">string</td>
                    <td className="px-4 py-2 text-muted-foreground">all</td>
                    <td className="px-4 py-2">分类 slug（如 <code className="text-primary">ai-api</code>、<code className="text-primary">cloud-vps</code>）</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-primary">search</td>
                    <td className="px-4 py-2 text-muted-foreground">string</td>
                    <td className="px-4 py-2 text-muted-foreground">—</td>
                    <td className="px-4 py-2">模糊搜索关键词（匹配标题和描述）</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-primary">limit</td>
                    <td className="px-4 py-2 text-muted-foreground">number</td>
                    <td className="px-4 py-2 text-muted-foreground">—</td>
                    <td className="px-4 py-2">返回数量上限（最大 100）</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-foreground mb-2">请求示例</h3>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`# 获取全部站点
curl https://nav-site.netlify.app/api/tools

# 按分类过滤
curl "https://nav-site.netlify.app/api/tools?category=ai-api"

# 搜索 + 限制数量
curl "https://nav-site.netlify.app/api/tools?search=react&limit=10"`}</code></pre>

            <h3 className="text-sm font-semibold text-foreground mb-2">响应示例</h3>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`{
  "links": [
    {
      "id": "uuid",
      "title": "OpenAI Platform",
      "url": "https://platform.openai.com",
      "description": "GPT-4o、DALL-E、Whisper 等 AI API 平台",
      "icon": "🤖",
      "category": "ai-api",
      "category_name": "AI & 大模型",
      "featured": true,
      "paid": false,
      "click_count": 42,
      "created_at": "2026-06-24T00:00:00Z"
    }
  ],
  "total": 287,
  "category": "all"
}`}</code></pre>
          </section>

          {/* GET /api/search */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">GET /api/search</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              服务端模糊搜索，基于 Fuse.js。搜索标题、描述和分类名称。
            </p>

            <h3 className="text-sm font-semibold text-foreground mb-2">参数</h3>
            <div className="overflow-x-auto rounded-lg border border-border mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">参数</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">类型</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">必填</th>
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-2 font-mono text-primary">q</td>
                    <td className="px-4 py-2 text-muted-foreground">string</td>
                    <td className="px-4 py-2 text-red-500">是</td>
                    <td className="px-4 py-2">搜索关键词</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-primary">category</td>
                    <td className="px-4 py-2 text-muted-foreground">string</td>
                    <td className="px-4 py-2 text-muted-foreground">否</td>
                    <td className="px-4 py-2">限定分类 slug</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-mono text-primary">limit</td>
                    <td className="px-4 py-2 text-muted-foreground">number</td>
                    <td className="px-4 py-2 text-muted-foreground">否</td>
                    <td className="px-4 py-2">返回数量（默认 20，最大 100）</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl "https://nav-site.netlify.app/api/search?q=vercel&limit=5"`}</code></pre>

            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`{
  "results": [
    {
      "id": "uuid",
      "title": "Vercel",
      "url": "https://vercel.com",
      "description": "前端部署与托管平台",
      "category_slug": "cloud-vps",
      "featured": true,
      "score": 0.01
    }
  ],
  "total": 1,
  "query": "vercel"
}`}</code></pre>
          </section>

          {/* POST /api/click */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MousePointerClick className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">POST /api/click</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              记录用户点击外链的行为，用于热门排行榜。同一 IP 对同一链接 15 分钟内只计一次。
            </p>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl -X POST https://nav-site.netlify.app/api/click \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://vercel.com"}'`}</code></pre>
          </section>

          {/* GET /api/reviews */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">GET /api/reviews</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              获取工具的评价列表和评分统计。支持缓存（s-maxage=60s）。
            </p>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl "https://nav-site.netlify.app/api/reviews?linkId=uuid"`}</code></pre>
          </section>

          {/* POST /api/submit */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">POST /api/submit</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              提交新站点到导航站。需通过 Zod 输入验证和速率限制（每 IP 15 分钟 3 次）。提交后进入待审核状态。
            </p>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl -X POST https://nav-site.netlify.app/api/submit \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "示例站点",
    "url": "https://example.com",
    "description": "这是一个示例",
    "category_id": "uuid"
  }'`}</code></pre>
          </section>

          {/* GET/POST/DELETE /api/favorites */}
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">/api/favorites</h2>
              <span className="ml-auto text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded">需登录</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              用户收藏同步接口。支持获取、添加、删除收藏。需要 GitHub OAuth 登录会话。
            </p>

            <h3 className="text-sm font-medium mb-2">GET — 获取收藏列表</h3>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl https://nav-site.netlify.app/api/favorites \\
  -b "next-auth.session-token=..."`}</code></pre>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`{
  "favorites": ["uuid-1", "uuid-2", "uuid-3"]
}`}</code></pre>

            <h3 className="text-sm font-medium mb-2">POST — 批量添加收藏</h3>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl -X POST https://nav-site.netlify.app/api/favorites \\
  -H "Content-Type: application/json" \\
  -b "next-auth.session-token=..." \\
  -d '{"linkIds": ["uuid-1", "uuid-2"]}'`}</code></pre>

            <h3 className="text-sm font-medium mb-2">DELETE — 删除收藏</h3>
            <div className="space-y-1 text-sm text-muted-foreground mb-3">
              <p><code className="text-primary">?linkId=uuid</code> — 删除单条收藏</p>
              <p><code className="text-primary">?all=true</code> — 清空所有收藏</p>
            </div>
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto mb-4"><code>{`curl -X DELETE "https://nav-site.netlify.app/api/favorites?linkId=uuid" \\
  -b "next-auth.session-token=..."`}</code></pre>
          </section>
        </div>

        {/* Rate Limits */}
        <section className="mt-12 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-3">速率限制</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><code className="text-primary">/api/tools</code> — 无限制（上限 100 条/请求）</p>
            <p><code className="text-primary">/api/search</code> — 无限制</p>
            <p><code className="text-primary">/api/click</code> — 同一 IP + URL 15 分钟去重</p>
            <p><code className="text-primary">/api/submit</code> — 每 IP 15 分钟 3 次</p>
            <p><code className="text-primary">/api/reviews</code> — GET 缓存 60s，POST 每 IP 15 分钟 3 次</p>
            <p><code className="text-primary">/api/favorites</code> — 需登录会话，无额外限制</p>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>API 无需认证，可直接调用。如需高频访问或商业使用，请联系管理员获取 API Key。</p>
        </div>
      </div>
    </div>
  );
}
