# 生产运行手册

> 最后更新：2026-07-20  
> 适用项目：nav-site  
> **生产入口：`https://yuanjia1314.ccwu.cc`**（自定义域 · Vercel 项目 `nav-site` · **verified**）  
> **当前生产 HEAD**：以 `GET /build-info.json` 的 `commit` 为准（2026-07-18 收口运行时为 `ee5a047b`）  
> 发布单次记录：`docs/release-manifest-2026-07-18.md`  
> Embed 架构：`docs/embed-fly-deploy.md`（**路径 B = Cloudflare Workers AI 为生产默认**）  
> 值守：`docs/oncall-and-alerts.md` · Preview：`docs/preview-env-setup.md`  
> DNS（Cloudflare zone `yuanjia1314.ccwu.cc` / gmail 账）：apex **CNAME** → `41f090bbdb4a5afe.vercel-dns-017.com`（橙云）+ `_vercel` **TXT** 校验  
> 历史 Netlify site `nav-site`：**账号侧已 disable**（`credit_save_vercel_primary`）+ build hook 已删 + custom_domain 已解绑；`netlify.toml` ignore **默认跳过全部构建**。  
> 紧急 Netlify 构建：先 enableSite，再 `NETLIFY_FORCE_BUILD=1` 或 allowlist（一般不需要）

## 目标

这份手册用于生产发布、故障处理、账号额度恢复、健康检查和跨代理交接。任何涉及生产数据库、部署平台 secret、GitHub secret、账单和域名 DNS 的操作，都先按本手册确认影响范围，再执行。

## 语义检索 / Embedding（生产默认 · 2026-07-18/19）

### 路径 B — 主导航（24×7 · **当前默认**）

```text
Vercel
  EMBED_PROVIDER=cloudflare
  CF_ACCOUNT_ID / CF_AI_API_TOKEN
  → Workers AI @cf/baai/bge-m3 (1024-d)
  → RPC search_links_semantic_v2
  → nav_links.embedding_1024
```

| 探针 | 期望 |
|------|------|
| `GET /api/health` → `checks.embedding` | `ok` · detail 含 `cloudflare embedding ready (1024-d)` |
| `GET /api/search?q=...&semantic=true` | hybrid / 含 similarity |
| `GET /build-info.json` | commit = 生产运行时 HEAD（`ee5a047b`） |

生产 env（Vercel encrypted）：

```text
EMBED_PROVIDER=cloudflare
CF_ACCOUNT_ID=<Cloudflare account id>
CF_AI_API_TOKEN=<Workers AI token · 用户 durable cfut_>
EMBED_DIM=1024
EMBED_SEMANTIC_RPC=search_links_semantic_v2
```

**不依赖本机进程。** Fly / VPS BGE **不做主路径**（无账单/VPS）；见 `docs/embed-fly-deploy.md` §路径 B。

### 路径 A — Resource Library / 备援（本机 BGE 512-d · 可选）

仅当需要 RL 向量或把主导航临时回滚到 embed-server 时启动：

```text
Vercel/本机 → Worker 反代（可选）
  → Named Tunnel embed.aijiaqi.ccwu.cc
  → 127.0.0.1:18003  BGE-small-zh-v1.5 · 512-d
```

```powershell
# 幂等拉起 native + tunnel
powershell -NoProfile -File D:/nav-site/scripts/ensure-embed-stack.ps1

# 停
powershell -NoProfile -File D:/nav-site/scripts/stop-embed-tunnel.ps1
powershell -NoProfile -File D:/nav-site/scripts/stop-embed-native.ps1
```

| 探针（路径 A） | 期望 |
|------|------|
| `GET http://127.0.0.1:18003/health` | `dim:512` · BGE-small-zh |
| `GET /api/resource-search-status` | `available/vector/rpc: true`（依赖 RL 配置） |

**登录自启（可选 · 默认已卸载）：** 任务名 `nav-site-embed-stack`。主导航已走 CF 后，一般不必再装。

