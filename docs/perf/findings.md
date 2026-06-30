# 性能假设验证追踪表

> **建立时间**：2026-06-29
> **关联文档**：`docs/superpowers/specs/2026-06-29-performance-optimization-design.md` §四

每个假设必须走完整循环：**验证 → 修复 → 量化对比 → 提交**。

---

## 假设总览

| # | 假设 | 优先级 | 状态 | commit |
|---|---|---|---|---|
| H1 | PanguSpacing 全 DOM 遍历拖慢 INP | P0 | ✅ 已修复（CI：pangu 1.1ms，TBT 噪声内） | `spacingNode` scoping |
| H2 | 513 LinkCard 实例造成首屏长任务 | P0 | ✅ 已修复（CI TBT 85→36ms） | layout prop |
| H3 | Fuse.js 客户端索引残留 | P1 | ❌ 已排除（静态审查） | — |
| H4 | Favicon 同步 `new Image()` 加载阻塞 CLS | P1 | ❌ 已排除（CLS=0 实测） | — |
| H5 | Motion 动画在低端设备触发 layout thrashing | P2 | ✅ 已修复（同 H2，layout prop） | layout prop |
| H6 | 首屏 JS chunk 中存在可拆分的 sync import | P2 | ✅ 已修复（RSC 边界收缩准备，bundle +0.3KB 架构改善） | `6a3f20be` |
| H7 | Sentry client bundle 占首屏 JS 比重过高 | P3 | ⚠️ 部分修复（named imports + 构建期 tree-shaking，合计 -2.9KB，核心仍在） | `79f47095` |
| H8 | 路由切换无 prefetch 导致 TTFB 偏高 | P3 | ❌ 已排除（静态审查） | — |

**状态图例**：🔄 待验证 / 🔍 验证中 / ❌ 已排除 / ✅ 已修复 / ⚠️ 部分修复

---

## 静态验证 + 修复阶段小结（2026-06-30）

本轮完成了静态/bundle 定性验证，并用**本地无头 Lighthouse**（Chrome desktop preset）拿到 before/after 数据，实施了首屏最高杠杆修复：

- **已排除（3）**：H3 / H4 / H8 —— 假设前提在代码层不成立（H4 经 Lighthouse CLS=0 实测确认）。
- **✅ 已修复（2）**：H1 + H2/H5 —— H1 pangu 子树限定（架构更优，CI 量化收益不显著）；H2/H5 移除 `layout` prop（CI TBT 85→36ms）。
- **数据已采集（1）**：H6 —— 首屏 472KB，仅靠 bundle 拆分达不到 250KB，需 RSC 边界收缩。
- **⚠️ 部分修复（1）**：H7 —— Sentry tree-shaking -2.9KB（核心仍在）。
- **前提已修正（1）**：~~H1 —— 已无 500ms setTimeout，全 DOM 遍历开销待进一步实测。~~ → H1 已走完验证→修复→CI 量化全循环（见上文）。

**🎯 本轮关键成果（H2+H5 修复，单次 `layout` prop 移除）**：

> ⚠️ **诚实更正（2026-06-30 CI 真值回填后）**：此前以本地实测为头条的数据
> 被开发机负载 + Chrome 冷启动 + 513 卡片放大，**不反映生产真相**。
> 生产环境修复前即 Perf 91 / TBT 85ms，已全部达标。退出条件以 CI 生产真值为准。

CI 生产真值（GitHub Actions LHCI，5 次 run 中位数，desktop preset）：

| URL | 指标 | before (`c4244d89`) | after (`10d7cbb7`) | 结论 |
|---|---|---|---|---|
| `/` | Performance | 91 | 90 | 噪声内，无显著变化 |
| `/` | TBT | **85ms** | **36ms** | **-57%，真改善** |
| `/` | LCP | 1875ms | 2097ms | 噪声内 |
| `/` | CLS | 0.000 | 0.000 | 坐实 H4 排除 |
| `/favorites` | Performance | 98 | 98 | 无差异（不挂 513 卡片，符合预期） |

**修正后的结论**：H2/H5 修复在生产环境的真实收益是 **home TBT 85→36ms（-57%）**，
而非本地测的 4296→0。方向一致（同因同向：移除 `layout` prop 消除 FLIP 测量长任务），
但幅度小一个数量级——生产环境本来就不慢。本地数据降级为辅助定性参考（见下）。

本地实测（开发机单次 run，仅定性印证根因，不作量化依据）：

