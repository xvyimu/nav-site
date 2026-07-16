# API 参考

> 生产入口：`https://yuanjia1314.ccwu.cc`  
> 最后更新：2026-07-16

## 公开 API（无需认证）

### `GET /api/health`

深度健康检查。

**响应：** `200`（全部健康）或 `503`（部分健康失败）

```json
{
  "status": "healthy",
  "timestamp": "2026-07-16T...",
  "uptime_seconds": 3600,
  "environment": "production",
  "latency_ms": 42,
  "version": { "node": "v22.x", "app": "0.1.0", "commit": "abc123", "branch": "master" },
  "memory": { "rss_mb": 128, "heap_used_mb": 64, "heap_total_mb": 96 },
  "checks": {
    "database": { "status": "ok", "latency_ms": 5, "detail": "6 categories" },
    "env": { "status": "ok", "latency_ms": 0, "detail": "all required vars present" },
    "sentry": { "status": "ok", "latency_ms": 0, "detail": "configured" },
    "embedding": { "status": "ok", "latency_ms": 150, "detail": "embed service reachable" },
    "resourceLibrarySearch": { "status": "ok", "latency_ms": 200, "detail": "public resource search RPC reachable" }
  }
}
```

**注意：** error message 不暴露给外部，仅返回 `"database query failed"` 等通用描述。

---

### `GET /api/search?q=<query>&category=<slug>&limit=<n>&semantic=<bool>`

全文搜索与语义搜索入口。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `q` | string | `""` | 搜索关键词 |
| `category` | string | `""` | 分类 slug 过滤 |
| `limit` | int | `20` | 结果数量上限（≤100） |
| `semantic` | bool | `false` | 启用语义搜索 |

**速率限制：** 分布式，每 IP 60s 内 Fuse 60 次 / semantic 20 次。

**响应：** `200`

```json
{ "results": [{ "id": "uuid", "title": "...", "url": "...", "description": "...", "category_name": "...", "category_slug": "...", "featured": false, "paid": false, "click_count": 0, "tags": [], "similarity": 0.95, "source": "fuse|semantic" }], "total": 5 }
```

---

### `GET /api/tools?limit=<n>&category=<slug>&search=<q>&ids=<uuid,…>`

AI Agent / 第三方友好 API。返回结构化工具列表。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `limit` | int | `50` | 结果数量上限（≤100） |
| `category` | string | — | 分类 slug 过滤 |
| `search` | string | — | 关键词搜索 |
| `ids` | string | — | 逗号分隔 UUID 精确匹配 |

**速率限制：** 无。

**缓存：** `Cache-Control: public, s-maxage=60`

**响应：** `200`

```json
{ "total": 50, "category": "all", "tools": [{ "name": "Figma", "slug": "figma", "url": "https://figma.com", "description": "...", "icon": "https://...", "category": "设计工具", "tags": ["ui"], "click_count": 42, "detail_page": "https://.../tool/figma" }] }
```

---

### `GET /api/favicon?domain=<domain>`

Favicon 代理。按优先级尝试三个源：cccyun → DuckDuckGo → Google S2。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `domain` | string | — | 域名（必填，Zod 校验 + 出口检查） |

**速率限制：** 分布式，每 IP 60s 内 120 次。

**响应：** `200 image/*` + `X-Favicon-Source` 头，或 `404`（全部源失败）。

**安全：** 无 direct 源；`redirect: "manual"`；响应体 ≤512KB；禁止非 80/443 端口。

---

### `GET /api/reviews?link_id=<uuid>`

工具评价。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `link_id` | uuid | — | 工具 UUID（必填） |

**缓存：** `Cache-Control: public, max-age=60`

**响应：** `200`

```json
{ "reviews": [{ "id": "uuid", "rating": 5, "comment": "...", "created_at": "..." }], "stats": { "review_count": 10, "avg_rating": 4.2, "five_star_count": 5, "four_star_count": 3, "three_star_count": 1, "two_star_count": 1, "one_star_count": 0 } }
```

---

### `GET /api/resource-browse?category=<slug>&limit=<n>`

