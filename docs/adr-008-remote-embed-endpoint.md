# ADR-008: 远程 Embedding 端点（HTTPS + API Key）

> 状态：Accepted  
> 日期：2026-07-11  
> 相关：`lib/embedding-runtime.ts`、`lib/search/semantic.ts`、`scripts/embed-server.py`

## 背景

文档向量（BGE-small-zh-v1.5，512 维）与 `search-api-v3` / pgvector RPC 已在生产可用。查询侧 embedding 原先只允许 loopback `EMBED_SERVER_URL`，Netlify serverless 上没有本机 8003，语义搜索会降级 FTS，Sparkles 按钮灰掉。

## 决策

允许两类端点：

| 形态 | URL | 鉴权 | 运行时 |
|------|-----|------|--------|
| 本地 loopback | `http(s)://127.0.0.1\|localhost\|::1` | 可选 `EMBED_SERVER_API_KEY` | 非 serverless 默认允许；serverless 需 `EMBED_SERVER_LOOPBACK_ENABLED` |
| 远程生产 | **仅 HTTPS** 非 loopback | **必须** `EMBED_SERVER_API_KEY`（Bearer） | Netlify 等 serverless 可直接用 |

解析入口：`resolveEmbedEndpoint`（`resolveLoopbackEmbedEndpoint` 保留为别名）。  
请求头：`buildEmbedRequestHeaders` → `Authorization: Bearer <key>`。  
服务端：`scripts/embed-server.py` 在设置 `EMBED_SERVER_API_KEY` 时校验 Bearer（`secrets.compare_digest`）。

## 接口约定

```http
POST /embed-query
Authorization: Bearer <EMBED_SERVER_API_KEY>   # 远程必填；loopback 可选
Content-Type: application/json

{"text":"<query>"}

→ 200 {"embedding": number[512], "dim": 512}
```

```http
GET /health
Authorization: Bearer <key>   # 与上相同策略

→ 200 {"status":"ok","dim":512,"model":"BAAI/bge-small-zh-v1.5"}
```

维数与模型必须与入库向量一致（512 + 同一 BGE）。

## 生产配置（Vercel · 当前）

```text
EMBED_SERVER_URL=https://nav-site-embed-proxy.xiej4352.workers.dev
EMBED_SERVER_API_KEY=<long-random-secret>
```

历史 Netlify 同构变量；生产单轨已迁 Vercel。不要设置 `EMBED_SERVER_LOOPBACK_ENABLED`。不要用远程 HTTP。

## 拒绝的替代

- 仅开 `EMBED_SERVER_LOOPBACK_ENABLED`：serverless 上没有目标进程。
- 浏览器端 transformers.js：体积、弱设备、一致性风险（可另议）。
- 任意第三方 非 512/非 BGE API：相似度漂移。

## 后果

- 语义搜索在生产可真正走 vector（依赖你部署的远程 BGE 服务）。
- 远程无 key 或 HTTP 一律 skip，行为与旧「禁止 non-loopback」同样安全，但错误信息更明确。
- Netlify credit / 重部署仍是独立阻塞；代码合入后需部署 + 配 env 才能验收。