**脆弱点（仅路径 A）：** 本机关机/未跑 ensure → RL 向量或备援路径失败；主导航 CF 路径不受影响。  
**勿**把 `EMBED_SERVER_URL` 指回失效 `*.trycloudflare.com` quick tunnel。

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

5. 部署后复验（主域优先；Vercel 别名亦可）：

```text
GET  https://yuanjia1314.ccwu.cc/api/health
     → checks.embedding.status=ok · cloudflare embedding ready (1024-d)
GET  https://yuanjia1314.ccwu.cc/build-info.json
pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <prod HEAD>
# RL 向量（可选，依赖本机/备援路径 A）
GET  https://yuanjia1314.ccwu.cc/api/resource-search-status → vector:true
```

仓库质量门脚本 `verify:production:*` / `verify:launch-readiness` 仍可跑。

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
| `embedding` | `ok`、`skipped` 或 `error` | 否 | **生产默认 CF 1024-d**；可降级 Fuse。`embed-server` 远程须 HTTPS + API Key（ADR-008） |
| `resourceLibrarySearch` | `ok` 或 `skipped` | 否 | 资源库公开搜索 RPC；`error` 会被生产探针标红 |

资源库搜索健康检查只使用 `RESOURCE_LIBRARY_ANON_KEY` 或 `RESOURCE_LIBRARY_SUPABASE_ANON_KEY` 调用公开 RPC `resource_search_health`。缺 key 时标记 `skipped`，不会回退到 service role。

### Embedding 路径对照

| 路径 | 用途 | Provider / 维 | 依赖本机？ |
|------|------|---------------|-----------|
| **B（默认）** | 主导航语义 | `cloudflare` · 1024 | 否 |
| **A（可选）** | RL / 回滚 | `embed-server` · 512 | 是（native + tunnel） |

路径 A 远程形态（历史生产入口，现作备援）：

1. 本机 `scripts/embed-server.py`（BGE-small-zh-v1.5，512 维）+ Named Tunnel `embed.aijiaqi.ccwu.cc`。
2. Worker 反代 `https://nav-site-embed-proxy.xiej4352.workers.dev`（绕 zone Bot Fight 对 Vercel 出口的 403）。
3. env：`EMBED_PROVIDER=embed-server` + `EMBED_SERVER_URL` / `EMBED_SERVER_API_KEY`；不要设 `EMBED_SERVER_LOOPBACK_ENABLED`；不要用远程 HTTP 明文。

本地开发也可直接 `EMBED_SERVER_URL=http://127.0.0.1:18003`。

详见 `docs/embed-fly-deploy.md` · `docs/adr-008-remote-embed-endpoint.md`（ADR-008 描述路径 A 远程端点契约）。

### 回填 / 重建 `embedding_1024`（路径 B）

前置：库中已有 `nav_links.embedding_1024`、`idx_nav_links_embedding_1024`、`search_links_semantic_v2`、`batch_update_embeddings_v2`（见 `scripts/migration-audit-s0-constraints.sql`）。

```powershell
python scripts/backfill-embeddings.py --provider cloudflare --limit 5 --dry-run
python scripts/backfill-embeddings.py --provider cloudflare --dry-run
# 确认目标库、env、费用和输出后再写入：
python scripts/backfill-embeddings.py --provider cloudflare --apply --batch-size 8
```

### 回填命令参考

```powershell
# 默认 dry-run：不写入，仅打印行数
python scripts/backfill-embeddings.py

# 增量写入全部链接
python scripts/backfill-embeddings.py --apply

# 限制 N 条（调试用）
python scripts/backfill-embeddings.py --apply --limit 50

# 指定 provider（local / embed-server / cloudflare）
python scripts/backfill-embeddings.py --provider cloudflare --apply

# 覆盖维度与 RPC 名称
python scripts/backfill-embeddings.py --dim 1024 --rpc batch_update_embeddings_v2 --apply

# 覆盖 batch size（cloudflare 默认 25，local 默认 50）
python scripts/backfill-embeddings.py --batch-size 10 --apply

# 使用 checkpoint 续跑（自动检测 provider/RPC/dim 一致性）
python scripts/backfill-embeddings.py --resume --apply
# 默认 checkpoint 路径：.backfill-embeddings.checkpoint.json
# 自定义路径：--checkpoint my-checkpoint.json

# 忽略已有 checkpoint 强制重跑
python scripts/backfill-embeddings.py --reset-checkpoint --apply

# 指定 model 名称（override 默认模型名）
python scripts/backfill-embeddings.py --provider local --model BAAI/bge-m3 --apply
```

