# Release Manifest — 2026-07-18（最终收口）

> 状态：**ENDED / Released Go（主域）** · Cloudflare 1024-d 语义常开已上线  
> 主计划：`docs/optimization-and-release-plan-2026-07-18.md`  
> 前台性能：`docs/frontend-perf-optimization-2026-07-18.md`  
> Preview：`docs/preview-env-setup.md` · 值守：`docs/oncall-and-alerts.md` · Embed：`docs/embed-fly-deploy.md`

## 1. 版本绑定

| 项 | 值 |
|---|---|
| 分支 | `master` = `origin/master`（文档/清理后续 commit 可能更新） |
| **生产运行时 HEAD** | **`ee5a047b`**（T1–T10 代码；env 切换不改 commit） |
| 生产 deploy（CF embed） | `dpl_6GCemEkco5zaRGxxzx7Y6bRccorj` → https://yuanjia1314.ccwu.cc |
| 基线 SHA | `9733897d…` |
| 形成日期 | 2026-07-18 |
| 生产迁库 | **是**（supabase-nav-prod + `embedding_1024` 列/RPC 已有） |

**口径：** 运行时事实源 = 主域 `/build-info.json`（`ee5a047b`）。ops/docs commit 不必强制 prod 部署。

## 2. 验收（终检）

| 检查 | 结果 |
|---|---|
| 主域 `verify:production` expect `ee5a047b` | **PASS** |
| health.embedding | **`cloudflare embedding ready (1024-d)`** |
| `/api/search?semantic=true` | hybrid 结果含 similarity（e.g. Leonardo AI ~0.71） |
| `embedding_1024` 覆盖 | **512/512** |
| Preview SSO | **null**；nav-dev env 已挂 |
| icon preferred | **512/512** |
| Lighthouse desktop | Perf **0.97** |

## 3. Embedding 架构（生产默认）

```text
Vercel EMBED_PROVIDER=cloudflare
  + CF_ACCOUNT_ID / CF_AI_API_TOKEN
  → Workers AI @cf/baai/bge-m3 (1024-d)
  → RPC search_links_semantic_v2
  → nav_links.embedding_1024
```

- Resource Library 仍固定 **512-d**（`generateResourceEmbedding` 忽略 provider，走 embed-server/本机路径）。  
- 本机 Named Tunnel 可保留作 RL/备援，**不再阻塞主导航语义搜索**。  
- Fly/VPS：可选灾备；账单硬阻塞**不阻断**当前方案。

## 4. Preview

| 项 | 值 |
|---|---|
| Supabase | nav-dev `nzaocqwumlmbewoddysd` |
| service_role | `SUPABASE_DEV_SERVICE_ROLE` → Preview |
| embed | 与生产同：`EMBED_PROVIDER=cloudflare` + CF 凭证 |
| SSO | 关闭 |

## 5. Go/No-Go

**Go · 项目收口（含 24×7 语义）。**

## 6. 回滚

- 应用：Vercel 回退上一 Production deployment  
- Embed 回本机：`EMBED_PROVIDER=embed-server` + `EMBED_SERVER_URL`/`KEY`，redeploy  
- DB：保留 `embedding` 512-d 与 `embedding_1024`；勿 DROP `consume_rate_limit`

## 7. Backlog T1–T10

| ID | 结果 |
|---|---|
| T1 icon 回填 | ✅ |
| T2 E2E scrollY | ✅ |
| T3 Lighthouse | ✅ Perf 0.97 |
| T4 Preview env | ✅ |
| T5 embed 上云 | ✅ **Cloudflare 1024-d 常开** |
| T6 RUM/Sentry | ✅ 文档 |
| T7–T10 | 见架构债文档 |

## 8. 值守

`docs/oncall-and-alerts.md`。探针：

```powershell
pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit ee5a047b29e030afc60e75e57b0be913e6b2fd00
```

## 9. 明确不做 / 可选

| 项 | 状态 |
|---|---|
| Fly 绑卡部署 BGE | 可选灾备，非主路径 |
| 专用长期 CF API Token | ✅ 已用用户提供的 `cfut_` Workers AI token（User env + Vercel）；勿提交 git |
| 为 docs 再 prod 部署 | 不做 |
