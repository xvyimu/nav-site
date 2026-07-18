# 前台交互与性能优化清单（2026-07-18）

> 范围：公开导航首页（侧栏分类、链接卡片、favicon、搜索）
> 证据基线：本地 `ff16a93` + nav-dev 数据抽样 + 代码路径审查
> 目标：侧栏切换不丢滚动位置、图标尽快可见、切换分类时主线程工作量可控

## 0. 测试与证据口径

| 证据 | 方法 | 结果 |
|---|---|---|
| 侧栏切换滚动 | 代码：`Navigation` `useEffect` 依赖 `activeCategory` | **已修**（`ff16a93`）：仅当 `#atlas` 完全离开视口才 `scrollIntoView` |
| 图标覆盖率 | nav-dev `nav_links` approved 抽样 | 58 条中 **31 条有 `icon`（53.4%）**；56 唯一域名 |
| 图标加载路径 | `useFavicon` + `/api/favicon` | 无 icon 时经代理三级 CDN；并发池 12；ResultGrid 预热 |
| 分类切换 remount | `ResultGrid` `listKey` + `animate-fade-in-up` | 列表 key 变会 remount 内层 → 重新入场动画、重新挂卡 |
| DualTrack 挂载预算 | `DualTrackSection` 未传 `initialVisible` | 推荐/最新/热门各默认 **24** 卡，叠加分类区预算 24，**“全部”首屏可远超 24** |
| 搜索 | `useServerSearch` 200ms debounce | 合理；分类切换时若无 query 不发搜索 |

约束：不改 API 契约、不拆微服务、不在本轮做生产部署（除非另确认）。

---

## 1. 问题清单（按用户体感排序）

### P0-1 侧栏切换后页面被拉回顶部

| 项 | 内容 |
|---|---|
| 现象 | 左侧分类一点，视口滚到最上方 |
| 根因 | `window.scrollTo({ top: 0, behavior: "smooth" })` 绑定在 `activeCategory/activeTags/...` |
| 状态 | **已修复** `ff16a93`：改为仅 `#atlas` 完全不在视口时轻推 |
| 验收 | 页面停在结果区中部时切换分类，滚动位置基本不变；结果区在屏外时才滚到 atlas |
| 残留风险 | 锚点/`scrollIntoView` 与固定 Header 叠盖：已用 `headerOffset=72` 启发式判断，未做 sticky offset scroll-margin |

### P0-2 图标加载不够快

| 项 | 内容 |
|---|---|
| 现象 | 切换分类/首屏卡片先 Globe 后图标，体感慢 |
| 根因 A | ~46.6% 链接无 `icon`，必须走 `/api/favicon`（服务端再打 3 个上游） |
| 根因 B | 历史并发仅 6；分类切换 remount 后缓存虽在，但首帧仍等 Image onload 调度 |
| 根因 C | DualTrack + 多 Section 同时挂大量卡片，favicon 扇出大 |
| 状态 | **部分修复** `ff16a93`：prefer `link.icon`、并发 12、可见预热、原生 img |
| 仍应做 | ① 分类切换时保留 ResultGrid 内层实例（避免无意义 remount）② DualTrack 纳入 mount budget ③ 可选：服务端预填更多 icon |

### P1-1 分类切换触发全量入场动画

| 项 | 内容 |
|---|---|
| 现象 | 切换分类时卡片闪一下、动画重放 |
| 根因 | `.animate-fade-in-up` 在 section/卡片上；`ResultGridInner` 因 `listKey` remount |
| 影响 | 额外 style/layout；低端机 INP 变差 |
| 目标 | 分类切换不重放整表 fade；保留 reduced-motion 行为 |

### P1-2 “全部”视图首屏挂载过量

| 项 | 内容 |
|---|---|
| 现象 | 全部页首屏 DOM/favicon 压力大 |
| 根因 | DualTrack 三区默认各 24 + 分类区预算 24，且 featured/latest/popular 可与分类区重叠展示 |
| 目标 | 首屏可见卡控制在约 **24–32** 量级；其余“加载更多” |

### P1-3 ResultGrid `listKey` remount 策略过重

| 项 | 内容 |
|---|---|
| 现状 | `listKey = baseIndex:len:firstId:lastId`，分类一切换即 remount，`visibleCount` 重置 |
| 利 | 重置“加载更多”状态简单 |
| 弊 | 丢掉已挂载卡与局部 UI 状态；重复动画；重复 IntersectionObserver 启动 |
| 目标 | 用 `useEffect` 在 `links` 身份变化时重置 `visibleCount`，**去掉强制 remount** |

### P2-1 favicon 上游仍串/竞态依赖 CDN

| 项 | 内容 |
|---|---|
| 现状 | `/api/favicon` `Promise.any` 三源，单源 3s 超时，缓存 1d/7d |
| 优化方向 | 已足够；长期可做边缘缓存或入库 icon URL 回填（数据工程，非本轮必做） |
| 本轮 | 不改 API 语义；客户端侧消化延迟 |

### P2-2 搜索体验

| 项 | 内容 |
|---|---|
| 现状 | 200ms debounce + AbortController，合理 |
| 可选 | 分类切换时若有 query 会重搜（正确）；空 query 本地 facets |
| 本轮 | 不改 |

### P2-3 InteractiveSurface

| 项 | 内容 |
|---|---|
| 现状 | 卡片 `spotlight={false}`，无指针 state，已收敛 |
| 本轮 | 不改 |

---

## 2. 目标（可度量）

