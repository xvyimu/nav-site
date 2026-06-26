# 综合导航站 — 设计方案与需求文档

> 设计定位：面向开发者的综合资源导航平台 · 一站式覆盖 AI/云服务/开发工具/开源项目/设计/学习
>
> 文档版本 v6.0 · 2026-06-24 · 514 站点 · 9 分类 · next-auth v5 · 服务端搜索 · GitHub OAuth

---

## 一、设计理念

### 关键词
`综合` `实用` `高效` `可信` `克制`

- **从"API 导航"到"开发者资源门户"** — 覆盖开发者日常需要的全部资源类型
- **分类驱动** — 清晰的多级分类体系，让用户快速定位所需资源
- **可信策展** — 人工精选 + 社区推荐，不做算法劫持、不塞广告
- **信息效率** — 高密度低干扰的卡片布局，减少浏览噪音

**核心原则：让开发者在最快路径下找到想要的资源。**

---

## 二、分类体系

### 顶层分类（9 个类别，514 站点）

| 分类 | slug |
|------|------|
| AI & 大模型 | `ai-api` |
| 云服务 & VPS | `cloud-vps` |
| 开发工具 | `dev-tools` |
| 设计资源 | `design` |
| 在线工具 | `online-tools` |
| 开源项目 | `open-source` |
| 软件应用 | `software` |
| 学习 & 社区 | `learning` |
| 企业 & 运营工具 | `business` |

> 分类映射配置：`lib/nav-config.ts` · 分类图标：`lib/category-icons.ts`

---

## 三、布局结构

```
┌─────────────────────────────────────────────────────┐
│  Header                                             │
│  🧭 综合导航站     [收藏] [API] [提交] [登录] [🌙]    │
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │  主内容区域                               │
│ (w-64)   │                                           │
│           │  🔍 [搜索站点、分类或描述...]  [⌘K]      │
│  ▦ 全部   │                                           │
│  ⚡ 公益  │  ✦ 精选推荐  | 🕐 最新收录 | 📈 热门      │
│  🤖 AI    │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  ☁️ 云    │  │    │ │    │ │    │ │    │ │    │    │
│  🛠 开发   │  └────┘ └────┘ └────┘ └────┘ └────┘    │
│  🎨 设计   │                                           │
│  🔧 工具   │  云服务 & VPS                            │
│  📚 开源   │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  💻 软件   │  │    │ │    │ │    │ │    │ │    │    │
│  📖 学习   │  └────┘ └────┘ └────┘ └────┘ └────┘    │
│  🏢 企业   │                                           │
│           │  模型排行榜（仅 AI 分类时显示）             │
├──────────┴──────────────────────────────────────────┤
│  Footer                                              │
│  © 2026 综合导航站 · 提交站点 · 管理 · 同款网站搭建  │
└─────────────────────────────────────────────────────┘
```

> 注：上图中 emoji 仅用于示意，实际使用 Lucide React 图标组件。

### 布局要点

| 区域 | 规范 | 说明 |
|------|------|------|
| 侧边栏 | `w-64` 固定 | 桌面端常驻，移动端滑入式 overlay |
| 主内容区 | `flex-1 min-w-0` | 自适应剩余宽度 |
| 卡片网格 | 2-5 列自适应 | `sm:2 lg:3 xl:4 2xl:5` |
| 搜索框 | `rounded-[24px]` | 圆角搜索，蓝色聚焦光环 |
| 移动端 | 底部导航栏 | 全部分类横向滚动 + 汉堡菜单 |

---

## 四、设计规范（Design System）

### 4.1 颜色体系（OKLCH + 蓝色主色）

```
底色        #FFFFFF  (oklch 1 0 0)
文字主色    #0F172A  (oklch 0.13 0.01 250)
文字辅色    #64748B  (oklch 0.45 0.01 250)

蓝色主色    #3B82F6  (oklch 0.62 0.18 250)
蓝色背景    oklch(0.95 0.03 250 / 0.25)
蓝色边框    oklch(0.62 0.18 250 / 40%)
蓝色聚焦    oklch(0.62 0.18 250 / 60%) + ring 20%

灰色边框    #E2E8F0  (oklch 0.92 0.01 250)
灰色背景    #F8FAFC  (oklch 0.97 0 0)

暗色底色    oklch(0.12 0.008 260)
暗色主色    oklch(0.62 0.18 250)
```

### 4.2 字体规范

| 用途 | 字体 | 字号 | 字重 |
|------|------|------|------|
| 站点名称 | Geist Sans | 14px | 500 |
| 卡片标题 | Geist Sans | 14px | 500 |
| 卡片描述 | Geist Sans | 12px | 400 |
| 卡片域名 | Geist Mono | 11px | 400 |
| 分类标签（侧边栏） | Geist Sans | 13px | 500 |

### 4.3 间距与圆角