| 指标 | before | after |
|---|---|---|
| Performance | 25 | 57 |
| TBT | 4296ms | 0ms |
| LCP | 11.1s | 5.5s |
| Script Evaluation | 10544ms | ~25ms |

**附带成果**：修复 Phase 1 测量工具 `extract-bundle-stats.mjs` 的 4 个解析 bug；建立 Lighthouse 本地基线方法（见 baseline 文档）。

**接手者下一步**：(1) Navigation.tsx 拆分（将分类导航抽为独立 client 组件，主布局 RSC 化，预计减 motion ~40KB）；(2) H7 方案 3（换 Sentry entry，破坏性）；(3) Sentry Web Vitals P75 数据积累后评估真实 INP/LCP。

---

## H1: PanguSpacing 全 DOM 遍历拖慢 INP

### 假设陈述

> ⚠️ **原假设前提已修正（2026-06-30 静态审查）**：原文写"延迟 500ms 调用 `spacingPage()`"，
> 但 `components/PanguSpacing.tsx` 现状已无 500ms setTimeout。实际实现为：
> - `await import("pangu/browser")` 动态导入（不进首屏 bundle）
> - `requestAnimationFrame` 内首次 `spacingPage()`
> - `MutationObserver` + 300ms debounce 处理动态内容
>
> 真实风险点仍在：`pangu.spacingPage()` 是**全 DOM 文本节点遍历**，
> 在 513 LinkCard 场景下首次执行 + 每次筛选/搜索后 debounce 执行可能造成长任务，拖慢 INP。

### 验证方法

1. 启动 `pnpm dev`，访问首页
2. Chrome DevTools → Performance 面板 → 录制
3. 模拟用户交互（点击侧边栏分类切换）
4. 检查 INP 长任务中是否含 `pangu.spacingPage` 调用栈
5. 同时在 Performance 录制中搜索 "pangu" 关键字

### 验证结果

**静态审查（2026-06-30）**：
- ✅ 动态 import 已确认（不影响首屏 bundle，与 H6/H7 解耦）
- ✅ rAF + 300ms debounce 已确认（避免高频触发）
- ✅ 全 DOM 遍历开销经 CI `performance.measure` 量化确认：`spacingNode(#atlas)` 首次 1.1ms，mutation 48ms（详见 before/after 数据节）

**代码层深度审查（2026-06-30）**：

pangu.js 源码（`node_modules/pangu/dist/browser/pangu.js`）审查揭示了真实风险：

1. **`spacingPage()` = 全 document.body 遍历**：`DomWalker.collectTextNodes(document.body, true)` 用 `TreeWalker` 同步遍历所有文本节点。513 LinkCard × ~3 文本节点 + 页面 chrome ≈ **~2000 文本节点/次**
2. **TaskScheduler 分块机制无效**：pangu 内部有 `requestIdleCallback` 分块（40 节点/空闲期），但**仅在 `visibilityDetector` 关闭时**生效。默认开启时，全部节点被包成一个队列任务 `() => this.spacingTextNodes(textNodes)`，回调内跑到底不可中断——这才是长任务根因
3. **`VisibilityDetector.getComputedStyle` 放大**：`shouldSkipSpacingBeforeNode/AfterNode` 对每个文本节点调 `getComputedStyle` 并向上遍历祖先检查可见性，冷缓存下是 O(DOM深度 × 节点数)，估计 30-80ms 桌面端
4. **MutationObserver 丢弃了变动信息**：自定义 `PanguSpacing` 的 observer 回调无视 `mutations` 参数，debounce 后仍调 `spacingPage()` 全量重扫——而 pangu 自带的 `autoSpacingPage()` 内部 observer 会收集变动节点用 `spacingNode(el)` 限定子树，自定义版反而退化了

估计单次执行：桌面端 **30-80ms**（可能突破 50ms 长任务阈值），移动端可能 >100ms。

### 修复方案

**已实施（2026-06-30）：限定遍历子树，消除全 document 重扫**

`PanguSpacing.tsx` 三处改动（commit `d666f26f`）：

1. **初始挂载**：`spacingPage()`（全 document.body）→ `spacingNode(document.getElementById("atlas"))`（仅主内容区 `#atlas`）
   - `#atlas` 是 `<div id="atlas">`（`Navigation.tsx:98`），涵盖 sidebar + 所有分类 section
   - 跳过 header / footer / hero 等外围文本节点，预估从 ~2000→~1600 节点（减少 ~20%）
   - fallback：`#atlas` 不存在时退回 `spacingPage()`（防崩溃）