### Checkpoint 机制

- 每次成功 RPC write 后自动保存 `last_id` + `processed` 计数。
- `--resume` 加载 checkpoint 时校验 provider / RPC 名 / dim 三者一致，不一致则报错拒绝续跑（防止误切背景后错误续跑）。
- 追加 `--reset-checkpoint` 即可忽略已有 checkpoint 从头开始。
- Checkpoint 文件不会自动删除，手动清理：`rm .backfill-embeddings.checkpoint.json`。

### 回滚

回填本质是幂等更新（`batch_update_embeddings` / `batch_update_embeddings_v2` RPC 写固定列）。如需回滚到旧嵌入：

1. **Cloudflare 1024-d → 回退 embed-server 512-d：**
   - 设置 Vercel env 为 `EMBED_PROVIDER=embed-server`、`EMBED_DIM=512`、`EMBED_SEMANTIC_RPC=search_links_semantic`。
   - 恢复 `EMBED_SERVER_URL` / `EMBED_SERVER_API_KEY`。
   - Redeploy 后运行 `python scripts/backfill-embeddings.py --provider local --apply` 重写 512-d 列。
   - `embedding_1024` 列保留不动，不干扰旧路径。

2. **全量替换（切换 provider）：**
   - 新 provider 的 RPC 写入不同列（`embedding` 或 `embedding_1024`）。
   - 只需 redeploy + 切换 env，无需删除旧列。旧列保留作为回退。

3. **手动回滚一条链接：**
   - 直接 `UPDATE nav_links SET embedding = NULL WHERE id = '<uuid>'`（不推荐，仅调试用）。

Cloudflare 官方模型页确认 `@cf/baai/bge-m3` REST 调用使用 `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/baai/bge-m3` 和 `{"text":[...]}` 输入；生产代码同时校验 `EMBED_DIM=1024`。回填脚本默认用 `batch_update_embeddings_v2` 写入 1024 维列，不覆盖旧 512 维 `embedding`。

切换后验收：

```powershell
rtk pnpm run verify:production -- --require-embedding
```

回滚：把 Vercel env 改回 `EMBED_PROVIDER=embed-server`、`EMBED_DIM=512`、`EMBED_SEMANTIC_RPC=search_links_semantic`，恢复 `EMBED_SERVER_URL` / `EMBED_SERVER_API_KEY`，redeploy。`embedding_1024` 可以保留，不影响旧路径。

### Upstash 分布式限流（S2）

公开读路径已接入 `lib/rate-limit-distributed.ts`：`/api/search`、`/api/favicon`、`/api/resource-search`、`/api/tools`、`/api/web-vitals`。敏感写（`/api/submit`、favorites 写、resource-ratings、login、reviews）走 Supabase `checkRateLimit(..., "deny")`，与 Upstash 无关。

#### 1. 配置 Upstash（推荐生产多实例）

Vercel Production env（encrypted）：

```text
UPSTASH_REDIS_REST_URL=<https://...upstash.io>
UPSTASH_REDIS_REST_TOKEN=<token>
```

设置后必须 redeploy。未配置时自动回退进程内桶（soft mode，不阻断部署）。

#### 2. 可选 fail-closed（默认关闭）

仅在 Upstash 已配置且健康验证通过后，再考虑开启：

```text
DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED=1
```

生效条件：`NODE_ENV=production` 或 `VERCEL=1`，且值为 `1`。本地普通 dev 不会因该变量单独进入 fail-closed。未配 Upstash 时不要开启（见下）。

#### 3. Health 含义（`checks.distributedRateLimit`）

