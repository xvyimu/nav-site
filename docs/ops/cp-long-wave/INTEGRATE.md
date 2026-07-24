# ChronoPortal · 长波 INTEGRATE · 2026-07-24

> **总控：** `cp-coord` · G0=C′（前台 + Admin 关键路径）· 一周续航压缩执行  
> **base：** `origin/master` @ `df11a2f2` · **本文件不 merge master**（人 gate）  
> **红线全程守住：** 未 push master · 未去 webpack · 未放宽生产 CSP · 未绕 RLS · 未 D7/asar · 未改生产 Supabase/Vercel env · 未动 Chronicle/它仓

---

## 0. 一句话

W1–W11 全部 DONE，findings CR-002/003/004/005/BUILD 全部 DONE；W11 长验证在**集成候选态**（W5 typecheck 修 + CR-BUILD build 修 cherry-pick 后）三门全绿：**typecheck 0 · test 620(6 skip) 0 · build(webpack) 0**。CR-001 CSP 生产 flip 仍 **DEFER 人 gate**。等人按下表 ff 合入 master。

---

## 1. 合入候选（feature 分支 · 建议顺序）

> 顺序原则：**先 build 修 → 类型修 → 应用增量 → 文档**。逐支 ff 前本地重跑门闩。

| # | 分支 | tip | 类型 | 摘要 |
|---|------|-----|------|------|
| 1 | `cp-cr-csp-report-export` | `a8eb537a` | **P0 build 修** | `toPathOnlyUri` 移出 route → `lib/csp-report-uri.ts`；**修 origin/master 既有 build 红** |
| 2 | `cp-typecheck-probe-headers` | `6015f650` | 类型债 | probe-security-headers JSDoc `ProbeEnv` → typecheck 0 |
| 3 | `cp-admin-lh-ssr` | `96becf7c` | Admin | link-health SSR 预取去首屏瀑布（ADR-009） |
| 4 | `cp-home-static-client` | `98170d9e` | 前台 | 首页 RSC seed `?cat=/?q=` filters + 去死 Suspense |
| 5 | `cp-links-pool` | `a3bd6e74` | 前台/数据 | `getApprovedLinks` 并发 coalesce（singleflight） |
| 6 | `cp-admin-auth-dedupe` | `d6860240` | Admin | `getAdminSession`=`cache(auth)`，layout+page 同请求去重 |
| 7 | `cp-revalidate-tags` | `83ec908d` | Admin | revalidate reason→path 矩阵，tag 不再刷 sitemap |
| 8 | `cp-search-payload` | `ce4c0443` | 搜索 | Fuse limit 截断 + semantic match_count≤80 + RPC 2.5s 软超时降级 |
| 9 | `cp-csp-sentry-vitals` | `11520432` | 观测 | csp-report residual 脱敏 + web-vitals 4KiB/采样门 · **NOT_RELAXED** |
| 10 | `cp-admin-bundle-split` | `e9b4ba01` | Admin | CategoryManager/LinkHealth/LinkList dynamic import |
| 11 | `cp-webpack-lock-docs` | `11515f0e` | 门闩 | scripts `--webpack` 契约测 + AGENTS/PROJECT 双锁 |
| 12 | `cp-cr-rate-limit-ops` | `ddb6d664` | docs | CR-002/003 生产 Upstash 必配 + fail-closed 决策表 |
| 13 | `cp-cr-service-role-checklist` | `faab2a7b` | docs | CR-004 新写 API session 绑定纪律 + 防 userId 注入清单 |
| 14 | `cp-cr-csrf-submit-docs` | `c69517f4` | docs | CR-005 公开 submit CSRF 威胁模型 |
| — | `cp-long-verify` | `3cc56fb3` | 验证 | W11 evidence（含 #1+#2 cherry-pick 后三门全绿快照）· 合并后可弃 |