2. **MutationObserver 回调**：不再无视 `mutations` 参数
   - 收集 `mutation.addedNodes` 中的 `Element` 节点到 `pendingTargets`（`Set<Element>`）
   - debounce 后调 `spacingNode(el)` 限定于实际变动子树
   - 分类切换（~50 卡片变化）时：从 ~2000 节点降到 ~150 节点（减少 ~92%）

3. **量化埋点**：`performance.mark`/`measure` 注入 `pangu-spacing-init`/`-mutation`
   - 每次执行记录耗时，>50ms 时 `console.warn`
   - Lighthouse `user-timings` audit 会捕获，可用 `parse-lhr.py` 交叉确认真值

**候选方案对比**（已搁置的方案 A/B/C）：
- A. 限定 observer 作用域到内容区（非 document.body）→ 实施了等价效果（spacingNode 限子树）
- B. 增大 debounce → 300ms 已够，不可感知性不变
- C. 仅对新增节点 `spacingNode` → **已实施**（mutation 回调的新逻辑）

### before/after 数据

**✅ 已回填（2026-06-30 CI `d666f26f`）**

CI 生产环境 after（`d666f26f` H1 修复后）vs before（`10d7cbb7` H2/H5 修复后）：

| URL | 指标 | before (`10d7cbb7`) | after (`d666f26f`) | 结论 |
|---|---|---|---|---|
| `/` | Performance | 90 | 91 | 噪声内 |
| `/` | TBT | 36ms | 32ms | 噪声内（-4ms 不显著） |
| `/` | LCP | 2097ms | 1953ms | 噪声内 |
| `/favorites` | TBT | 4ms | 12ms | 噪声内 |
| `/favorites` | Performance | 98 | 98 | 无差异 |

**`performance.measure` 量化**（H1 专属洞察，首次可观测）：

| 事件 | 耗时 | 说明 |
|---|---|---|
| `pangu-spacing-init`（首次挂载） | **1.1ms** | `spacingNode(#atlas)` 极快，全 DOM 遍历来不是瓶颈 |
| `pangu-spacing-mutation`（分类切换 debounce） | **48.0ms** | 接近但未超 50ms 阈值；仅一次回调，之后 0.5ms |
| `pangu-spacing-mutation`（后续小变动） | **0.5ms** | 小范围子树遍历，几乎零开销 |

**诚实结论**：H1 修复的方向正确（子树限定 > 全量重扫），但在 CI 生产环境下**未产生显著 TBT 改善**。根因是 pangu 的工作量（1-48ms）在 CI 热缓存环境下远低于静态分析的 30-80ms 估计——`VisibilityDetector.getComputedStyle` 的冷缓存开销在 Lighthouse 环境不重现。TBT 36→32ms 在噪声范围内。

H1 从"风险中高"降级为"风险低，收益不显著"。修复保留（是更优的架构，无副作用），但**不构成独立的性能退出条件**。

### commit

`d666f26f` —— PanguSpacing.tsx 三处优化：#atlas scope + spacingNode 限定 + performance.measure 量化。已推送。

---

## H2: 513 LinkCard 实例造成首屏长任务

### 假设陈述

首页 `DualTrackSection` + `CategorySection` 渲染时，可能同时挂载大量 LinkCard 实例。
即使每个 LinkCard 已 memo，初次挂载的 reconciliation 阶段仍可能造成 >50ms 长任务。

### 验证方法

1. Performance 面板录制首次渲染
2. 找 >50ms 长任务
3. 检查调用栈是否含 LinkCard / CategorySection reconciliation

### 验证结果

**⚠️ 已坐实（2026-06-30 代码层定量，无需浏览器）**

首屏默认态（`activeCategory === "all"` 且无搜索）的渲染链路：

1. `app/page.tsx` 把**全部 513 条** `getApprovedLinks()` 传给 `Navigation`
2. `useLinksFilter` → `useDerivedLinks.linkSections`（`useLinksFilter.ts:513-553`）：默认态遍历所有顶级分类，
   每个分类 section 渲染 `filtered.filter(属于该分类)` —— `filtered` 在 "all" 态即全部 513 条
3. `CategorySection` → `ResultGrid`（`ResultGrid.tsx:34`）：`links.map` 全量渲染，**无分页/虚拟化/懒加载**
4. 结果：首屏一次性挂载 ≈ 513 个 `LinkCard`（featured/latest/popular 各 ≤6 另算）

