# Product

## Register

product

## Users

开发者、设计师、AI 从业者、独立开发者。在多窗口、多任务的开发或调研场景下使用本站：快速找到合适的工具、模型、服务、教程、资源。浏览时间以秒计：用户带着明确任务来（找 X / 比 A 和 B / 收藏整理），扫一眼就走。极少阅读长文，扫描 + 决策为主。

## Product Purpose

综合 AI / 开发 / 设计资源导航站：514+ 收录站点 × 9 大分类 × 标签交叉筛选 × 模型排行榜。核心任务是**让人在 5 秒内找到他要的工具**，并提供工具详情页（评价、相关推荐、点击追踪）和提交审核闭环。成功指标是「找到 → 点击」的转化率，而非停留时长。

## Brand Personality

**友好 · 明亮 · 高效**

- 友好：圆角柔和、不冰冷、可发现性强、容错友好（搜索失败/空状态）
- 明亮：浅色基调为主、低饱和度强调色、克制留白
- 高效：信息密度合理（不堆砌也不空旷）、可键盘操作、零装饰性 motion

语气参考：Notion / Raycast 的工具型 UI，而非 Linear / Vercel marketing 的冷峻 brand 型。

## Anti-references

明确不要像以下四种 nav-site：

- **老式 Web 导航站（hao123 系）**：满屏链接列表、表格化布局、PR 堆砌、灰色背景、信息密度过高无层级
- **AI 套壳 SaaS（2026 默认风）**：紫色渐变、glassmorphism、hero 大数字 + 03 步骤卡、03 eyebrow 编号
- **过度装饰的炫技站**：大量 motion、3D、shader、blur 背景、过度动画干扰阅读
- **Mac/iOS Dock 拟物风**：图标巨大、磁吸效果、半透明 dock 栏、与工具型阅读场景不匹配

## Design Principles

1. **密度 > 装饰**：每个像素都要服务于「更快找到工具」。装饰性 motion、过度圆角、阴影叠加、glassmorphism 都是负分。
2. **扫描而非阅读**：用户视线呈 F 型扫过页面，每个 link card 的标题 / 描述 / 标签都要在 1 秒内可读。字号、对比度、信息层级以此为前提。
3. **工具型层级清晰**：侧栏分类 → 标签筛选 → 内容卡片三层结构是骨架；任何视觉改动不能破坏这三层的从属关系。
4. **克制即品质**：单一品牌色（浅蓝 oklch 0.62 0.18 250）+ 中性灰阶 + 一抹强调色即可。多色渐变、装饰渐变、彩色阴影一律禁止。
5. **键盘可达**：⌘1-9 切分类、↑↓ 导航结果、Enter 确认 — 所有核心交互必须键盘可达。Focus ring 不能被装饰性样式遮盖。

## Accessibility & Inclusion

- WCAG 2.1 AA 对比度（muted-foreground 当前 oklch 0.45 在浅色背景上对比度约 4.6:1，刚好达标，不能更浅）
- `prefers-reduced-motion` 必须支持（侧栏 slide-in、TagFilter 显隐都已有 motion，需提供 fallback）
- Focus ring 必须 2px 实线 + 2px offset，不可被 border / shadow 遮盖
- 键盘导航：所有可交互元素必须 `:focus-visible` 可达，Tab 顺序符合视觉顺序
- 色盲友好：分类图标 + 文字标签双重编码，不仅靠颜色区分状态
