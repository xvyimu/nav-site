# Release Manifest — 2026-07-18 优化候选

> 状态：本地候选已形成；staging 对象验收部分完成；**未 push / 未部署 / 未对生产迁库**
> 主计划：`docs/optimization-and-release-plan-2026-07-18.md`
> ADR：`docs/adr-009-admin-frontend-backend-interface.md`

## 1. 版本绑定

| 项 | 值 |
|---|---|
| 分支 | `master`（`origin/master` **ahead 1+**，未 push） |
| 基线 SHA | `9733897d8d417e36cb293e94fff11cde4215ec76` |
| 运行时候选 SHA | `78369801db5b1c2e7314b8bdfa337be5412faeeb` |
| 本 manifest 更新 | 见后续 docs commit（不改变运行时候选语义） |
| 形成日期 | 2026-07-18 |
| 是否已 push | **否** |
| 是否已部署 | **否** |
| 是否已对生产迁库 | **否** |

## 2. Release scope 冻结

### 2.1 纳入运行时候选 `78369801`

**管理后台 interface / UI**

- `lib/admin/client.ts`、`lib/admin/contracts.ts`
- `components/admin/*`（含 `AdminWorkspace`、`AdminNav`、`AdminQueryProvider`、`FadeContent`、`admin-queries` 等）
- `app/admin/*`、`app/api/admin/*`、`lib/with-admin.ts`、`components/admin/useAdminLinks.ts`

**壳层 / 登录 / a11y**

- `components/AppChrome.tsx`、`components/Providers.tsx`、`app/layout.tsx`、`app/login/page.tsx`、`app/globals.css`

**分类 / 链接 / 标签 / 限流 / 安全**

- `lib/category-tree.ts`、`lib/repositories/*`、`lib/rate-limit*.ts`、`lib/csrf.ts`、`lib/auth.ts`
- 相关 API：`favorites`、`submit`、`health`、`resource-*`

**Resource Library / 搜索契约**

- `lib/resource-library/client.ts`、`lib/search/response-schema.ts`、`components/navigation/useServerSearch.ts`

**ToolQuickView / 前台**

- `components/ToolQuickView.tsx`、`ResultGrid.tsx` 及对应测试

**CI / 依赖**

- `.github/workflows/ci.yml`（移除 PR 高权限 RL 凭据）
- `package.json`、`pnpm-lock.yaml`（`@tanstack/react-query` 等）

**数据库脚本（入库；staging 见 §4）**

1. `scripts/migration-category-hierarchy.sql`
2. `scripts/migration-nav-category-cycle-guard.sql`（+ rollback）
3. `scripts/migration-tags.sql`
4. `scripts/migration-admin-link-tags-transaction.sql`（+ rollback）
5. `scripts/migration-nav-access-hardening.sql`
6. `scripts/migration-rate-limit-runtime.sql`
7. `scripts/migration-nav-runtime.rollback.sql`（保留 `consume_rate_limit` 签名）

**测试 / E2E / 运维脚本**

- `tests/*`（admin boundary/client/login/workspace、category-tree、production-runbook 等）
- `e2e/*`、`scripts/run-admin-playwright.mjs`、`scripts/check-launch-readiness.mjs`

**文档**

- `docs/optimization-and-release-plan-2026-07-18.md`
- `docs/adr-009-admin-frontend-backend-interface.md`
- `docs/admin-optimization-closeout-2026-07-17.md`
- `docs/perf/*-2026-07-17.json`
- `docs/release-manifest-2026-07-18.md`
- `THIRD_PARTY_NOTICES.md`
- `findings.md` / `progress.md` / `task_plan.md`

### 2.2 明确排除

| 路径 | 原因 |
|---|---|
| `public/build-info.json` | `.gitignore`；构建产物 |
| `.env*` / 本地 secret 文件 | 永不入库 |
| `node_modules/`、`coverage/`、`.next/` | 生成物 |

### 2.3 架构不可变约束（候选内保持）

1. 不拆微服务；无浅 service 转发层。
2. RSC 继续直连 repository；Client UI → `lib/admin/client.ts` → Route Handler → repository。
3. API URL / method / JSON envelope / Auth / CSRF / Cookie 语义不变。
4. 不读取或提交 secret 值。

## 3. 代码门禁（绑定运行时候选 `78369801`）