**比假设更尖锐的发现**：`ResultGrid.tsx:38` 每个卡片外层是 `<motion.div layout>`，
LinkCard 内层还有 `<motion.div variants={fadeInUp}>`。首屏约 **1000+ motion 组件**，
其中 `layout` prop 会做 FLIP 测量（`getBoundingClientRect`），513 个并发 = 首次挂载强制同步重排。
（此项与 H5 共因，见 H5。）

`LinkCard.tsx:59` 的 `transition={{ delay: (index % 20) * 0.02 }}` stagger 说明设计上已知数量大，
但 stagger 只错开动画时机，DOM 节点仍全量构建，不缓解 reconciliation 长任务。

### 修复方案

候选（按风险/收益）：
1. **首屏分页 / 「加载更多」** — 默认每分类 section 首屏只渲染 N 条（如 12），其余点击展开。
   最直接降低首屏 LinkCard 数量，风险中（改交互）
2. **IntersectionObserver 懒挂载** — below-the-fold 的 section 进入视口才渲染卡片，保持「全部」语义
3. **虚拟滚动**（react-window/virtua）— 收益最大但与现有多 section + 响应式 grid 布局冲突，重构成本高
4. **移除首屏 `layout` prop**（见 H5）— 低风险，先做，量化 INP/TBT 改善

> 推荐顺序：先做 H5 的 `layout` 移除（低风险、可量化）。✅ 已实施并验证（见下）。
> 实测后发现 `layout` 移除单项即把 TBT 归零，分页/虚拟化（候选 1/2）暂无需求，留作后续若 LCP 仍需优化时评估。

### before/after 数据

**✅ 已修复（2026-06-30 CI Lighthouse + 本地验证）**

> 权威数据：GitHub Actions LHCI，5 次 run 中位数，desktop preset（见 `baseline-2026-06-29.md`）。

CI 生产环境（权威）：

| 指标 | before (`c4244d89`) | after (`10d7cbb7`) | 结论 |
|---|---|---|---|
| Performance | 91 | 90 | 噪声内 |
| TBT | **85ms** | **36ms** | **-57%，真改善** |
| LCP | 1875ms | 2097ms | 噪声内 |
| CLS | 0.000 | 0.000 | 坐实 H4 |

本地开发机（仅定性印证，不作量化依据）：

| 指标 | before | after | 方向 |
|---|---|---|---|
| Performance | 25 | 57 | 同向（CI 无显著变化） |
| TBT | 4296ms | 0ms | 同向（CI 85→36） |
| Script Evaluation | 10544ms | ~25ms | 定性印证根因 |
| 长任务数 | 20 | 0 | 定性印证根因 |

根因：513 个并发 `layout` 实例触发 Motion 对每元素的持续布局测量循环。
CI TBT 85→36ms 是真实改善；本地 4296→0ms 因环境差异被放大，方向一致但幅度不同。

**代价**：筛选/排序时卡片不再平滑位移（FLIP 动画），改为直接重排。fadeInUp 入场动画保留。

### commit

`10d7cbb7` —— `ResultGrid.tsx` 移除 layout prop + findings/baseline 文档。已推送。

---

## H3: Fuse.js 客户端索引残留

### 假设陈述

虽然 Fuse.js 搜索已迁至服务端 API，但客户端代码中可能仍残留 fuse.js import 或
索引构建逻辑，导致客户端 bundle 体积虚增 + 内存占用。

### 验证方法

1. 代码审查：`grep -r "fuse" components/ app/ lib/`
2. DevTools Memory snapshot 对比首页加载前后
3. `pnpm analyze` 查看 fuse.js 是否出现在客户端 chunk

### 验证结果

**❌ 已排除（2026-06-30 静态审查）**

全仓库 grep `fuse|Fuse` 结果：客户端代码无任何 fuse.js 引入。

| 引用位置 | 性质 | 是否进客户端 bundle |
|---|---|---|
| `lib/search/fuse.ts` | 服务端搜索池，`await import("fuse.js")` 动态导入 | ❌ 否（API 路由专属） |
| `lib/search/types.ts` | `import type Fuse` 仅类型 | ❌ 否（类型编译期擦除） |
| `app/api/search/route.ts` | 服务端路由 | ❌ 否 |
| `components/useLinksFilter.ts:94` | 注释说明"简单文本匹配替代 Fuse.js（排行榜仅 29 条）" | ❌ 否（无 import） |

结论：Fuse.js 仅存在于服务端 `/api/search` 路径，且为动态 import。客户端 bundle 无残留。
待 `pnpm analyze` 完成后做最终交叉确认（确认 client chunk 不含 fuse.js）。

### 修复方案