| ID | 目标 | 度量方式 | 目标值 |
|---|---|---|---|
| G1 | 侧栏切换不强制回顶 | 手工/E2E：切换前后 `scrollY` | 结果区可见时 ΔscrollY ≈ 0 |
| G2 | 有 icon 的卡首帧即显示 | 单元/代码路径 | `link.icon` 安全 URL → 无 `/api/favicon` 请求 |
| G3 | 无 icon 卡更快出图 | 并发与预热 | 并发 ≥12；可见切片 prefetch |
| G4 | 分类切换不 remount 整表 | 代码 + 测试 | `ResultGrid` 无 listKey remount；visibleCount 仍正确重置 |
| G5 | DualTrack 计入首屏预算 | 代码 + 前端性能测 | DualTrack 传 `initialVisible`；总预算遵守 `INITIAL_LINK_CARD_BUDGET` |
| G6 | 入场动画降噪 | CSS/类名 | 卡片级 stagger 取消或仅首次；分类切换无整表 fade |

非目标：生产部署、DB icon 回填脚本、CDN 换源、虚拟列表重写。

---

## 3. 方案矩阵与最优选择

| 方案 | 收益 | 成本 | 风险 | 本轮 |
|---|---|---|---|---|
| A. 去掉 ResultGrid listKey remount，links 变化时重置 visibleCount | 高 | 低 | 中：visibleCount 逻辑需测 | **做** |
| B. DualTrack 接入 mount budget / initialVisible | 高 | 低 | 低 | **做** |
| C. 取消卡片级 `animate-fade-in-up` stagger，仅 section 可选短动画 | 中 | 低 | 低：观感更“静” | **做** |
| D. scroll-margin-top 给 `#atlas` 防 Header 遮挡 | 中 | 极低 | 低 | **做** |
| E. 服务端批量回填 icon | 高长期 | 高 | 需迁移/爬虫 | 不做（记入后续） |
| F. 虚拟列表（react-window） | 高大数据量 | 高 | 键盘导航/焦点复杂 | 不做（当前 ~50–500 条够用） |
| G. Service Worker 缓存 favicon | 中 | 中 | SW 生命周期 | 不做 |

**最优执行集：A + B + C + D**（在已完成的 scroll/favicon 之上）。

---

## 4. 执行计划（本轮）

1. `ResultGrid`：删除 `listKey` remount；`links` 身份变化时 `setVisibleCount(initialVisible)`。
2. `DualTrackSection` / `AtlasWorkspace`：为 featured/latest/popular 分配 `initialVisible`，共享 `INITIAL_LINK_CARD_BUDGET`。
3. `LinkCard`：去掉卡片级 `animate-fade-in-up` 与 index stagger（保留 section 级如需）。
4. `#atlas`：加 `scroll-margin-top`（globals 或 class）。
5. 测试：扩展 `frontend-performance` / `ResultGrid` 行为断言；跑 typecheck + 相关 vitest。
6. 文档：本文件作为唯一清单；完成后在文末写「执行结果」。

---

## 5. 验收清单

- [ ] 切换左侧分类：不滚到页顶（结果区可见时）
- [ ] 有 `icon` 的卡：首帧即图，无 Globe 闪烁
- [ ] 无 `icon`：可见区预热后快速替换 Globe
- [ ] 切换分类：无明显整表 fade 闪白
- [ ] “全部”首屏挂载受预算约束
- [ ] `pnpm` 相关单测 + typecheck 通过

---

## 6. 后续（不在本轮）

1. 管理后台/脚本回填 `nav_links.icon`（目标覆盖率 >90%）
2. E2E：分类切换 `scrollY` 断言
3. Lighthouse 生产主域对比（需 CF 不拦探针）
4. 大数据量时再评估虚拟列表

---

## 7. 执行结果（2026-07-18）

| 目标 | 状态 | 说明 |
|---|---|---|
| G1 侧栏不强制回顶 | **完成** | `Navigation` 条件 scrollIntoView + `#atlas` `scroll-mt-[4.5rem]` |
| G2 有 icon 首帧出图 | **完成** | `LinkCard` prefer `link.icon` |
| G3 无 icon 预热/并发 | **完成** | 并发 12 + `prefetchFavicons` |
| G4 分类切换不 remount 整表 | **完成** | `ResultGrid` 去 listKey remount，identity 变化重置 visibleCount |
| G5 DualTrack 共享预算 | **完成** | `AtlasWorkspace` dualTrackInitial + section 预算串联 |
| G6 入场动画降噪 | **完成** | 去掉卡片/section `animate-fade-in-up` stagger |

验证：

- `vitest`：`frontend-performance` / `use-favicon` / LinkCard / ToolQuickView 相关 **37 pass**
- `typecheck` pass
- lint：仅保留接口兼容的无害告警清理后应干净

文档：`docs/frontend-perf-optimization-2026-07-18.md`

已 push + 生产部署（2026-07-18）：

- perf UX 首发 commit `353a1fda0a5d750d0828c4d5cd6fb19175b34df4`
- 跟进修复：`b8cb1f6a`（DualTrack 预算后零卡片）· `9c8175ee`（分类区首屏挂载）
- **favicon 恢复** commit `46981a1aed3d58b2d10236d8413e30d112b8b5dc`
  - 跟随 CDN 内部 redirect；接受「404 + 有效图片 body」
  - 过滤 Google/DDG 通用占位图；新增 `google-v2` 源
  - 全失败时返回字母 monogram SVG（200），不再空 404
- 当前生产 deploy `dpl_3KnaaDy7kR3yQ9hcx1Dq2gCkGWaq` → `https://yuanjia1314.ccwu.cc`
- 主域探针 PASS（build-info commit = `46981a1a`）
- 浏览器抽检：首页 favicon 请求 ~129，失败 0；卡片破图 0  
  证据目录：`docs/perf/chrome-review-2026-07-18/`

仍后续：icon 数据回填、虚拟列表、E2E scrollY 断言、生产 Lighthouse 对比。