资源库浏览。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `category` | string | — | 分类过滤 |
| `limit` | int | `80` | 上限 `200` |

**缓存：** `Cache-Control: public, max-age=60`

**响应：** `200` `{ "results": [...] }`

---

### `GET /api/resource-search-status`

资源库搜索健康探测。

**响应：** `200`

```json
{ "available": true, "vector": true, "rpc": true }
```

---

### `GET /api/resource-ratings?page_id=<uuid>`

资源评分统计。

**缓存：** `Cache-Control: public, max-age=30`

**响应：** `200` `{ "count": 5 }`

---

### `GET /api/health` — 见上

---

## 公开写 API（CSRF 保护）

所有写端点统一 `checkOrigin`（Origin 与 Host 匹配），失败返回 403。

### `POST /api/click`

记录链接点击。

**Body：** `{ "linkId": "uuid" }`  
**速率限制：** 每 IP 15min 内限定（atomic 去重）  
**响应：** `200` `{ "success": true }` 或 `{ "success": true, "deduplicated": true }`

---

### `POST /api/submit`

用户提交新链接。

**Body：** `{ "url": "https://...", "title": "...", "description": "...", "category": "slug" }`  
**速率限制：** 每 IP 15min 3 次  
**响应：** `200` `{ "success": true }` | `409` `{ "error": "该站点已收录/已提交" }` | `429` rate limit

---

### `POST /api/reviews`

提交评价。

**Body：** `{ "link_id": "uuid", "rating": 5, "comment": "..." }`  
**速率限制：** 每 IP 15min 限定  
**响应：** `200` `{ "success": true, "review": {...}, "message": "..." }` | `409` `{ "error": "您已经评价过这个工具" }`

---

### `POST /api/resource-ratings`

提交资源评分。

**Body：** `{ "page_id": "uuid", "rating": 4, "query_text": "..." }`  
**速率限制：** 每 IP 15min 10 次（fail-close）  
**响应：** `200` `{ "success": true }` | `503` rate limit failed

---

## 登录用户 API

### `GET/POST/DELETE /api/favorites`

已登录用户收藏管理。

**认证：** NextAuth session（任意已登录用户）  
**速率限制（写操作）：** 分布式，每 IP 15min 30 次（service_role 限流表）  
**GET：** `{ "favorites": ["uuid", ...] }`  
**POST：** `{ "linkIds": ["uuid1", "uuid2"] }` → `{ "ok": true, "added": 2 }`  
**DELETE：** `?linkId=<uuid>` 或 `?all=true` → `{ "ok": true }`

---

## 管理 API（Admin only）

### `GET/POST /api/admin/links`, `GET/POST /api/admin/categories`, `GET/POST /api/admin/tags`

**认证：** NextAuth session role === "admin"  
**写操作：** CSRF Origin 检查

### `PUT/DELETE /api/admin/links/[id]`, `/api/admin/categories/[id]`, `/api/admin/tags/[id]`

同 admin 认证要求。

---

## 可观测性

### `POST /api/web-vitals`

接收 Core Web Vitals 指标并中继到 Sentry。

**同源检查：** Origin === Host（失败 → 403）  
**速率限制：** 每 IP 60s 30 次  
**响应：** `200` `{ "ok": true }`

---

## 支付桩（Feature-gated）

### `POST /api/checkout` · `POST /api/webhook`

`ENABLE_PAYMENTS_API=0`（默认）时返回 `404`。启用后返回 `501`。

---

## 认证模式汇总

| 模式 | 路由 |
|------|------|
| **Admin**（session role=admin） | `admin/links`、`admin/categories`、`admin/tags` 及其 [id] 变体 |
| **已登录用户** | `favorites` |
| **匿名 + CSRF Origin** | `click`、`submit`、`reviews`、`resource-ratings` |
| **匿名 + 同源检查** | `web-vitals` |
| **完全公开** | `search`、`tools`、`favicon`、`health`、`resource-browse`、`resource-search-status`、`reviews`(GET) |
| **Feature-gated** | `checkout`、`webhook` |