| 层级 | 值 | 组件 |
|------|------|------|
| 卡片网格间隙 | `gap-2.5` (10px) | CategorySection |
| 卡片内边距 | 12px | LinkCard |
| 页面垂直间距 | `py-6` (24px) | Navigation |
| 卡片圆角 | `rounded-xl` (12px) | LinkCard |
| 搜索框圆角 | `rounded-[24px]` | SearchBar |
| 侧边栏链接圆角 | `rounded-lg` (8px) | Sidebar |
| 徽章圆角 | `rounded-full` | Badges |

---

## 五、核心组件

### 5.1 LinkCard（链接卡片）

- Favicon 通过 `/api/favicon` 代理加载，Content-Type 白名单安全过滤
- 使用 `next/image` 的 `<NextImage>` 组件（`unoptimized` 模式适配代理 URL）
- Hover: 蓝色边框 + 上浮 2px + 柔和蓝色阴影
- 过渡动画: 0.2s cubic-bezier(0.32, 0, 0.08, 1)

### 5.2 Sidebar（侧边栏）

- 桌面端常驻显示，移动端 overlay 滑入
- 每个分类显示站点数量
- 当前激活分类蓝色高亮
- 图标通过 `lib/category-icons.ts` 统一管理（Lucide React）

### 5.3 SearchBar（搜索框）

- 圆角 24px，蓝色聚焦光环
- `⌘K` / `Ctrl+K` 全局聚焦快捷键
- 200ms 防抖后调用 `/api/search` 服务端 API
- 搜索中显示 `Loader2` 旋转图标

### 5.4 ModelRanking（模型排行榜）

- 通过 `next/dynamic` 动态导入（`ssr: false`），减少初始 JS bundle
- 仅在用户滚动到排行榜区域时加载
- 加载中显示脉冲骨架占位

---

## 六、技术架构

### 6.1 核心架构

| 层 | 选型 |
|---|------|
| 框架 | Next.js 16 (App Router, ISR) |
| 样式 | Tailwind CSS v4 + shadcn/ui |
| 动画 | motion (framer-motion) |
| 数据库 | Supabase PostgreSQL (单库模式) |
| 认证 | next-auth v5 (Credentials + GitHub OAuth) |
| 搜索 | Fuse.js 服务端搜索 (`/api/search` API) |
| 部署 | Netlify |

### 6.2 数据流

```
管理员 CRUD ──→ Supabase (nav_links / nav_categories)
用户提交 ────→ Supabase (approved=false, 待审核)
                    │
              ISR 60s 增量再生
                    │
              用户浏览器
                    │
         搜索 → /api/search → Fuse.js 服务端
         收藏 → localStorage + /api/favorites (登录后同步)
         点击 → /api/click → click_count + 1
```

### 6.3 认证流程

```
管理员登录 → Credentials provider → role: "admin"
用户登录  → GitHub OAuth → role: "user"
                    │
         proxy.ts middleware
                    │
         admin 路由 → 仅 role === "admin" 可访问
         其他路由 → 所有已登录用户可访问
```

### 6.4 SEO 架构

| 组件 | 实现 |
|------|------|
| 站点地图 | `app/sitemap.ts` — 静态页 + 工具详情页 + 分类页 |
| 爬虫规则 | `app/robots.ts` — 允许公开页，禁止 /admin /api/admin /login |
| OG 图片 | `app/opengraph-image.tsx` — `next/og` Edge Runtime 动态生成 1200x630 |
| JSON-LD | `WebSite` schema (layout.tsx) + `SoftwareApplication` (tool/[slug]) |
| 元数据 | `generateMetadata` 动态生成 title/description/OG/Twitter Card |

---

## 七、导航配置（lib/nav-config.ts）

分类 slug → 显示名称映射在 `lib/nav-config.ts` 中集中管理。新增分类只需在此添加映射，无需修改组件逻辑。

分类图标映射在 `lib/category-icons.ts` 中，使用 Lucide React 图标组件。

---

## 八、已实现功能清单

### Phase 1-12（基础建设）
- 11 个分类体系，287 个精选站点
- LinkCard 卡片组件 + Favicon 代理
- 侧边栏分类导航 + 搜索框
- 管理后台 CRUD（链接 + 分类）
- 用户提交 + 审核
- 点击计数 + 热门排行
- 程序化 SEO 工具详情页
- Sentry 监控 + 结构化日志
- CI/CD 流水线（lint + tsc + test + build + e2e + deploy）
- 73 单元测试 + 18 E2E 测试

### Phase 13（搜索 + API 文档 + 图片优化）
- 服务端 Fuse.js 搜索 API（`/api/search`）
- API 文档页面（`/api-docs`）
- LinkCard 使用 `next/image` 优化
- Favicon 代理 Content-Type 白名单

### Phase 14（用户账号系统）
- GitHub OAuth 登录
- 用户收藏同步（`user_favorites` 表 + RLS）
- localStorage + 服务端双写同步
- Header 登录/退出按钮

### Phase 15（UX 完善 + 性能优化）
- 自定义 404 页面
- 路由级 loading 骨架屏
- 动态 OG 图片生成（`next/og`）
- ModelRanking 动态导入
- 无障碍 skip-to-content 链接

---

> 文档版本 v5.0 · 2026-06-24
> 进度详情请参阅 `docs/PROGRESS.md`
