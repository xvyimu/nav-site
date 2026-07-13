# 生产运行手册

> 最后更新：2026-07-13  
> 适用项目：nav-site  
> **生产入口：`https://yuanjia1314.ccwu.cc`**（自定义域 · Vercel 项目 `nav-site` · **verified**）  
> 备用直连：`https://nav-site-kappa.vercel.app`（同部署）  
> DNS（Cloudflare zone `yuanjia1314.ccwu.cc` / gmail 账）：apex **CNAME** → `41f090bbdb4a5afe.vercel-dns-017.com`（橙云）+ `_vercel` **TXT** 校验  
> 历史 Netlify site `nav-site`：**账号侧已 disable**（`credit_save_vercel_primary`）+ build hook 已删 + custom_domain 已解绑；`netlify.toml` ignore **默认跳过全部构建**。  
> 紧急 Netlify 构建：先 enableSite，再 `NETLIFY_FORCE_BUILD=1` 或 allowlist（一般不需要）

## 目标

这份手册用于生产发布、故障处理、账号额度恢复、健康检查和跨代理交接。任何涉及生产数据库、部署平台 secret、GitHub secret、账单和域名 DNS 的操作，都先按本手册确认影响范围，再执行。

## 语义检索 / Embedding（2026-07-12）

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
| `POST /api/resource-search` `{"query":"...","mode":"hybrid"}` | `mode: "hybrid"`（RRF） |

本机日常：

```powershell
# 幂等拉起 native + tunnel
powershell -NoProfile -File D:/nav-site/scripts/ensure-embed-stack.ps1

# 或分步
powershell -NoProfile -File D:/nav-site/scripts/start-embed-native.ps1
powershell -NoProfile -File D:/nav-site/scripts/start-embed-tunnel.ps1
```

**登录自启（可选 · 2026-07-13 默认已卸载）：**

```powershell
# 当前状态：计划任务 nav-site-embed-stack 已卸；需语义检索时手动 ensure
powershell -NoProfile -File D:/nav-site/scripts/ensure-embed-stack.ps1

# 若要重新安装登录自启：
powershell -NoProfile -File D:/nav-site/scripts/install-embed-autostart.ps1
# 卸载
powershell -NoProfile -File D:/nav-site/scripts/uninstall-embed-autostart.ps1
```

任务名：`nav-site-embed-stack` · 登录后 90s · 日志 `.embed-autostart.log`  

**脆弱点：** 本机关机/未跑 ensure → embedding error；默认 health 仍 healthy（探针可设 `HEALTH_REQUIRE_EMBEDDING=1` 或 `pnpm verify:production` 加 `--require-embedding`）。语义搜索降级 FTS。  
**勿**把 `EMBED_SERVER_URL` 指回失效 `*.trycloudflare.com` quick tunnel。  
**云端路径说明：** Worker + Named Tunnel 只是公网入口；**origin 仍是本机 BGE**（非始终在线云 GPU）。长期应迁 VPS。见 `docs/embed-fly-deploy.md`。

### 管理员密码（scrypt）

```powershell
# 生成哈希（勿把明文写进仓库）
pnpm hash:admin-password
# 或：node scripts/hash-admin-password.mjs "your-password"

# Vercel Production env：
#   ADMIN_PASSWORD_HASH=scrypt$16384$8$1$...
# 配置 HASH 后删除 ADMIN_PASSWORD 明文，然后 redeploy
```

**生产 / Vercel：仅认 `ADMIN_PASSWORD_HASH`。** 明文 `ADMIN_PASSWORD` 在 `NODE_ENV=production` 或 `VERCEL=1` 下会被拒绝。本地开发仍可临时用明文。

### 生产探针与系统代理

本机若启用 IE/系统代理（如 FlClash `127.0.0.1:7890`），PowerShell 能通而 Node undici 直连会 `UND_ERR_CONNECT_TIMEOUT`。

`scripts/probe-production.mjs` 会自动读 `HTTPS_PROXY` / Windows 注册表代理并 `ProxyAgent`：

```powershell
pnpm run verify:production
# 强制直连：pnpm exec node scripts/probe-production.mjs --no-proxy
```

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
- **2026-07-12：** 账号侧 `disableSite` 已执行；build hook 清空；站点 custom_domain 解绑。代码 ignore 仍默认 skip。
- 保持 `master` push 以代码验证为主；Vercel 侧改 env 后必须 redeploy。
- 若将来回切 Netlify：`enableSite` → 额度恢复 → 只触发一次手动 deploy，并等待探针完成。
- 额度用尽期间先跑本地和 GitHub quality/build/E2E。
- 自定义域切 Vercel 步骤见记忆 `nav-site-domain-cutover-todo`（TXT 校验 + CF DNS）。

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

详见 `docs/embed-fly-deploy.md` · `docs/adr-008-remote-embed-endpoint.md`。

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

## 审计 S0 迁移（2026-07-13 · 上线前必须执行）

`7aa2baa7` 起的 S0 修复依赖两条 DB 约束，代码已上线但**约束需先在生产库执行**，否则线上行为与代码不匹配：

- `lib/rate-limit.ts::tryRecordClick` 依赖 `click_rate_limits` 表 + `UNIQUE(ip, url, window_start)`（先插后计原子去重）。
- `lib/repositories/submissions.ts::submitLink` 依赖 `nav_links.url` 唯一索引（重复提交 → 23505 → 409）。

执行（Supabase SQL Editor 或有凭据者）：

```text
scripts/migration-audit-s0-constraints.sql
```

幂等（IF NOT EXISTS / DROP IF EXISTS）；PART 2 建唯一索引前会**先合并历史重复 URL**（保留最早一行）。末尾 SELECT 校验三项索引/表存在。

**未执行时的降级行为（不崩）：** `click_rate_limits` 缺失 → 点击去重写失败仅 warn，计数可能重复但不 500；`nav_links.url` 无唯一索引 → 去重退化为应用层 `findExistingLinkByUrl` 查重（并发窗口可能漏）。执行后即恢复强一致。

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
