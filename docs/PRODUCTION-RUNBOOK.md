# 生产运行手册

> 最后更新：2026-07-11  
> 适用项目：nav-site  
> **当前生产入口：`https://nav-site-kappa.vercel.app`**（Vercel Hobby）  
> 历史 Netlify：`https://nav-site.netlify.app` — credits 用尽，已迁 Vercel；勿空触发 Netlify deploy

## 目标

这份手册用于生产发布、故障处理、账号额度恢复、健康检查和跨代理交接。任何涉及生产数据库、部署平台 secret、GitHub secret、账单和域名 DNS 的操作，都先按本手册确认影响范围，再执行。

## 语义检索 / Embedding（2026-07-11）

生产向量检索已通：

```text
Vercel → https://nav-site-embed-proxy.xiej4352.workers.dev
  → https://embed.aijiaqi.ccwu.cc (Named Tunnel)
  → 本机 127.0.0.1:18003 (BGE-small-zh-v1.5 · 512-d)
```

| 探针 | 期望 |
|------|------|
| `GET /api/health` → `checks.embedding` | `ok` |
| `GET /api/resource-search-status` | `available/vector/rpc: true` |
| `POST /api/resource-search` `{"query":"...","mode":"vector"}` | `mode: "vector"` |

本机日常：

```powershell
powershell -NoProfile -File D:/nav-site/scripts/start-embed-native.ps1
powershell -NoProfile -File D:/nav-site/scripts/start-embed-tunnel.ps1
```

完整架构与 Bot Fight：`docs/embed-fly-deploy.md`  
Worker 重部署：`scripts/deploy-embed-proxy-worker.ps1`  

**脆弱点：** 本机关机或 tunnel 断 → embedding 降级 FTS。改 Vercel `EMBED_SERVER_*` 后必须 redeploy。

## 日常发布流程

1. 本地确认工作树只包含预期改动：

```powershell
rtk git status --short --branch
```

2. 运行本地质量门禁：

```powershell
rtk pnpm run lint
rtk pnpm run typecheck
rtk pnpm test
rtk pnpm run build
rtk pnpm run audit:security
rtk node scripts/pre-commit-secret-scan.mjs
```

3. **当前生产 = Vercel**（`nav-site-kappa.vercel.app`）。推送/CLI deploy 以 Vercel 项目 `nav-site` 为准；改 `EMBED_SERVER_*` 等 env 后必须 **redeploy** 才进运行时。

4. **历史 Netlify 路径**（credits 恢复前勿用）：`master` push → quality + build + E2E only；生产 deploy 仅 `workflow_dispatch`：`CI 检查 / 手动 Netlify 部署`。额度用尽期间 **禁止空触发**。

5. 部署后复验（Vercel）：

```text
GET  https://nav-site-kappa.vercel.app/api/health               → embedding=ok
GET  https://nav-site-kappa.vercel.app/api/resource-search-status → vector:true
POST https://nav-site-kappa.vercel.app/api/resource-search  {"query":"大模型","mode":"vector"}
```

仓库质量门脚本 `verify:production:*` / `verify:launch-readiness` 仍可跑；入口 URL 以 Vercel 为准。

## Netlify Credit 问题

### 现象

GitHub Actions deploy job 在 preflight 或 Netlify trigger 阶段失败，并出现类似：

```text
Netlify account credit usage exceeded
```

### 永久处理策略

- **生产已迁 Vercel**；Netlify 额度恢复前不要重复触发 Netlify deploy。
- 保持 `master` push 以代码验证为主；Vercel 侧改 env 后必须 redeploy。
- 若将来回切 Netlify：额度恢复后只触发一次手动 deploy，并等待探针完成。
- 额度用尽期间先跑本地和 GitHub quality/build/E2E。

### 验证

```powershell
rtk pnpm test tests/wait-netlify-deploy.test.ts tests/ci-workflow.test.ts
rtk pnpm run verify:launch-readiness -- --skip-network
```

## 健康检查语义

生产健康入口：

```text
https://nav-site-kappa.vercel.app/api/health
```

核心字段：

| 检查项 | 期望 | 是否阻断主站健康 | 说明 |
|---|---:|---:|---|
| `database` | `ok` | 是 | 主 Supabase 分类表连通性 |
| `env` | `ok` | 是 | 必需公开 Supabase env 是否存在，不暴露值 |
| `sentry` | `ok` 或 `skipped` | 否 | Sentry 是可选观测项 |
| `embedding` | `ok`、`skipped` 或 `error` | 否 | 语义搜索可降级到 Fuse；loopback 在 serverless 默认跳过；远程须 HTTPS + `EMBED_SERVER_API_KEY`（见 ADR-005） |
| `resourceLibrarySearch` | `ok` 或 `skipped` | 否 | 资源库公开搜索 RPC；`error` 会被生产探针标红 |

