# ChronoPortal · 一周续航 WEEK-BACKLOG · 2026-07-24

> **总控：** `cp-coord` · G0 = **C′**（前台 + Admin 关键路径）· 续航 7 天  
> **北极星：** 锁 webpack · **不**拆 CSP/RLS · **不**改生产 · P0/P1 性能与 Admin 瀑布债 → 可测增量  
> **日循环：** 收 DONE → evidence 审 → stop/rm → 开下一项 · live **≤3** · 每日回写本文件 + `progress.md`  
> **红线：** 禁去 webpack / 放宽 CSP / 绕 RLS / push master / 动 Chronicle / 假绿

---

## 0. 状态总览

| 项 | 值 |
|----|-----|
| 日序 | Day 0 续 · **CR-BUILD DONE** · **W11 re-verify live** |
| tip base | `df11a2f2` + fix feature `a8eb537a` |
| live | **1** · `cp-long-verify` |
| 已 harvest | W1–W10 · CR-002/004/005 · **CR-BUILD `a8eb537a` build0** |
| findings | CR-001 DEFER · CR-002/004/005/BUILD DONE · CR-006 queued |
| 下一开 | W11 DONE → **W12 INTEGRATE** |
| INTEGRATE | W12 · 总控只写说明 · **不** merge master |

---

## 1.  backlog（W1–W12）

| W | Module ID | wt 名 | 边界（做） | 不做 | 验收 | 状态 |
|---|-----------|-------|-----------|------|------|------|
| **W1** | M-CP-admin-lh-ssr | `cp-admin-lh-ssr` | link-health SSR/`initialData` 预取 · Panel 可 refresh/resolve · ADR-009 | 全量 Admin 重写 · RLS | evidence + vitest **0** · typecheck **2**（既有 probe 债→W5） | **DONE** · branch `xvyimu/cp-admin-lh-ssr` @ **`96becf7c`** · **pushed feature** · wt **rm** |
| **W2** | M-CP-home-static-client | `cp-home-static-client` | 首页 RSC seed `?cat=`/`?q=` · 去无用 Suspense · url-state 可测 | 换 UI 栈 · 虚拟列表 | vitest **24** exit **0** · typecheck **2**（probe 既有） | **DONE** · `98170d9e` **pushed** · wt **rm** |
| **W3** | M-CP-links-pool | `cp-links-pool` | `coalesceInFlight` + getApprovedLinks | Meili | vitest **6** exit **0** | **DONE** · **`a3bd6e74`** pushed · rm |
| **W4** | M-CP-admin-auth-dedupe | `cp-admin-auth-dedupe` | `getAdminSession`=cache(auth) · layout/pages | 改登录逻辑 | vitest admin-boundary **4** exit **0** | **DONE** · **`d6860240`** pushed · rm |
| **W5** | M-CP-typecheck-probe-headers | `cp-typecheck-probe-headers` | ProbeEnv JSDoc · typecheck0 | 生产头 flip | typecheck **0** · probe 测 6/0 | **DONE** · **`6015f650`** pushed · rm |
| **W6** | M-CP-revalidate-tags | `cp-revalidate-tags` | reason→path 矩阵 · tag 不扫 sitemap | 绕 RLS | vitest **9** exit **0** | **DONE** · **`83ec908d`** pushed · rm |
| **W7** | M-CP-search-payload | `cp-search-payload` | Fuse limit + semantic cap80 + 2.5s timeout 降级 | Meili | vitest **31** exit **0** | **DONE** · **`ce4c0443`** pushed · rm |
| **W8** | M-CP-webpack-lock-docs | `cp-webpack-lock-docs` | webpack-scripts-lock 契约测 + docs | 改 bundler 默认 | vitest **2** exit **0** | **DONE** · **`11515f0e`** pushed · rm |
| **W9** | M-CP-csp-sentry-vitals | `cp-csp-sentry-vitals` | csp-report 脱敏 · web-vitals 可测 · **NOT_RELAXED** | 生产 CSP flip | vitest **30** exit **0** | **DONE** · **`11520432`** pushed · rm |
| **W10** | M-CP-admin-bundle-split | `cp-admin-bundle-split` | dynamic Category/LinkHealth/LinkList | 功能重写 | vitest admin-boundary **3** exit **0** | **DONE** · **`e9b4ba01`** pushed · rm |
| **W11** | M-CP-long-verify | `cp-long-verify` | 全量 typecheck/test/build | push master | 须 build0 | **IN_PROGRESS** re-open |
| **CR-BUILD** | M-CP-cr-csp-report-export | `cp-cr-csp-report-export` | toPathOnlyUri → lib | 放宽 CSP | vitest6 **build0** | **DONE** · **`a8eb537a`** rm |
| **W6** | M-CP-revalidate-tags | `cp-revalidate-tags` | revalidate 标签合理化（Admin 写后路径） | **绕 RLS** · 乱扩公开 revalidate | 契约/边界测 · typecheck | queued |
| **W7** | M-CP-search-payload | `cp-search-payload` | Fuse/vector 查询体积与超时降级（payload 瘦身/超时路径） | 上 Meili/ES · 无阈值全量拆池 | search 相关 vitest + typecheck | queued |
| **W8** | M-CP-webpack-lock-docs | `cp-webpack-lock-docs` | scripts/文档 **锁 `--webpack`** · 防 Turbopack 默认漂移 | 默认改 bundler | package scripts 断言测或 docs 双锁 + typecheck | queued |
| **W9** | M-CP-csp-sentry-vitals | `cp-csp-sentry-vitals` | 观测完善（csp-report/Sentry/web-vitals 路径） | **放宽 CSP** · 生产 flip | 相关测 + evidence 声明 NOT_RELAXED | queued |
| **W10** | M-CP-admin-bundle-split | `cp-admin-bundle-split` | 重 Admin 页 dynamic import 加深（Form 已有则扩 Category/其它重块） | Admin 功能重写 | typecheck · 可选 bundle 备注 | queued |
| **W11** | M-CP-long-verify | `cp-long-verify` | 全量 typecheck / test / build(**webpack**) | push · 生产 deploy | **全部 exit code 入 evidence** | queued |
| **W12** | M-CP-integrate-doc | （总控本 wt） | 写 `INTEGRATE.md` · 停人 · 清 child | merge master · push | 人审 INTEGRATE | queued |

