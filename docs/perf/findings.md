# 性能假设验证追踪表

> **建立时间**：2026-06-29
> **关联文档**：`docs/superpowers/specs/2026-06-29-performance-optimization-design.md` §四

每个假设必须走完整循环：**验证 → 修复 → 量化对比 → 提交**。

---

## 假设总览

| # | 假设 | 优先级 | 状态 | commit |
|---|---|---|---|---|
| H1 | PanguSpacing 500ms 后 DOM 修改拖慢 INP | P0 | 🔄 待验证 | — |
| H2 | 513 LinkCard 实例造成首屏长任务 | P0 | 🔄 待验证 | — |
| H3 | Fuse.js 客户端索引残留 | P1 | 🔄 待验证 | — |
| H4 | Favicon 同步 `new Image()` 加载阻塞 CLS | P1 | 🔄 待验证 | — |
| H5 | Motion 动画在低端设备触发 layout thrashing | P2 | 🔄 待验证 | — |
| H6 | 首屏 JS chunk 中存在可拆分的 sync import | P2 | 🔄 待验证 | — |
| H7 | Sentry client bundle 占首屏 JS 比重过高 | P3 | 🔄 待验证 | — |
| H8 | 路由切换无 prefetch 导致 TTFB 偏高 | P3 | 🔄 待验证 | — |

**状态图例**：🔄 待验证 / 🔍 验证中 / ❌ 已排除 / ✅ 已修复 / ⚠️ 部分修复

---

## H1: PanguSpacing 500ms 后 DOM 修改拖慢 INP

### 假设陈述

`components/PanguSpacing.tsx` 在挂载后延迟 500ms 调用 `pangu.spacingPage()`，
该函数会直接遍历整个 DOM 树修改文本节点（中英文之间插入空格）。
在 513 个 LinkCard + 详情页等场景下，DOM 节点数较多，
该同步操作可能造成 >50ms 的长任务，拖慢 INP 指标。

### 验证方法

1. 启动 `pnpm dev`，访问首页
2. Chrome DevTools → Performance 面板 → 录制
3. 模拟用户交互（点击侧边栏分类切换）
4. 检查 INP 长任务中是否含 `pangu.spacingPage` 调用栈
5. 同时在 Performance 录制中搜索 "pangu" 关键字

### 验证结果

_待填写_

### 修复方案

_待填写（验证成立后选 A/B/C 预案，见设计文档 §4.3）_

### before/after 数据

_待填写_

### commit

_待填写_

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

_待填写_

### 修复方案

候选：虚拟滚动 / 分页渲染 / 改用 react-window

### before/after 数据

_待填写_

### commit

_待填写_

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

_待填写_

### 修复方案

_待填写_

### before/after 数据

_待填写_

### commit

_待填写_

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

_待填写_

### 修复方案

候选：固定 favicon img 尺寸 / 改用 next/image with placeholder

### before/after 数据

_待填写_

### commit

_待填写_

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

_待填写_

### 修复方案

候选：改用 transform/opacity / CSS transition 替代

### before/after 数据

_待填写_

### commit

_待填写_

---

## H6: 首屏 JS chunk 中存在可拆分的 sync import

### 假设陈述

`pnpm analyze` 报告中，首屏 first-load JS 可能包含本可动态 import 的模块，
如 Sentry 全量初始化、Supabase client、ModelRanking 数据等。

### 验证方法

1. `pnpm analyze` 生成报告
2. 检查 first-load JS chunk 内容
3. 找出可在 below-the-fold 或路由切换时再加载的模块

### 验证结果

_待填写_

### 修复方案

_待填写_

### before/after 数据

_待填写_

### commit

_待填写_

---

## H7: Sentry client bundle 占首屏 JS 比重过高

### 假设陈述

`@sentry/nextjs` client bundle 可能因 replay / tracing 全量启用，
导致首屏 JS 占用 30KB+，影响 LCP。

### 验证方法

1. `pnpm analyze` 查看 @sentry 在 client chunk 的大小
2. 评估是否启用 Sentry Replay（最大开销来源）

### 验证结果

_待填写_

### 修复方案

候选：lazy-load Sentry / 关闭 Replay / 按需启用 tracing

### before/after 数据

_待填写_

### commit

_待填写_

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

_待填写_

### 修复方案

_待填写_

### before/after 数据

_待填写_

### commit

_待填写_

---

## 追踪表更新规则

1. 每个假设开始验证时，状态从 🔄 改为 🔍
2. 验证完成后填写"验证结果"章节，状态改为 ❌（排除）或继续修复
3. 修复完成后填写"修复方案"+"before/after"+"commit"，状态改为 ✅
4. 部分修复（如多步实施）状态用 ⚠️
5. 完成后更新顶部总览表