| status | 含义 |
|--------|------|
| `skipped` | 未配置 Upstash，soft mode（memory fallback） |
| `ok` | Upstash env 已配置（不 live ping Redis） |
| `error` | fail-closed 开启且 Upstash 缺失 → 整体 unhealthy **503** |

#### 4. 故障模式

- fail-closed **关** + Upstash 抖动/不可用 → 代码 warn 并回退 memory，公开路径尽量放行，主站不因 Redis 挂掉。
- fail-closed **开** + Upstash 缺失/请求失败 → 分布式检查 `allowed:false, backend:"unavailable"`；路由统一映射 **429**（不发明 503）；未配置时 health `distributedRateLimit=error` → **503**。

#### 5. 验收

本地：

```powershell
rtk pnpm test tests/rate-limit-distributed.test.ts tests/api-health.test.ts tests/probe-production.test.ts tests/check-launch-readiness.test.ts
```

线上 smoke（不要求真实 Upstash 已开通也能过 soft mode）：

```powershell
rtk pnpm run verify:production
```

真实 Redis 开通与 Vercel secrets 写入属运维带外步骤，不在代码仓库内完成。Launch readiness 仅校验「fail-closed 开启时必须同时有 URL+TOKEN」，不连 Redis。

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

幂等（IF NOT EXISTS / CREATE OR REPLACE）；PART 2 建唯一索引前会先检测历史重复 URL，若存在重复组会中止并要求人工处理，**不会在迁移里静默删除生产行**。末尾 SELECT 校验表、索引、1024 维列与 v2 RPC 存在。

**未执行时的降级行为（不崩）：** `click_rate_limits` 缺失 → 点击去重写失败仅 warn，计数可能重复但不 500；`nav_links.url` 无唯一索引 → 去重退化为应用层 `findExistingLinkByUrl` 查重（并发窗口可能漏）。执行后即恢复强一致。

## Resource Library 操作边界

本项目只保留公开读路径的配置和验证，不在普通发布中直接操作资源库生产库。

上线前确认：

- Resource Library 项目已执行 `scripts/migration-resource-library-public-read.sql`。
- 部署环境配置了 `RESOURCE_LIBRARY_ANON_KEY` 或 `RESOURCE_LIBRARY_SUPABASE_ANON_KEY`。
- `/api/resource-search-status` 返回 `{ "available": true }` 或在未启用资源库时返回可解释的 unavailable reason。
- `/api/health` 的 `checks.resourceLibrarySearch.status` 为 `ok` 或 `skipped`。

生产 SQL、secret 配置、远程数据库写入应交给有凭据的操作者或 Claude Code 执行，并在执行前确认目标项目、SQL 文件、回滚方案和验证命令。

## 链接健康（死链队列 · C3）

运营闭环：CLI 检测 → 可选入库 → Admin 列表 → 人工「标记已处理」。**不**自动下架/改 URL；**不**在恢复正常时自动 resolve。

### 1. 迁移（按需 apply，本切片不强制生产）

```text
scripts/migration-link-health.sql
```

在目标 Supabase SQL Editor 执行。Rollback 见文件头注释。未 apply 时 Admin `GET /api/admin/link-health` 返回 200 + `meta.unavailable: true` 空列表，不 500。

### 2. CLI

```powershell
# Markdown + JSON（默认 link-health-report.json）
pnpm check:links

# 仅 JSON 路径可自定义
node scripts/check-links.mjs --json ./tmp-report.json

# 写入 open findings（需 SUPABASE_SERVICE_ROLE_KEY；persist 失败只 warn，exit 仍由 BROKEN 数决定，exit 2 = 有死链）
node scripts/check-links.mjs --report --json --persist
```

Redirects 默认以 `kind=redirect` 入队；broken 为 `kind=broken`。同一 `link_id`+`kind` 且 `resolved_at IS NULL` 则 update，否则 insert。

### 3. Admin

- 导航：「链接健康」→ `/admin/link-health`
- API：`GET/POST /api/admin/link-health`（admin；写操作 CSRF）
  - resolve：`{ "action": "resolve", "id": "<uuid>" }`
  - import：`{ "action": "import", "report": { ...check-links JSON... } }`

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
