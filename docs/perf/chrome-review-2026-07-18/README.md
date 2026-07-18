# Chrome 人工抽检证据 — 2026-07-18

> 关联：`docs/frontend-perf-optimization-2026-07-18.md`  
> 生产主域：`https://yuanjia1314.ccwu.cc`  
> 绑定 commit（截图时点附近）：`353a1fda` → `46981a1a`（favicon 后验）

## 文件

| 文件 | 视口 / 场景 | 用途 |
|---|---|---|
| `home-top.png` | 桌面 · 首页顶部 | Header + 侧栏 + 首屏卡片布局 |
| `home-mid.png` | 桌面 · 结果区中部 | 分类区 / DualTrack 卡片密度 |
| `home-lower.png` | 桌面 · 页面下部 | 更多分类与加载更多区域 |
| `home-mobile.png` | 移动端首页 | 移动导航 + 卡片栅格 |
| `layout-outline.png` | 布局轮廓 | 侧栏 / 主区 / 卡片网格结构对照 |

## 抽检结论（人工 + 网络）

1. **侧栏切换**：结果区可见时不强制滚回顶部（对应 `ff16a93`）。  
2. **首屏挂载**：分类区在 DualTrack 预算之后仍有卡片（`b8cb1f6a` / `9c8175ee`）。  
3. **Favicon（`46981a1` 后验）**：  
   - 首页约 129 次 `/api/favicon` 请求，**0 失败**  
   - 卡片 UI 无破图；无上游图时 monogram SVG 200  
   - 源分布示例：ddg / google-v2 / monogram / cccyun / google-s2  
4. **仍属后续**：库内 `icon` 字段覆盖率、虚拟列表、生产 Lighthouse 对比（需 CF 不拦探针）。

## 使用方式

- 作为本轮前台 UX 证据附件，不替代自动化探针。  
- 复验时优先跑 `pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <HEAD>`，再用浏览器硬刷新（Ctrl+F5）目视图标。  
