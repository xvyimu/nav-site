# ChronoPortal · 长波总控进度 · cp-long-wave

> **总控 wt：** `cp-coord` · `C:/Users/yuanjia/orca/workspaces/ChronoPortal/cp-coord`  
> **Repo：** ChronoPortal · id `d66b93c4-de90-424d-93fb-389270e7c767`  
> **Base tip：** `df11a2f2`（origin/master）  
> **更新：** 2026-07-24 G0 已批 · Phase2 开跑  
> **红线：** 不写业务于总控 · 锁 webpack · **不**拆 CSP/RLS · **不**改生产 Supabase/Vercel · **不** push master · live ≤3 · 只动 ChronoPortal

---

## 0. 一句话

| 项 | 值 |
|----|-----|
| Phase | **Phase2 dispatched** · 首模块 `cp-admin-lh-ssr` |
| G0 | **已批** · 范围 **C′：前台 P0 残余 + Admin 明显瀑布 P1**（非全量 Admin 重写 · 非生产 CSP/RLS） |
| Scout | **DONE** · DEBT/DISPATCH/RECEIPT 已并入本目录 · 关树中 |
| 北极星 | 现栈性能/稳定可验证增量；每模块 evidence + commit；不 merge master |

---

## 1. G0 授权（人 · 本消息）

| 项 | 决定 |
|----|------|
| 范围 | **仅前台 P0 + Admin 明显瀑布 P1** |
| 非范围 | 全量 Admin 重写 · 生产 CSP/RLS flip · Stage A 写 env · 换栈 · 去 webpack · push master |
| 验证 | 允许 typecheck / test / build（**webpack**） |
| push | **否**（除非另授） |
| merge master | **总控不做** · 只产 INTEGRATE.md |

---

## 2. Worktree 名表

| displayName | branch | status | live | 处置 |
|-------------|--------|--------|------|------|
| master | master | in-progress | 0 | KEEP 主 checkout |
| **cp-coord** | xvyimu/cp-coord | in-progress | 1 | **KEEP 总控** |
| cp-coord-perf | xvyimu/cp-coord-perf | in-progress | 0 | 陈旧 · 本波不叠 |
| cp-scout-lw | (removed) | DONE | 0 | **已 rm** · 分支保留 `xvyimu/cp-scout-lw` @ `cd18f539` |
| cp-admin-lh-ssr | (removed) | DONE | 0 | **`96becf7c`** pushed |
| cp-home-static-client | (removed) | DONE | 0 | **`98170d9e`** pushed |
| cp-links-pool | (removed) | DONE | 0 | **`a3bd6e74`** pushed |
| cp-admin-auth-dedupe | (removed) | DONE | 0 | **`d6860240`** pushed |
| cp-typecheck-probe-headers | (removed) | DONE | 0 | **`6015f650`** |
| cp-revalidate-tags | (removed) | DONE | 0 | **`83ec908d`** |
| cp-search-payload | (removed) | DONE | 0 | **`ce4c0443`** |
| cp-webpack-lock-docs | (removed) | DONE | 0 | **`11515f0e`** |
| **cp-csp-sentry-vitals** | xvyimu/cp-csp-sentry-vitals | in-progress | 1 | **W9 live** |
| **cp-admin-bundle-split** | xvyimu/cp-admin-bundle-split | in-progress | 1 | **W10 live** |

---

## 3. Scout 结论（摘要）

| 产物 | 路径 |
|------|------|
| DEBT | [`DEBT.md`](./DEBT.md) |
| DISPATCH（安全波全表） | [`DISPATCH.md`](./DISPATCH.md) |
| 回执 | [`SCOUT-RECEIPT.md`](./SCOUT-RECEIPT.md) |
| scout tip | `cd18f539` on `xvyimu/cp-scout-lw` |

**探针：** 生产 `build-info` = `46e71ec`（落后 tip）· Preview `*.vercel.app` **timeout 28** · health `resourceLibrarySearch` **error**  
**风险一句：** Preview 网阻断 + 生产 runtime 落后；DB 最高风险 `model_rankings` public 写（**本波不碰**）。

**G0 范围过滤：** 安全 Wave 0–2（CSP/RLS/headers/prod-deploy）→ **本波 DEFER**（记入 INTEGRATE 建议，不派 live）。  
本波只取 **前台残余 P0** + **Admin 瀑布 P1**。

---

## 4. 本波 DEBT 切片（G0 过滤后）