---

## 2. 依赖与并行

```text
W1 (live) ──► W4 可并行（auth 面不同文件）但优先 W1 收完再开
W2 ──► W3 ──► W7   （前台数据/搜索链路）
W5 · W6 · W8 · W9  （工程/观测 · 互不重叠时可两两并行，总 live≤3）
W10 在 W1/W4 后
W11 在 W1–W10 有交付后
W12 总控收口
```

**并行上限：** 任意时刻 Orca live child **≤3**（不含 `cp-coord` / master）。

---

## 3. 日循环检查单

```text
[ ] orca worktree list --repo name:ChronoPortal
[ ] 读 live terminal tail / git log base..HEAD / evidence 路径
[ ] DONE + exit code 齐 → 审边界 → worktree set in-review → 人可稍后 integrate
[ ] stop terminals → worktree rm --force（保留 branch）
[ ] 开下一项 create --no-parent --agent claude --prompt …
[ ] 关 MINGW64 非 agent 窗
[ ] 更新 WEEK-BACKLOG §0 + progress.md
```

---

## 4. 今日日志

| 时 | 动作 |
|----|------|
| Day0 | 人闸一周续航 · 写本 WEEK-BACKLOG |
| Day0 | W1 **`96becf7c`** harvest · push feature · rm |
| Day0 | 开 W2 · 后 **`98170d9e`** harvest · push · rm |
| Day0 | 开 **W3** `cp-links-pool` + **W4** `cp-admin-auth-dedupe` · live=2 · 关 MINGW |
| Day0 | 7m：W3–W5 harvest · 开 W6–W8 · 再巡 **W6 `83ec908d` / W8 `11515f0e` / W7 `ce4c0443`** harvest · 开 W9+W10 · live=2 |

---

## 5. 硬红线（重申）

| 禁止 | |
|------|--|
| 去 `--webpack` / 默认 Turbopack | 栈锁 |
| 放宽生产 CSP / 写生产 `CSP_*` | 人 gate 外 |
| 绕 repository/RLS | ADR |
| push master / merge master | 总控不执行 |
| 动 Chronicle / 它仓 | 本波只 CP |
| 假绿 | 完成声明 = 命令 + exit code |