资源库搜索健康检查只使用 `RESOURCE_LIBRARY_ANON_KEY` 或 `RESOURCE_LIBRARY_SUPABASE_ANON_KEY` 调用公开 RPC `resource_search_health`。缺 key 时标记 `skipped`，不会回退到 service role。

### Embedding 远程端点（生产语义搜索）

本地开发：`EMBED_SERVER_URL=http://127.0.0.1:18003`（或 8003 历史端口）。

生产（**Vercel**，2026-07-11 已通）：

1. 本机 `scripts/embed-server.py`（BGE-small-zh-v1.5，512 维）+ Named Tunnel `embed.aijiaqi.ccwu.cc`。
2. Worker 反代 `https://nav-site-embed-proxy.xiej4352.workers.dev`（绕 zone Bot Fight 对 Vercel 出口的 403）。
3. Vercel env（encrypted）：
   - `EMBED_SERVER_URL=https://nav-site-embed-proxy.xiej4352.workers.dev`
   - `EMBED_SERVER_API_KEY=<same as .embed-api-key.local>`
4. 不要设 `EMBED_SERVER_LOOPBACK_ENABLED`；不要用远程 HTTP 明文。

验收：

- `/api/health` → `checks.embedding.status === "ok"`
- `/api/resource-search-status` → `{ "available": true, "vector": true, "rpc": true }`
- `mode=vector` 不降级 FTS

详见 `docs/embed-fly-deploy.md` · `docs/adr-005-remote-embed-endpoint.md`。

## 生产探针

当前生产可用性：

```powershell
rtk pnpm run verify:production
```

最新 commit 是否部署：

```powershell
rtk pnpm run verify:production:latest -- --expect-commit <commit-sha>
```

上线总门禁：

```powershell
rtk pnpm run verify:launch-readiness
```

如果生产探针失败，先看失败 endpoint：

- `home`：主站不可访问或返回非 HTML。
- `health`：健康 JSON 结构或关键检查异常。
- `search`：主搜索接口异常。
- `tool-detail`：详情页渲染异常。
- `sitemap` / `robots`：SEO 基础文件异常。
- `build-info`：线上 commit 与预期不一致。

## Resource Library 操作边界

本项目只保留公开读路径的配置和验证，不在普通发布中直接操作资源库生产库。

上线前确认：

- Resource Library 项目已执行 `scripts/migration-resource-library-public-read.sql`。
- 部署环境配置了 `RESOURCE_LIBRARY_ANON_KEY` 或 `RESOURCE_LIBRARY_SUPABASE_ANON_KEY`。
- `/api/resource-search-status` 返回 `{ "available": true }` 或在未启用资源库时返回可解释的 unavailable reason。
- `/api/health` 的 `checks.resourceLibrarySearch.status` 为 `ok` 或 `skipped`。

生产 SQL、secret 配置、远程数据库写入应交给有凭据的操作者或 Claude Code 执行，并在执行前确认目标项目、SQL 文件、回滚方案和验证命令。

## 回滚

优先使用 revert commit，不重写历史：

```powershell
rtk git revert <release-commit> --no-edit
rtk git push origin master
```

回滚后：

1. 等待 GitHub quality/build/E2E 通过。
2. 手动运行 `CI 检查 / 手动 Netlify 部署`。
3. 运行 `pnpm run verify:production:latest -- --expect-commit <rollback-commit-sha>`。
4. 检查首页、搜索、详情页、`/api/health`、`/build-info.json`。

## 故障分级

| 等级 | 场景 | 处理 |
|---|---|---|
| P0 | 首页无法访问、`database`/`env` 失败、最新 deploy 明显损坏 | 暂停继续部署，准备 revert，保留日志和 Actions run 链接 |
| P1 | 搜索接口失败、详情页失败、资源库健康 `error` | 禁止继续功能发布，先定位接口或配置 |
| P2 | embedding `error`、Sentry `skipped`、link check 局部失败 | 记录风险，可按业务影响决定是否发布 |
| P3 | 文档、非关键视觉、性能分数波动 | 排入后续优化 |

## Claude Code 交接

生成或读取交接：

```powershell
python C:\Users\yuanjia\agent-memory\scripts\handoff.py latest --project nav-site --to-agent codex
python C:\Users\yuanjia\agent-memory\scripts\handoff.py add --project nav-site --from-agent codex --to-agent claude-code --summary "<当前状态>" --next-step "<下一步>"
```

交接时必须说明：

- 当前 commit、分支、是否已 push。
- 本地验证结果。
- 生产 deploy 是否已触发。
- 生产是否在 Vercel；embedding/vector 是否 ok；本机 native+tunnel 是否在线。
- 是否需要生产 Supabase/Resource Library 操作。
- 不要在 handoff、日志、commit message、README 中写入任何 secret。
