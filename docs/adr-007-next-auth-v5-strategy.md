# ADR-007: next-auth v5 beta 收口策略

| 字段 | 值 |
| --- | --- |
| 日期 | 2026-07-23 |
| 状态 | **已决策** |
| 波次 | portfolio W2 · ChronoPortal |
| 前序 | `docs/adr-002-authjs-migration.md`（已迁到 `next-auth@5.0.0-beta.31`） |
| 范围 | 策略与迁移路径；**本 ADR 不 bump 依赖、不改生产 env** |

## 背景

生产路径仍钉 **`next-auth@5.0.0-beta.31`**（`package.json` pin）。  
ADR-002 曾写「监控 v5 正式版后升级」。W2 需书面选择：

1. 跟稳定版  
2. 风险接受（继续 beta）  
3. 迁移到其他方案  

### 2026-07-23 npm 事实（本机 `npm view`）

| Tag / 查询 | 结果 |
| --- | --- |
| `dist-tags.latest` | **`4.24.15`**（v4 线） |
| `dist-tags.beta` | **`5.0.0-beta.32`** |
| `next-auth@5` | **404**（无 `5` 稳定 dist-tag） |
| 已发布 5.x | `5.0.0-beta.0` … **`5.0.0-beta.32`**（无 `5.0.0` 非 beta） |

仓库当前：Credentials（admin 密码）+ 可选 GitHub OAuth；JWT session；`proxy.ts` 用 `auth()` 做 admin 门闩；类型增强在 `types/next-auth.d.ts`。

## 方案对比

| 方案 | 做法 | 利 | 弊 | W2 判定 |
| --- | --- | --- | --- | --- |
| **A. 跟稳定 5.x** | 等 `latest`≥5 或官方标 stable 再升 | semver 清晰 | **npm 上尚无稳定 5.0.0** | **不可立刻执行** |
| **B. 风险接受 beta（推荐）** | 钉 beta.31；文档化风险；安全/回归驱动再动 | 零迁移成本；与现网一致 | 无 major 稳定保证；依赖维护节奏受 beta 约束 | **采纳** |
| **C. 回退 v4 稳定** | `next-auth@4.24.x` | `latest` 在 v4 | App Router / `auth()` / proxy 模型不匹配；大回退 | **否** |
| **D. 换 Supabase Auth / Better Auth** | 重写 session 与 admin gate | 长期可能更统一 | 重写面大；超出半年 CP 主刀 | **W2–W4 不做** |

## 决策

**选 B：风险接受，继续 pin `next-auth@5.0.0-beta.31`，不在 W2 做版本迁移动作。**

### 理由

1. **没有可「跟」的稳定 5.x 包**（`latest` 仍为 4.24.15；beta 线最新为 beta.32）。  
2. 现网已在 beta.31 上跑 admin Credentials + 可选 GitHub；W2 架构主刀是 CSP/headers，不是 auth 重写。  
3. 无证据表明 beta.31→beta.32 为 **必须** 安全修复；无 CHANGELOG 驱动的紧急 bump 时，避免 lock 抖动。  
4. ADR-002 的「等正式版」目标保留，但改为 **可验证触发条件**（见迁移路径），禁止无限沉默。

### 接受的风险（书面）

| 风险 | 缓解 |
| --- | --- |
| beta API / 行为变更 | pin 精确版本；升级必跑 admin e2e + 登录单测 |
| 安全公告可能只标 beta 线 | 订阅 next-auth / Auth.js 安全通告；`pnpm audit` 纳入 PR 门 |
| 长期滞留 beta | 每波 stack-matrix 勾「v5 stable 是否出现」；出现则开 W3/W4 bump 任务 |
| Credentials 单点 | 已有 IP 限流 + 恒定时延 + hash 密码路径；不在本 ADR 扩 OAuth 强制 |

### 明确不做（本决策窗）

- 不升级到 beta.32（除非后续安全公告要求）  
- 不回退 v4  
- 不换 Supabase Auth / Better Auth  
- 不改 `AUTH_SECRET` / 生产登录行为  

## 迁移路径（当条件满足）

### 触发条件（任一）

1. npm `dist-tags.latest` 进入 **5.x 非 beta**，或官方文档声明 Auth.js v5 stable 且安装指引为非 beta；**或**  
2. 安全公告要求 ≥ 某 beta / 5.x 补丁；**或**  
3. 现 pin 版本无法安装 / 与 Next 补丁线不兼容且上游只修更新 beta。

### 步骤（未来 PR）

1. 读官方 migration + 目标版本 changelog。  
2. 在 worktree 升 pin → `pnpm install` → `pnpm exec vitest run` 中 admin/auth 相关 + `pnpm run e2e:admin`（有凭据时）。  
3. Preview 验证：`/login` → `/admin`、favorites 会话、GitHub 可选路径（若 env 配了）。  
4. 合入默认分支后走既有 Vercel Git 生产路径；**不**为 auth 单独 break-glass `vercel deploy --prod`。  
5. 更新本 ADR 状态为「已执行 · &lt;version&gt;」并改 stack-matrix。

### 若长期无 stable 5.x（&gt; W4）

开独立评估：继续 beta pin **或** 有界 spike Better Auth / Supabase Auth（需单独人 gate，不默认切换）。

## 代码触点（升级时必回归）

| 路径 | 角色 |
| --- | --- |
| `lib/auth.ts` | `NextAuth` · Credentials · 可选 GitHub · JWT/session role |
| `app/api/auth/[...nextauth]/route.ts` | handlers |
| `proxy.ts` | `auth()` admin 门闩 + CSP 旁路 |
| `lib/with-admin.ts` / admin pages | 会话角色 |
| `types/next-auth.d.ts` | Session/JWT role |
| `tests/admin-login.test.tsx` 等 | 单测 |
| `e2e/helpers/admin-session.ts` | e2e |

## 后果

- W2 stack-matrix：next-auth 行标 **决策完成 · pin beta.31 · 风险接受**。  
- W3+：仅在触发条件满足时 bump；CSP/RLS 生产 flip 与 auth 升级错开观察窗更佳。

## 相关

- `docs/adr-002-authjs-migration.md`
- `docs/ops/stack-matrix-2026-07.md`
- `docs/ops/w2-arch-upgrade-chronoportal-claude.md`