| ID | Sev | 摘要 | 模块 | 序 |
|----|-----|------|------|----|
| **D-ADM-WF-01** | P1 | Admin `/admin/link-health`：layout/page `auth` 后 **仅 client** `useEffect` 再拉 findings → 空态瀑布 | **M-CP-admin-lh-ssr** | **1 live** |
| **D-ADM-WF-02** | P1 | Admin layout + 各 page **重复 `auth()`**（未 `cache`）→ 同请求双读 session | M-CP-admin-auth-cache | 2（可并入 1 若最小） |
| **D-FE-P0-01** | P0 residual | 2026-07-18 G1–G6 **已合 tip**（ResultGrid 去 remount / DualTrack 预算 / 动画降噪）— **验收复核** + 缺口补测 | M-CP-fe-perf-verify | 3 |
| D-HLTH-01 | P1 | 生产 health `resourceLibrarySearch` RPC unavailable | M-CP-resource-rpc | 本波可选 / 偏后端 · 排后 |
| D-FE-P0-02 | P2 | 库内 icon 覆盖率回填（数据工程） | DEFER | — |
| D-CSP-* / D-RLS-* / D-HDR / D-OPS-deploy | P0–P1 | 安全/部署门闩 | **本波 DEFER** · 见 DISPATCH Wave 0–2 | — |

前台 07-18 清单执行结果已标完成；本波「前台 P0」= **防回归验收 + 仍可量的稳定/挂载缺口**，不做重写。

---

## 5. Phase2 派工序（≤3 live）

| 序 | Module | wt 名 | 边界 | 验证 |
|----|--------|-------|------|------|
| 1 | **M-CP-admin-lh-ssr** | `cp-admin-lh-ssr` | `app/admin/link-health/**` · `components/admin/LinkHealthPanel.tsx` · `lib/repositories/link-health*` · 相关 API 只读/预取 · **不**改 RLS/CSP | typecheck + 相关 vitest + 可选 build |
| 2 | M-CP-admin-auth-cache | `cp-admin-auth-cache` | `lib/auth.ts` 或 thin `getAdminSession` + layout/pages 去重 | typecheck + admin 边界测 |
| 3 | M-CP-fe-perf-verify | `cp-fe-perf-verify` | `components/ResultGrid*` · DualTrack · Atlas · frontend-performance tests | vitest frontend-performance · typecheck |

---

## 6. 阶段看板

| Phase | 状态 |
|-------|------|
| Phase0 scout | **DONE** |
| G0 | **DONE**（C′ · 一周续航） |
| Phase1 ACCEPTANCE | 见 §7 · 随模块 evidence |
| Phase2 模块 | **W1–W8 DONE** · **W9+W10 live** · 见 `WEEK-BACKLOG.md` |
| Phase3 verify | W11 |
| Phase4 INTEGRATE | W12 · 只写 `INTEGRATE.md` · 不 merge |

---

## 7. ACCEPTANCE（本波）

| # | 验收 | 门闩 |
|---|------|------|
| A1 | link-health 首屏有 SSR/`initialData` findings，无「先空表再转圈再满」必现瀑布 | 代码 + 测或手工路径说明 |
| A2 | 同请求 admin 布局不重复无 cache 的 session 解析（若做 #2） | code review + typecheck |
| A3 | 前台 G4/G5 相关测仍绿 | vitest exit 0 |
| A4 | 无生产 CSP/RLS/env 变更 · 无 push | evidence 声明 |
| A5 | 每模块 `docs/ops/cp-<id>-evidence-YYYY-MM-DD.md` + 最小 commit | 路径存在 |

---

## 8. 派工日志

| 时序 | 动作 | 结果 |
|------|------|------|
| T0 | 启总控 · progress · scout create | OK |
| T1 | scout DONE · DEBT/DISPATCH/RECEIPT | tip `cd18f539` |
| T2 | **G0 人批** C′ 前台 P0 + Admin 瀑布 P1 | 本文件 |
| T2 | 并入 scout 文档 → coord `cp-long-wave/` | OK |
| T2 | scout stop/rm | OK · preserved branch `xvyimu/cp-scout-lw` @ `cd18f539` |
| T2 | create `cp-admin-lh-ssr` | OK · head `df11a2f2` · agent `term_099f1d80…` |
| T2 | 终端卫生 | 关 MINGW64 · 仅 agent 一窗 |
| T3 | 一周续航人闸 · 写 `WEEK-BACKLOG.md` W1–W12 | OK |
| T3 | 巡检 W1 | agent 长 idle · dirty 有码无 commit → unblock |
| T4 | W1 harvest | **`96becf7c`** · push · rm |
| T4 | W2 | create → **`98170d9e`** · vitest24/0 · push · rm |
| T5 | create W3+W4 | `cp-links-pool` + `cp-admin-auth-dedupe` · live=2 · base `df11a2f2` |
| T6 | 7m 巡检 | W3/W4 无 commit → nudge · 开 W5 · live=3 满 |
| T7 | harvest W3/W4 | a3bd6e74 / d6860240 · vitest 0 · push · rm · 开 W6+W8 · nudge W5 |
| T8 | harvest W5 | **`6015f650`** typecheck0 · push · rm · 开 W7 · live W6+W7+W8 |
| T9 | harvest W6/W8/W7 | `83ec908d` / `11515f0e` / `ce4c0443` · 开 W9+W10 · live=2 |

---

## 9. 不做

换栈 · 去 webpack · 生产 CSP/RLS flip · 改生产 Supabase/Vercel · push master · merge master · 动 Chronicle · 停 orca · 假绿 · Agent×N 冒充舰队 · 全量 Admin 重写