**注 #9：** `cp-csp-sentry-vitals` tip commit message 为 `chore: WIP patrol`（patrol WIP 名），diff 是真实 W9 改动（csp-report/web-vitals + 测）。**建议合入前 reword** 为 `fix(observability): …` 语义化提交名。

---

## 2. 冲突预判（同文件多支触碰）

| 文件 | 触碰分支 | 处理 |
|------|----------|------|
| `app/admin/link-health/page.tsx` | #3 lh-ssr · #6 auth-dedupe · #10 bundle-split | 按序 ff：SSR prefetch → getAdminSession → dynamic import 叠加；**合后必重跑 admin-boundary 测** |
| `app/admin/categories/page.tsx` | #6 · #10 | 同上 |
| `app/admin/page.tsx` · `layout.tsx` | #6 | 单支 |
| `components/admin/AdminWorkspace.tsx` | #10 | 单支 |
| `app/api/csp-report/route.ts` | #1 · #9 | **#1 先合**（helper 移出）→ #9 的 route 改动 rebase 到 import 版；否则 #9 会带回 export 破 build |
| `lib/auth.ts` | #6 | 单支 |
| `scripts/probe-security-headers.mjs` | #2 | 单支 |

**关键：** #1 必须早于 #9；#9 若含旧 `toPathOnlyUri` export 需 rebase 去重。

---

## 3. 合入门闩（每支 ff 后 / 全合后）

```bash
# 每支 ff 后（最少）
pnpm typecheck          # 期望 0（#2 合入后）
pnpm exec vitest run <该支相关测>

# 全部合完后（W11 等价全量）
pnpm typecheck          # 0
pnpm test               # 620 pass / 6 skip · 0
pnpm run build          # next build --webpack · 0
```

W11 已实证该三门在候选集合态全绿（evidence：`docs/ops/cp-long-verify-evidence-2026-07-24.md`）。

---

## 4. DEFER / 人 gate（本波不执行）

| id | 项 | 门 |
|----|-----|----|
| CP-CR-001 | 生产去 script `unsafe-inline` / `CSP_DYNAMIC=1` | **人授权 + Preview Stage A canary**；`docs/csp-t9-decision` · `w3-csp-prod-gate-dossier` |
| CP-CR-006 | Netlify CSP 与 next.config 漂移 | P2 · 建议注释/archived 标记（未开 wt） |
| CP-CR-010 | next-auth beta.32 → stable | 触发式 · ADR-007 |
| CP-CR-011 | launch-readiness / probe:headers 入 CI 必跑 | P2 soft gate |
| — | Preview Stage A 网络阻断 | `*.vercel.app` timeout；操作人网络恢复后跑 |
| — | 生产 tip 对齐部署 | 人授 `vercel deploy --prod`；build-info commit 对齐 |

---

## 5. 波次账本

| 阶段 | 结果 |
|------|------|
| Phase0 scout | `cp-scout-lw` → DEBT/DISPATCH（rm，branch 保留） |
| W1–W11 | 全 DONE · 各 evidence 在 `docs/ops/cp-*-evidence-2026-07-24.md` |
| findings CR | CR-002/003/004/005 + CR-BUILD DONE · CR-001/006 DEFER |
| W11 三门 | typecheck 0 · test 0 · build 0 |
| push | 全 feature 支已 push origin · **master 未动** |
| child wt | 全部 stop + rm · 仅 `cp-coord` 总控留存 |

---

## 6. 人 gate 待办（收口）

1. 审本文件 §1 顺序 + §2 冲突预判。
2. 逐支 ff 合入 master（**总控不代 merge**），#1→#2 优先，#9 合前 reword + 确认无 route export。
3. 全合后跑 §3 全量门闩，绿则可授权生产部署（另 gate）。
4. CP-CR-001 CSP 生产 flip 单独 gate，勿与本批同日。
5. 合毕可删已合 feature 分支 + `cp-long-verify`。

**状态：INTEGRATE READY · 等人 gate。总控不 merge master、不 push master。**