| 命令 | 脏树预检 | 候选 `78369801` 复跑 |
|---|---|---|
| `pnpm run lint` | pass | **pass** |
| `pnpm run typecheck` | pass | **pass** |
| `pnpm test` | 525 pass / 6 skip | **525 pass / 6 skip** |
| `pnpm run test:coverage` | stmt 63.5% | **stmt 63.5%** |
| `pnpm run build` | Next 16.2.9 webpack pass | **pass**（webpack） |
| `pnpm run audit:security` | no known vulns | **pass** |
| `node scripts/pre-commit-secret-scan.mjs` | pass | **pass** |
| `git diff --check` | pass | **pass** |

说明：`pnpm run build` 过程中仍出现 `Category hierarchy migration missing` / `Optional tags tables unavailable` 日志，表明**本地 `.env.local` 指向的运行时库与 nav-dev staging 不是同一套已迁库状态**。这不否定代码门禁，但阻断“候选应用 + 已迁库 staging 联调”结论。

## 4. 数据库兼容矩阵（supabase-nav-dev）

目标 staging：`nzaocqwumlmbewoddysd`（MCP `supabase-nav-dev`）。  
**禁止**：`vyqqbypwrbdcafanzwmj`（MCP `supabase-nav-prod`）。

| 迁移 | Staging 状态 | 验收 | Production |
|---|---|---|---|
| category-hierarchy | 已有（`add_category_hierarchy` / `parent_id`） | 对象存在 | **禁止** |
| tags | 已有（`create_nav_tags`） | 对象存在 | **禁止** |
| nav-access-hardening | 已有（`harden_nav_access`） | 历史 migration 记录 | **禁止** |
| rate-limit-runtime | 已有（`enable_atomic_rate_limits` + buckets + RPC） | `consume_rate_limit` smoke `allowed=true,count=1` | **禁止** |
| category-cycle-guard | **本轮应用** `nav_category_cycle_guard` | 自指 parent 拒绝；trigger/fn/constraint 存在；anon/auth 无 EXECUTE | **禁止** |
| admin-link-tags-transaction | **本轮应用** `admin_link_tags_transaction_rpcs` | 非法 tag 创建不留下 link；service_role 可执行，anon/auth 否 | **禁止** |

行为验收摘要（2026-07-18，nav-dev）：

1. 对象：`create/update_nav_link_with_tags`、`prevent_nav_category_cycle`、trigger、`nav_categories_parent_not_self`、`consume_rate_limit` 均存在。
2. 权限：上述函数 `anon`/`authenticated` = false，`service_role` = true。
3. 原子性：坏 tag 调用 create RPC 后 `nav_links` 行数不变。
4. 限流：`consume_rate_limit('staging-verify-78369801', 60, 5)` 返回 allowed。

限制：nav-dev 为共享开发库（含 cat_memories 等）；不是干净 disposable 克隆。未跑完整并发限流压测与应用层 E2E 写路径。

## 5. 已知限制（发布阻断）

| ID | 状态 |
|---|---|
| R0 候选 SHA | 本地 `78369801` 已形成；**未 push** |
| DB0 staging 迁移验收 | 对象/权限/关键行为 **通过**；完整应用联调未做 |
| QA0 E2E 绑定候选 | **未执行**（见下节风险门） |
| CD0 Vercel 后验探针 | 未完成 |
| OBS0 生产基线 | 未完成 |

## 6. E2E 风险门（待确认后执行）

| 项 | 内容 |
|---|---|
| 目标 | `pnpm e2e` + `pnpm e2e:admin`，绑定候选 `78369801` |
| 环境 | 本地 dev server；`.env.local` 必须显式指向 **nav-dev**，不得指向 prod |
| 风险 | 写库（分类/链接/标签）、启停服务、可能触发真实限流桶；admin E2E 需要管理员会话凭据 |
| 验证 | Playwright 退出码 0；报告/trace 记录候选 SHA |
| 回滚 | 删除 E2E 产生的测试数据；停 dev server；不改生产 |

**未获“E2E 可对 nav-dev 写库”的单独确认前不执行。**

## 7. Go/No-Go

**当前：No-Go（条件放宽仍未达标）。**

已具备：本地候选 SHA、代码门禁全绿、nav-dev 缺失迁移补齐与关键行为验收。  
仍缺：push、E2E、候选应用指向已迁库 staging 的联调证据、Vercel 探针、生产迁库与部署确认。

## 8. 回滚要点

- 应用：Vercel 回退上一稳定 deployment（发布后）。
- 数据库：优先保留加法式对象与安全收紧；`migration-nav-runtime.rollback.sql` **不得** DROP `consume_rate_limit`。
- 专用 rollback：`migration-nav-category-cycle-guard.rollback.sql`、`migration-admin-link-tags-transaction.rollback.sql`（仅 staging 演练时使用）。