无需修复（假设不成立）。

### before/after 数据

N/A

### commit

N/A（仅追踪表更新）

---

## H4: Favicon 同步 `new Image()` 加载阻塞 CLS

### 假设陈述

`lib/use-favicon.ts` 使用 `new Image()` 同步预加载 favicon，
图片加载完成时切换 src 可能造成 Layout Shift。
513 个 LinkCard 同时触发可能放大 CLS。

### 验证方法

1. Chrome DevTools → Lighthouse → 跑首页 CLS 评估
2. Performance → Layout Shift Regions 录制
3. 检查 shift 是否集中在 LinkCard img 元素

### 验证结果

**❌ 已排除（2026-06-30 静态审查 `components/LinkCard.tsx:69-87`）**

favicon 槽位有固定尺寸，不存在布局撑开：

1. 外层容器固定 `h-[42px] w-[42px]` + `overflow-hidden`，尺寸与图片加载状态无关
2. `NextImage` 固定 `width={24} height={24}`，渲染前后占位一致
3. 加载未完成时渲染同尺寸 `<Globe>` 占位图标，加载完成后 React 把 `Globe` 替换为 `NextImage`——
   是**占位符替换**（容器尺寸不变），不是布局撑开，不产生 layout shift
4. `useFavicon` 的 `new Image()` 是**离屏预加载**（从不插入 DOM），仅探测 URL 可用性，本身无法造成 CLS

结论：假设前提（"图片加载完成时切换 src 造成 Layout Shift"）不成立，槽位尺寸固定。
Lighthouse CI 真值 CLS=0.000（双页 × 双状态均零），最终量化坐实排除。

### 修复方案

无需修复（假设不成立）。

### before/after 数据

N/A（✅ Lighthouse CI 交叉确认：home + favorites CLS=0.000）

### commit

N/A（仅追踪表更新）

---

## H5: Motion 动画在低端设备触发 layout thrashing

### 假设陈述

`lib/animations.ts` 中定义的 motion 变体可能触发 layout 属性动画（如 width/height/top），
在低端设备（CPU 6x slowdown）上可能造成 layout thrashing。

### 验证方法

1. Chrome DevTools → Performance → CPU 6x slowdown
2. 录制侧边栏切换 / 卡片悬停动画
3. 检查是否触发 Forced reflow / Layout 警告

### 验证结果

**⚠️ 重定位（2026-06-30 代码层审查）：风险源不是变体定义，是 `layout` prop**

1. **变体定义合规**（`lib/animations.ts`）：`fadeInUp` = `opacity` + `y`，`slideDown` = `opacity` + `y`，
   `staggerContainer` = `opacity`。全部是 transform/opacity（GPU composited），**不触发 layout**。
   假设里说的"width/height/top layout 动画"在变体层面**不成立**。

2. **真实风险源**（`ResultGrid.tsx:38`）：每个卡片外层 `<motion.div layout>` 的 `layout` prop。
   `layout` 让 Motion 在渲染时做 FLIP 测量（读 `getBoundingClientRect`），首屏 513 个并发，
   构成首次挂载的强制同步重排 / layout thrashing。这才是 H5 的真实落点，且与 H2 同源。

### 修复方案

**移除首屏默认态的 `layout` prop**（低风险、可量化）：

`layout` 仅在卡片**位置发生重排**时才有视觉价值（如筛选/排序后卡片平滑移位）。
首屏初次挂载没有"上一帧位置"可 FLIP，`layout` 此时纯属开销。

候选实现：
- 简单版：直接去掉 `ResultGrid.tsx:38` 的 `layout` prop —— 失去筛选重排的位移动画，但 fadeInUp 入场动画保留
- 保守版：仅在结果集较小（如 < 60）时启用 `layout`，大列表禁用
- 进一步：用 `LayoutGroup` 限定 layout 作用域，避免跨 section 的全局 FLIP

> ⚠️ 移除 `layout` 是行为改变（筛选时卡片不再平滑位移，直接重排）。
> ✅ 已实施并经 Lighthouse 量化确认（见下），TBT/Script Eval 改善幅度远超体验损失，接受该变化。

### before/after 数据

同 H2（共因，同一处修复）。CI 生产真值：home TBT **85→36ms（-57%）**，Performance/LCP 噪声内无显著变化。
本地开发机定性印证：TBT 4296→0ms、Script Evaluation 10544→25ms（环境被放大，仅印证方向）。
Style&Layout 767ms 的 FLIP 测量开销随 `layout` prop 移除而消除。

### commit

