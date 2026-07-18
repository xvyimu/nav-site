# Release Manifest — 2026-07-18 优化候选

> 状态：**生产已部署；主域 commit 探针 PASS；favicon 后验修复已上线**
> 主计划：`docs/optimization-and-release-plan-2026-07-18.md`
> ADR：`docs/adr-009-admin-frontend-backend-interface.md`
> 前台性能清单：`docs/frontend-perf-optimization-2026-07-18.md`

## 1. 版本绑定

| 项 | 值 |
|---|---|
| 分支 | `master` |
| 基线 SHA | `9733897d8d417e36cb293e94fff11cde4215ec76` |
| 运行时主候选（admin + 迁库） | `78369801db5b1c2e7314b8bdfa337be5412faeeb` |
| 首轮生产部署 commit | `d23a5c4636ad0f9bf4ef7183983cd8be0e163d95` |
| **当前公开 HEAD / 生产 build-info** | **`46981a1aed3d58b2d10236d8413e30d112b8b5dc`** |
| 形成日期 | 2026-07-18 |
| 是否已 push | **是**（`origin/master` = `46981a1a`） |
| 是否已部署 | **是（Production）** `dpl_3KnaaDy7kR3yQ9hcx1Dq2gCkGWaq` → `https://yuanjia1314.ccwu.cc` |
| 是否已对生产迁库 | **是（2026-07-18，MCP supabase-nav-prod）** |

### 1.1 d23a5c46 → 46981a1a 增量

| Commit | 说明 |
|---|---|
| `3e1a8a79` | docs: 生产迁库 / 部署 / 主域探针记录 |
| `ff16a93e` | fix: 侧栏切换保留滚动 + 加速 favicon 加载 |
| `353a1fda` | perf: 首屏挂载预算 + 分类切换不再 remount 整表 |
| `5b8afd1b` | docs: 记录 perf UX 部署 |
| `b8cb1f6a` | fix: DualTrack 预算吃光后分类区零卡片 |
| `9c8175ee` | fix: 分类区首屏始终挂载卡片 |
| `46981a1a` | fix: favicon 跟随 redirect + 404 有效图 + monogram 兜底 |

## 2. E2E 结果（nav-dev only，绑定 78369801 候选）

| 套件 | 结果 |
|---|---|
| chromium home+admin | **32/32 pass** |
| mobile-chrome home+admin | **32/32 pass** |
| admin-performance | **pass**（产物 `docs/perf/admin-baseline-2026-07-18.json`） |

进程覆盖：URL/anon→DEV；`SERVICE_ROLE` 与 `_PROD` 均强制 nav-dev。

后验增量（`ff16a93`–`46981a1`）本地门禁：相关 vitest + typecheck 通过；全量 E2E 未在每次 hotfix 重跑（范围限于公开首页 UX / favicon 代理）。

## 3. Preview 部署

| 项 | 值 |
|---|---|
| 历史 preview | `https://nav-site-hwujbkm1x-aijiai520.vercel.app` |
| status | Ready / target=preview |
| 功能探针 | **未通过**（Deployment Protection 返回 HTML 登录墙） |
| 环境变量 | 项目 env 当前仅挂 **Production**；Preview 无完整 Supabase 配置 |

结论：preview 仅证明构建成功，**不能**作为功能验收。验收以主域为准。

## 4. 生产数据库（supabase-nav-prod / `vyqqbypwrbdcafanzwmj`）

按序应用（幂等，2026-07-18）：

1. `nav_category_hierarchy`（parent_id）
2. `nav_category_cycle_guard`
3. `create_nav_tags`
4. `admin_link_tags_transaction_rpcs`
5. `nav_access_hardening`
6. `rate_limit_runtime_and_attempt_tables`（含缺失的 `login_attempts`/`submit_attempts`）

对象验收：parent_id / tags / RPCs / cycle guard / buckets / attempts 均存在。  
行为验收：自指 parent 拒绝；坏 tag create 不落残 link；RPC 仅 service_role 可执行；`consume_rate_limit` smoke ok。

本轮 hotfix（`ff16a93`–`46981a1`）**无新迁移**。

## 5. 生产部署与探针

### 5.1 首轮（d23a5c46）

| 项 | 值 |
|---|---|
| Production deployment | `dpl_J7MCS6QY3VqtdizzSCuv1hz6xtWd` |
| `/build-info.json` | `commit=d23a5c46...` |
| 主域探针 | **PASS** |

### 5.2 当前（46981a1a）

| 项 | 值 |
|---|---|
| Production deployment | `dpl_3KnaaDy7kR3yQ9hcx1Dq2gCkGWaq` |
| 主域 | `https://yuanjia1314.ccwu.cc` |
| `/build-info.json` | `commit=46981a1aed3d58b2d10236d8413e30d112b8b5dc` · `generatedAt=2026-07-18T09:16:06.536Z` |
| 主域探针 | **PASS**（home/health/search/tool-detail/sitemap/robots/build-info） |
| Favicon 后验 | 原失败域名恢复真实图标或 monogram 200；首页网络 129 次 favicon 请求 **0 失败**；源分布 ddg / google-v2 / monogram / cccyun / google-s2 |

偶发：`/tool/figma` 可能被 Cloudflare “Just a moment…” 403；复探针通过。

## 6. Go/No-Go

**Go（主域 · 当前 HEAD）。**

- 代码：`46981a1a` 已 push 并作为生产 build-info commit  
- DB：生产候选迁移已应用且关键行为验收通过；hotfix 无 schema 变更  
- 主域探针：退出码 0 且 commit 匹配  
- 前台 UX：侧栏滚动 / 首屏预算 / favicon 代理修复已上线并抽检  
- 限制：preview 功能探针未完成；部署直链受 Protection；embedding 仍依赖本机 BGE 路径（health 默认可 degraded）

## 7. 回滚

- 应用：Vercel 回退上一 Production Ready deployment  
- 数据库：保留加法式对象与安全收紧；勿 DROP `consume_rate_limit`  
- 专用 rollback：`migration-nav-category-cycle-guard.rollback.sql`、`migration-admin-link-tags-transaction.rollback.sql`（仅必要时）
- Favicon hotfix 回滚：回到 `353a1fda` 部署即可（会恢复旧 404 行为）

## 8. 值守建议

1. 盯 `/api/health` 与错误率  
2. 抽查 `/admin` 登录与链接/分类读写  
3. 抽查首页图标：破图应为 0；极少数 monogram 属预期（上游无有效图）  
4. 若 Cloudflare 对 `/tool/*` 拦截升高，放行主域探针 UA 或调 WAF  

## 9. 已知后续（不阻断本轮 Released）

1. `nav_links.icon` 数据回填（覆盖率目标 >90%）  
2. E2E：分类切换 `scrollY` 断言  
3. Preview 环境完整 Supabase 配置 + 功能探针  
4. Embedding 常开迁 VPS / 云 GPU（见 `docs/embed-fly-deploy.md`）  
5. 生产 RUM / Sentry 基线仪表盘固化  
