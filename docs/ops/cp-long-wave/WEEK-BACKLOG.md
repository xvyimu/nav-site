# ChronoPortal · 一周续航 WEEK-BACKLOG · 2026-07-24

> **总控：** `cp-coord` · G0 = **C′**（前台 + Admin 关键路径）· 续航 7 天  
> **北极星：** 锁 webpack · **不**拆 CSP/RLS · **不**改生产 · P0/P1 性能与 Admin 瀑布债 → 可测增量  
> **日循环：** 收 DONE → evidence 审 → stop/rm → 开下一项 · live **≤3** · 每日回写本文件 + `progress.md`  
> **红线：** 禁去 webpack / 放宽 CSP / 绕 RLS / push master / 动 Chronicle / 假绿

---

## 0. 状态总览

| 项 | 值 |
|----|-----|
| 日序 | Day 0 续 · **W1 harvest 完成** |
| tip base | `df11a2f2` · W1 feature `96becf7c`（未合 master） |
| live | **1** · `cp-home-static-client` |
| 已 harvest | scout · **W1** `cp-admin-lh-ssr` @ `96becf7c` pushed feature |
| 下一开 | W2 DONE 后 → **W3** 或 **W4**（live≤3） |
| INTEGRATE | W12 · 总控只写说明 · **不** merge master |

---

## 1.  backlog（W1–W12）

| W | Module ID | wt 名 | 边界（做） | 不做 | 验收 | 状态 |
|---|-----------|-------|-----------|------|------|------|
| **W1** | M-CP-admin-lh-ssr | `cp-admin-lh-ssr` | link-health SSR/`initialData` 预取 · Panel 可 refresh/resolve · ADR-009 | 全量 Admin 重写 · RLS | evidence + vitest **0** · typecheck **2**（既有 probe 债→W5） | **DONE** · branch `xvyimu/cp-admin-lh-ssr` @ **`96becf7c`** · **pushed feature** · wt **rm** |
| **W2** | M-CP-home-static-client | `cp-home-static-client` | 首页静态/client 边界：RSC vs client 切分复核 · 减少不必要 client 水合 | 换 UI 栈 · 虚拟列表 | typecheck + 相关测 · 说明边界图 | **IN_PROGRESS** |
| **W3** | M-CP-links-pool | `cp-links-pool` | 链接池/请求合并（`getApprovedLinks` 等并发去重/缓存边界） | 拆微服务 · Meili | 测或代码路径证明合并 · typecheck | queued |
| **W4** | M-CP-admin-auth-dedupe | `cp-admin-auth-dedupe` | Admin layout+page **重复 `auth()`** 去重（`cache`/thin getAdminSession） | 改登录产品逻辑 | typecheck + admin 边界测 | queued |
| **W5** | M-CP-typecheck-probe-headers | `cp-typecheck-probe-headers` | typecheck 债清扫 · `probe:headers` 本地/文档对齐 | 生产头 flip · 盲改平台层 | typecheck 0 · probe 命令 exit 记入 evidence | queued |
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
| Day0 | 巡检 W1：agent 长 idle · dirty 有码无 commit → unblock 催收 |
| Day0 | 实跑 vitest link-health **exit 0** · typecheck **2**（probe 既有→W5） |
| Day0 | W1 **`96becf7c`** + evidence · **push feature exit 0** · stop/rm |
| Day0 | 开 **W2** `cp-home-static-client` · 关 MINGW · live=1 |

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