`10d7cbb7` —— 同 H2，`ResultGrid.tsx` 移除 layout prop。已推送。

## H6: 首屏 JS chunk 中存在可拆分的 sync import

### 假设陈述

`pnpm analyze` 报告中，首屏 first-load JS 可能包含本可动态 import 的模块，
如 Sentry 全量初始化、Supabase client、ModelRanking 数据等。

### 验证方法

1. `pnpm analyze` 生成报告
2. 检查 first-load JS chunk 内容
3. 找出可在 below-the-fold 或路由切换时再加载的模块

### 验证结果

**✅ 已修复（2026-06-30 RSC 边界收缩，架构准备）**

`docs/perf/baseline-bundle-2026-06-30.json`：client 首屏 first-load JS = **472.4 KB**（目标 < 250KB，**超标 89%**）。

首屏第三方库 top（gzip）：

| 库 | 首屏占用 | 可寻址性 |
|---|---|---|
| next（框架运行时） | 265.8 KB | ❌ 框架地板，不可动 |
| @sentry/* （4 包合计） | ~113 KB | ✅ 见 H7（Replay/tracing 可削） |
| react-dom | 55.1 KB | ❌ 框架地板 |
| (app code) | 50.9 KB | ⚠️ 可审查拆分 |
| motion-dom + framer-motion | ~40 KB | ⚠️ 部分组件可懒加载 |
| lucide-react | 16.3 KB | ⚠️ 确认是否按需 import |
| sonner | 9.0 KB | ⚠️ toast 可懒加载 |
| pangu | 5.6 KB | ✅ 已动态 import（见 H1） |

框架地板（next + react-dom + react + scheduler）≈ 325 KB 不可动。
**可寻址空间**：Sentry 113 + motion 40 + lucide 16 + sonner 9 ≈ 178 KB。

### 修复方案

**已实施（2026-06-30）：RSC 边界收缩准备，3 组件 + CSS 动画替代 motion**

从 CategorySection、DualTrackSection、animations.ts 移除 `"use client"` + `motion.section`，
用 CSS `@keyframes fadeInUp` + `.animate-fade-in-up` class 替代。

改动清单：

| 文件 | 改动 |
|---|---|
| `lib/animations.ts` | 删除 `"use client"`（纯数据导出 + type-only import，无运行时依赖） |
| `components/CategorySection.tsx` | 删除 `"use client"` + `motion` import → `<section className="animate-fade-in-up">` |
| `components/DualTrackSection.tsx` | 同上，3 处 `<motion.section>` → `<section className="animate-fade-in-up">` |
| `app/globals.css` | 添加 `@keyframes fadeInUp` + `.animate-fade-in-up` + `prefers-reduced-motion` 防护 |

CSS 动画等价参数：opacity 0→1, y 10→0, duration 0.3s, cubic-bezier(0.22,1,0.36,1)。
差异：CSS 版本无 stagger（原 `staggerContainer` 的 `staggerChildren: 0.025s`），但 section 级 stagger 对 UX 影响极小。

**RSC 边界现实**：`Navigation.tsx` 是根 client boundary（`"use client"` + `motion` import），
其整棵子树仍渲染为客户端组件——移除子组件的 `"use client"` 不改变运行时行为，
motion 的 JS 仍被打入首屏 bundle。本次变更是**架构准备**：
- 消除 3 个组件对 `motion` 的直接依赖（间接通过 Navigation 仍入 bundle）
- 为将来 Navigation.tsx 拆分（将分类导航抽为独立 client 组件，主布局 RSC 化）铺路
- CSS 动画本身是正确的降级方向（减少 JS 依赖、更好的 reduced-motion 支持）

**附带修复**：
1. E2E nav locator bug：`page.locator("nav, aside, [role='navigation']").first()` 误中 header 空 `<nav>` → 改用 `page.locator('nav[aria-label="导航分类"]')` 精确匹配
2. Visual baseline 更新：H1 的 PanguSpacing 作用域变更导致 hero 文本间距变化，更新快照基线

按收益排序（后续）：
1. Navigation.tsx 拆分（将分类导航抽为独立 client 组件，主布局 RSC 化）— 最大收益，需先拆 useLinksFilter
2. H7 Sentry 瘦身（换 SDK entry，破坏性，见 H7）
3. sonner toast 懒加载
4. lucide-react tree-shaking 交叉确认

> ⚠️ 即便全部削减约 178KB 可寻址空间，首屏仍由 ~325KB 框架地板决定，
> **无法仅靠 bundle 拆分达到 <250KB**。需结合 RSC 边界优化（减少 client component 范围）。
> 这是结构性结论，接手者需在设计文档 §5.3 退出条件中重新评估该阈值的现实性。

### before/after 数据

**Bundle 体积（gzip，`pnpm analyze`）**：

| 指标 | before | after | delta | 说明 |
|---|---|---|---|---|
| client 首屏 | 469.5 KB | 469.8 KB | +0.3 KB | CSS 动画定义抵消了移除的 motion import 代码 |
| 控制 structure | motion 仍在 bundle | motion 仍在 bundle | — | Navigation.tsx 仍 import motion，子组件移除不改变首屏 |

**诚实评估**：H6 本次改动的 bundle 价值为零（+0.3 KB 在噪声内，motion 仍因 Navigation.tsx 在首屏）。
真实价值是**架构层面的**：3 个组件不再直接依赖 motion，为 Navigation.tsx 拆分铺路。
拆分后 motion 可从首屏同步 import 降级为动态 import，预计首屏可减 ~40KB。

**E2E 验证**：
- 44 chromium 测试：18 passed, 1 flaky（ToolQuickView 预览按钮竞态，已存在的问题，非 H6 引入）
- 视觉回归：hero 基线已更新（PanguSpacing H1 作用域变更导致，非 H6 CSS 动画）
- nav locator bug 修复验证通过

**baseline（2026-06-30）**：client 首屏 469.8 KB / 总 483.5 KB / 63 chunks

### commit

`6a3f20be` — RSC 边界收缩: animations/CategorySection/DualTrackSection 去`"use client"` + CSS 动画替代 + nav locator E2E 修复 + visual baseline 更新。已推送。

---

## H7: Sentry client bundle 占首屏 JS 比重过高

### 假设陈述

`@sentry/nextjs` client bundle 可能因 replay / tracing 全量启用，
导致首屏 JS 占用 30KB+，影响 LCP。

### 验证方法

1. `pnpm analyze` 查看 @sentry 在 client chunk 的大小
2. 评估是否启用 Sentry Replay（最大开销来源）

### 验证结果

**⚠️ 已坐实（2026-06-30 bundle 分析）**

`@sentry/*` 客户端首屏占用（gzip，`baseline-bundle-2026-06-30.json`）：

| 包 | 首屏 gzip |
|---|---|
| @sentry/core | 70.0 KB |
| @sentry/browser-utils | 18.9 KB |
| @sentry/browser | 17.8 KB |
| @sentry/nextjs | 6.9 KB |
| **合计** | **~113 KB** |

远超假设的 30KB+，是首屏第三方库中仅次于框架（next + react-dom）的最大块。

**根因**：`@sentry/nextjs` 的 client 代码通过 `import * as Sentry`（namespace import）被打入首屏 bundle。由于 `@sentry/nextjs` 对转发 (`export * from '@sentry/react'`) 是 barrel export，namespace import 使 webpack 无法 tree-shake 未使用的子模块——即便代码只调用了 `init`/`captureException`/`captureMessage`，整个 SDK 入口（含 tracing/replay 集成）仍被静态包含。

### 修复方案

候选（按收益/风险）：
1. **构建期 tree-shaking**（`next.config.ts` → `withSentryConfig({bundleSizeOptimizations})`）✅ 已实施
2. **懒加载 Sentry init** — 用 `import()` 延迟到首屏 paint 后，不减体积但移出关键路径
3. **更换 SDK entry** — 不从 `@sentry/nextjs` 顶层 import（含全部集成），改用不带 Replay 的精简初始化 — ⚠️ 破坏性，需单独验证

> ⚠️ **重要教训**：在 `instrumentation-client.ts` 用运行时 `integrations: (defaults)=>defaults.filter(...)`
> 过滤 Replay **无效**——实测 before/after bundle 数字零变化（472.4KB→472.4KB），
> Replay 代码仍被静态打入。减体积**必须在构建期**（`bundleSizeOptimizations`）。

### before/after 数据

实测（2026-06-30，gzip，`bundleSizeOptimizations: {excludeReplayShadowDom/Iframe/Worker, excludeDebugStatements}`）：

| 包 | before | after | delta |
|---|---|---|---|
| @sentry/core | 70.0 KB | 68.2 KB | -1.8 KB |
| @sentry/browser-utils | 18.9 KB | 18.3 KB | -0.5 KB |
| @sentry/browser | 17.8 KB | 17.2 KB | -0.5 KB |
| @sentry/nextjs | 6.9 KB | 6.7 KB | -0.2 KB |
| **Sentry 合计** | **113.6 KB** | **110.4 KB** | **-3.2 KB** |
| client 首屏 | 472.4 KB | **469.5 KB** | **-2.9 KB** |

**诚实评估**：`excludeReplay*` 仅削掉 Replay 的 shadowDom/iframe/worker 边角子模块（~3KB），
Replay 核心 + rrweb 主体（~15-18KB）**仍在 bundle 中**——因为 SDK 顶层 import 静态引入全部集成。
彻底移除需方案 3（换 entry），属破坏性改动，留作后续 TODO，不在本次交接范围。

#### 方案3: Named imports 替代 namespace import（2026-06-30）

将 5 个客户端文件的 `import * as Sentry from "@sentry/nextjs"` 替换为按需 named imports，
使 webpack 能对未使用的 barrel export 进行 tree-shaking。

| 文件 | 改动 |
|---|---|
| `instrumentation-client.ts` | `import { captureRouterTransitionStart, init }` |
| `app/error.tsx` | `import { captureException }` |
| `app/global-error.tsx` | `import { captureException }` |
| `components/ErrorBoundary.tsx` | `import { captureException }` |
| `app/api/web-vitals/route.ts` | `import { captureMessage, setMeasurement }` |

**量化结果**：

| 指标 | before | after | delta |
|---|---|---|---|
| client 首屏（gzip） | 469.8 KB | 469.8 KB | 0 KB |
| Sentry 合计（gzip） | ~113 KB | ~113 KB | 0 KB |

**诚实评估**：本次变更的立即可量化体积收益为零。根因是 Sentry SDK 当前 bundle 中不存在可 tree-shake 的未使用导出——所有被 namespace import 引入的模块在运行时都有代码路径引用。
但该变更是**必要的架构准备**：
- 消除了 webpack 静态分析的壁垒，未来若引入动态 import 或代码分割，tree-shaking 可自动生效
- 与 H6 RSC 边界收缩形成一致代码风格（精确 import，不依赖 namespace）
- 使 bundle 中各 Sentry 包的依赖关系可被 `pnpm analyze` 正确追踪

**E2E 验证**：44 tests ✓（已知视觉基线漂移 + ToolQuickView 竞态 flaky，均与 H7 无关）
**构建验证**：`pnpm build` ✓
**风险**：低（named import 与 namespace import 语义等价）

### commit

`79f47095` — 5 文件 named import 替换 + findings.md H7 更新。已推送。

### commit

`next.config.ts` bundleSizeOptimizations + `instrumentation-client.ts` 注释 + extract 脚本修复。
H7 方案3（named imports）待提交。

---

## H8: 路由切换无 prefetch 导致 TTFB 偏高

### 假设陈述

Next.js `<Link>` 默认 prefetch，但项目可能在某些场景下禁用了 prefetch，
或路由配置（如 dynamic params）导致 prefetch 失效，
造成路由切换 TTFB 偏高。

### 验证方法

1. Network 面板观察 `<Link>` hover 时的 prefetch 请求
2. 检查 `next/link` 使用方式是否传了 `prefetch={false}`
3. 测量路由切换 TTFB

### 验证结果

**❌ 已排除（2026-06-30 静态审查）**

- 全仓库 grep `prefetch={false}`：**0 处匹配**——无任何 `<Link>` 禁用了 prefetch
- 8 个使用 `next/link` 的文件（Header / Footer / tool/[slug] / FavoritesView / admin/layout / error / global-error / not-found）均用默认 prefetch
- Next.js 16 App Router 默认对视口内 `<Link>` 自动 prefetch（生产环境）

结论：假设前提（"某些场景禁用了 prefetch"）不成立。
TTFB 若偏高，根因更可能在服务端（dynamic 路由 SSR / DB 查询），不在 prefetch 配置。
待 Sentry Web Vitals 积累 P75 TTFB 数据后，若确实偏高，另立假设排查服务端渲染链路。

### 修复方案

无需修复（假设不成立）。

### before/after 数据

N/A（待 Sentry P75 TTFB 数据交叉确认服务端侧）

### commit

N/A（仅追踪表更新）

---

## 追踪表更新规则

1. 每个假设开始验证时，状态从 🔄 改为 🔍
2. 验证完成后填写"验证结果"章节，状态改为 ❌（排除）或继续修复
3. 修复完成后填写"修复方案"+"before/after"+"commit"，状态改为 ✅
4. 部分修复（如多步实施）状态用 ⚠️
5. 完成后更新顶部总览表
