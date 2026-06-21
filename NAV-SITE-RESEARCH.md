# 公益API导航站 — 源码深度研究报告

> 面向下一个接手的 AI Agent 的全景分析文档。读完即可开始工作。

---

## 1. Project Overview

| 项目 | 内容 |
|------|------|
| 名称 | 公益API导航站 (Public API Navigator) |
| 定位 | 收录 AI 大模型 API 的导航平台，涵盖官方原厂与公益中转服务 |
| 受众 | 中文开发者、AI 爱好者、寻找免费/低价 API 中转服务的用户 |
| 线上地址 | `https://yuanjia1314.ccwu.cc`（通过 Cloudflare 反向代理指向 Vercel） |
| 包管理器 | pnpm 11.5.0 |

### 技术栈

| 层 | 技术选型 | 版本 |
|----|----------|------|
| 框架 | Next.js | 16.2.9 |
| 语言 | TypeScript | ^5 |
| 样式 | Tailwind CSS | ^4 (PostCSS) |
| 动画 | motion (framer-motion 继任) | 12.40.0 |
| 数据库 | Supabase (PostgreSQL) x2 | — |
| 认证 | HMAC-SHA256 Cookie | 自实现 |
| 组件库 | shadcn/ui (base-ui/react) | 4.11.0 |
| 运行时 | React | 19.2.4 |
| 主题切换 | next-themes | 0.4.6 |
| 中英文间距 | pangu.js (v7.x) | — |
| Toaster | sonner | 2.0.7 |
| 分析 | Google Analytics (GA4) | — |

### 关键依赖

- `@supabase/ssr` 0.12.0 — 服务端渲染 Supabase 客户端
- `@supabase/supabase-js` 2.108.2 — 通用客户端
- `class-variance-authority` 0.7.1 + `tailwind-merge` 3.6.0 — shadcn 工具链
- `lucide-react` 1.20.0 — 图标
- `tw-animate-css` 1.4.0 — Tailwind 动画扩展

---

## 2. System Architecture

### 2.1 Dual-DB 架构（核心设计决策）

项目维护了两个 Supabase 数据库实例，使用 `NODE_ENV` 自动路由：

```
开发环境 (npm run dev)        →  开发库 nzaocqwumlmbewoddysd
部署环境 (Vercel production)  →  生产库 vyqqbypwrbdcafanzwmj
```

路由逻辑在 `lib/supabase/config.ts`：
- 公开客户端（server.ts / client.ts）调用 `getSupabaseUrl() / getSupabaseKey()`，根据 `process.env.NODE_ENV` 自动选择 DEV/PROD URL 和 anon key
- 管理员客户端（admin.ts）**始终**连接到开发库，无论环境。因为开发库是唯一写入源

环境变量命名约定：
```
NEXT_PUBLIC_SUPABASE_URL           → 生产库 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY      → 生产库 anon key
NEXT_PUBLIC_SUPABASE_URL_DEV       → 开发库 URL（fallback 到 NEXT_PUBLIC_SUPABASE_URL）
NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV  → 开发库 anon key（fallback 到 NEXT_PUBLIC_SUPABASE_ANON_KEY）
```

### 2.2 ISR 策略

首页 `app/page.tsx` 顶部声明：
```ts
export const revalidate = 60; // 每60秒增量重新生成
```

数据获取使用 `Promise.all` 并行取数（categories + links + rankings），ISR 确保页面数据最长 60 秒延迟。

### 2.3 Admin vs Public 路由

- **公开路由**：首页、提交页面 /submit、登录页面 /login
- **管理路由**：/admin（链接管理）、/admin/categories（分类管理），受 `verifyAdmin()` 保护
- **API 路由**：/api/admin/* 全部由 `withAdmin` HOF 包裹

### 2.4 Sync Pipeline

```
开发库（唯一写入源）──[GitHub Actions / 手动]──→ 生产库（只读查询）
```

- 触发方式：每 6 小时自动（cron: `0 */6 * * *`）+ 手动 `workflow_dispatch`
- 同步策略：**insert-only**（检查 ID/URL 去重，不存在则插入，不更新已有记录）
- 也同步 orphan 清理：目标库中已不在源库的记录会被删除
- 同步范围：`nav_categories`（按 id 去重）→ `nav_links`（按 url 去重）→ `model_rankings`（按 id 去重）
- CI/CD 认证：通过 GitHub Secrets 注入 `SOURCE_SUPABASE_URL / SOURCE_SUPABASE_ANON_KEY` 等

另外，`/api/sync/route.ts` 提供 HTTP 端点（保护 token：`?secret=CRON_SECRET`），可被 Vercel Cron Job 调用，但当前未启用。

---

## 3. Database Schema

### 3.1 nav_categories

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID (PK) | 预定义的固定 UUID（迁移脚本硬编码） |
| name | TEXT | 分类显示名：`公益中转站`、`大厂API`、`开源模型`、`算力GPU` |
| slug | TEXT (UNIQUE) | 英文标识：`free-relay`、`big-tech`、`oss-model`、`gpu`（slug 决定 LinkCard 左边框颜色） |
| description | TEXT | 分类描述 |
| icon | TEXT | Emoji 图标 |
| sort_order | INTEGER | 排序 |
| created_at | TIMESTAMPTZ | 自动生成 |

### 3.2 nav_links

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID (PK) | 自动生成 |
| title | TEXT | 站点名称 |
| url | TEXT | 目标 URL |
| description | TEXT | 一句话描述 |
| icon | TEXT | Emoji 图标 |
| category_id | UUID (FK → nav_categories.id) | 分类外键 |
| approved | BOOLEAN | 已审核（默认 true，提交站点默认 false） |
| paid | BOOLEAN | 付费推广标记 |
| featured | BOOLEAN | 推荐标记 |
| click_count | INTEGER | 点击计数器，由 `increment_click` RPC 函数原子递增 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### 3.3 model_rankings

| 列 | 类型 | 说明 |
|---|------|------|
| id | UUID (PK) | 自动生成 |
| rank | INTEGER NOT NULL | 排名序号 |
| model_name | TEXT NOT NULL | 模型名称 |
| source | TEXT NOT NULL | 榜单来源（5 种见下文） |
| score | TEXT | 评分/分数（字符串，如 "1428"、"91.2%"） |
| description | TEXT | 模型简介 |
| icon | TEXT | 模型图标（默认 🤖） |
| url | TEXT | 跳转链接 |
| category | TEXT NOT NULL | 模型类型：`closed`（闭源）/ `open`（开源） |
| extra | JSONB | 额外元数据 |
| created_at / updated_at | TIMESTAMPTZ | 时间戳 |

### 3.4 RLS Policies

所有表均为宽松策略：`SELECT` 对公开，`INSERT/UPDATE/DELETE` 对 anon 角色开放（不依赖 Supabase Auth）。管理员安全通过应用层的 HMAC cookie 和 `withAdmin` HOF 保障。

索引：
- `nav_links`: `category_id`, `approved`, `featured`, `url`
- `nav_categories`: `slug`
- `model_rankings`: `source`, `(source, rank)`

### 3.5 关键关联关系

```sql
link.category_id → nav_categories.id (left join for category_name/slug)
```

---

## 4. Codebase Map

### 4.1 /app 目录结构

```
app/
├── layout.tsx          # 根布局：Geist 字体 + ThemeProvider + SubtleStars + Header + Footer + Analytics + Toaster
├── page.tsx            # 首页：ISR 60s, Promise.all 并行取数, 渲染 Navigation
├── globals.css         # 完整设计系统 (Tailwind v4 + OKLCH 变量 + shadcn)
├── login/
│   └── page.tsx        # 管理员登录表单
├── admin/
│   ├── layout.tsx      # 管理后台布局（深色渐变背景 + 导航 + LogoutButton）
│   ├── page.tsx        # 链接管理 CRUD
│   └── categories/
│       └── page.tsx    # 分类管理 CRUD
├── submit/
│   └── page.tsx        # 公开站点提交流页面
└── api/
    ├── submit/route.ts      # POST 提交站点（写开发库）
    ├── click/route.ts       # POST 点击计数（调用 RPC increment_click）
    ├── sync/route.ts        # GET 数据库同步（校验 CRON_SECRET，双库直接同步）
    ├── checkout/route.ts    # （预留）支付
    ├── webhook/route.ts     # （预留）支付回调
    └── admin/
        ├── login/route.ts           # POST（登录）/ DELETE（登出）
        ├── links/route.ts           # GET（列表）/ POST（创建）
        ├── links/[id]/route.ts      # PUT / DELETE
        ├── categories/route.ts      # GET（列表）/ POST（创建）
        └── categories/[id]/route.ts # PUT / DELETE
```

### 4.2 /components 目录（共 24 个 .tsx 文件）

| 组件 | 角色 | 备注 |
|------|------|------|
| `Header.tsx` | 顶部粘性导航栏 | 品牌名 + 提交/管理链接 + ThemeToggle |
| `Footer.tsx` | 底部 | © 2026 + oneLN 链接 |
| `Navigation.tsx` | **核心编排组件** | Tab 切换 + 分类筛选 + 搜索 + 推荐区 + 链接列表 + ModelRanking 集成 |
| `LinkCard.tsx` | **核心卡片组件** | 多态左边框 + Badge + 域名 + 时间 + 点击计数 + 点击跟踪 |
| `ModelRanking.tsx` | 模型排行榜 | 5 类榜单切换 + 排名行 + 开源/闭源徽章 |
| `SearchBar.tsx` | 搜索框 | 聚焦蓝色光环 + 清除按钮 |
| `CategoryFilter.tsx` | 分类筛选按钮 (已废弃) | — |
| `HeroSection.tsx` | 主视觉区 (文件不存在) | 当前在 page.tsx inline |
| `SubtleStars.tsx` | 满天星背景 | 纯 CSS radial-gradient，24 个星点，零 JS |
| `PanguSpacing.tsx` | 中英文间距 | 客户端 lazy-load pangu.js |
| `ThemeToggle.tsx` | 夜间模式切换 | ☀/☾ |
| `ThemeProvider.tsx` | next-themes 封装 | `defaultTheme="light" enableSystem` |
| `Analytics.tsx` | GA4 分析 | `NEXT_PUBLIC_GA_MEASUREMENT_ID` 非占位才加载 |
| `SubmitForm.tsx` | 提交流表单 | 分类选择 + 客户端校验 |
| `admin/LogoutButton.tsx` | 登出按钮 | 调用 DELETE /api/admin/login |
| `ui/` | shadcn 组件 | card, badge, button, skeleton, input, tabs, textarea, dialog, sonner, command, input-group |

### 4.3 /lib 目录

| 文件 | 作用 |
|------|------|
| `supabase/config.ts` | 双库路由工厂（getSupabaseUrl / getSupabaseKey / getAdminSupabaseUrl） |
| `supabase/server.ts` | SSR 客户端（服务端组件/API 路由使用） |
| `supabase/client.ts` | 浏览器客户端（客户端组件使用） |
| `supabase/admin.ts` | 管理员客户端（固定连 DEV 库） |
| `admin.ts` | HMAC cookie 鉴权（setSessionCookie / verifyAdmin / clearSession） |
| `admin-middleware.ts` | `withAdmin(handler)` — API 路由保护 HOF |
| `types.ts` | Category / NavLink / NavLinkWithCategory 接口 + getLinkType + relativeTime |
| `model-rankings.ts` | `getModelRankings()` — SSR 获取排行榜数据 |
| `animations.ts` | motion 变体：staggerContainer / fadeInUp / slideDown |
| `utils.ts` | `cn()` classname 合并 |

### 4.4 /scripts 目录

| 文件 | 作用 |
|------|------|
| `setup-env.mjs` | 交互式 `.env.local` 初始化 |
| `add.mjs` | 一键添加链接（终端交互） |
| `sync-db.mjs` | 双库同步脚本（insert-only + orphan 清理） |
| `migrate-to-prod.sql` | 生产库完整数据迁移（含初始种子数据） |
| `sync-to-prod-db.sql` | 新库数据同步（含真实中转站数据） |
| `fix-prod-admin.sql` | RLS 权限修复 + aff 链接清理 |
| `create-model-rankings.sql` | 模型排行榜表建表 DDL |

---

## 5. Feature Status

### P0（已完成 — 核心功能）

- 白底 + 黑 + 浅蓝主色调设计系统
- 双板块布局（官方 API / 中转服务站）+ 下划线滑动指示器 Tab
- 分类筛选（big-tech / free-relay / oss-model / gpu）+ 搜索
- 推荐区（featured 优先混排，官方在前）
- LinkCard 左侧颜色边（官方蓝色 / 中转琥珀色）
- Badge 体系（官方 / 中转 / 推荐 / 排行）
- 柔和满天星 CSS 背景 + oneLN 页脚标 + pangu.js 中英文间距
- ISR 60s 增量再生
- 管理员 CRUD 面板（链接 + 分类）
- 双库数据同步（GitHub Actions + 同步脚本）
- 一键添加脚本 `pnpm add`
- 环境变量模板 + 初始化脚本 `pnpm setup`
- aff 链接清理

### P1（已完成 — 增强功能）

- 模型排行榜（ModelRanking 独立表 + 组件，5 类榜单）
- 评论/稳定性标签（通过 model_rankings 表实现）
- 数据最后更新时间戳（卡片显示 updated_at 相对时间）
- 链接点击计数（increment_click RPC + click_count 显示）
- 基础暗色模式（.dark CSS 变量 + next-themes 系统偏好自动切换）
- CI 缓存升级（actions/cache@v4）

### P2（未实现 — 中优先级）

- 今日推荐大卡片（类似 Awwwards SOTD）
- 热门 API 排行榜（按点击量排序）
- 标签系统（多标签交叉过滤）
- 提交站点后的审核通知
- 站内站点详情页
- RSS/定期更新通知

### P3（未实现 — 低优先级）

- 多语言支持
- API 状态检测（自动检测站点是否在线）
- 用户评论/反馈系统
- 收藏夹功能
- 数据导出（OPML/JSON）

---

## 6. Design System

### 6.1 颜色体系（OKLCH）

所有颜色用 `oklch()` 函数定义，确保跨设备视觉一致性。

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--background` | oklch(1 0 0) / #FFF | oklch(0.15 0.01 260) | 页面背景 |
| `--foreground` | oklch(0.13 0.01 250) | oklch(0.93 0.005 260) | 文字主色 |
| `--primary` | oklch(0.62 0.18 250) | 同左 | 浅蓝主色 |
| `--muted-foreground` | oklch(0.45 0.01 250) | oklch(0.5 0.01 255) | 辅助文字 |
| `--border` | oklch(0.92 0.01 250) | oklch(0.93 0.005 260 / 10%) | 边框 |
| `--card` | oklch(1 0 0) | oklch(0.18 0.01 260) | 卡片背景 |
| `--ring` | oklch(0.62 0.18 250) | 同左 | 聚焦环 |

### 6.2 字体

- **正文字体**：Geist Sans（Next.js 内置优化）
- **等宽字体**：Geist Mono（域名用，11px）
- 字号：标题 14px / 正文 14px / 描述 12px / 域名 11px

### 6.3 间距与圆角

- 卡片间距 12px / 卡片内边距 16px / 页面安全边距 16px
- 卡片圆角 8px / 按钮圆角 6px / Badge 全圆角 999px
- 基础半径 `--radius: 0.75rem`

### 6.4 动画约定

```ts
// motion 变体（定义在 lib/animations.ts）
staggerContainer: stagger 0.04s, delayChildren 0.02s
fadeInUp: opacity + y:10→0, 0.3s, ease [0.22, 1, 0.36, 1]
slideDown: opacity + y:-8→0, 0.35s

// Card hover（CSS 实现）
.card-hover: 0.2s cubic-bezier(0.32, 0, 0.08, 1)
// hover: border-color primary/30% + box-shadow + translateY(-1px)

// Tab indicator（motion layoutId spring）
// layoutId="section-indicator" + spring stiffness 380, damping 30
```

---

## 7. Model Ranking Feature（新增于 P1）

### 7.1 数据模型

独立表 `model_rankings`，5 种 source（榜单来源）：

| source 值 | 中文标签 | 颜色标识 |
|-----------|----------|----------|
| `综合旗舰` | 综合旗舰（闭源） | 蓝色 |
| `开源模型` | 开源模型 TOP5 | 翡翠绿 |
| `Chatbot Arena` | Chatbot Arena（斯坦福） | 紫色 |
| `SuperCLUE` | SuperCLUE 中文榜 | 琥珀色 |
| `能力冠军` | 分能力单项冠军 | 玫瑰红 |

### 7.2 数据获取

`lib/model-rankings.ts` 的 `getModelRankings()` 以 SSR 方式从 Supabase 获取数据，按 `source` + `rank` 排序，发生在 ISR 页面生成时。

### 7.3 显示组件 `ModelRanking.tsx`

- 顶部 Source Tab 切换（全部/按来源），使用 motion layoutId="ranking-source" 下划线指示器
- Tab 选中时按 source 分组显示，每组的 section 标题带颜色横线
- 每行 RankingRow：排名徽章 + 模型图标 + 模型名 + 开源/闭源徽章 + 描述 + 分数
- 前三名带背景高亮（金/银/铜色）
- 搜索时支持按模型名/描述/source 过滤

### 7.4 与 Navigation 集成

- Navigation.tsx 中新增 `model-ranking` tab
- 数据通过 `page.tsx` → `Navigation` props → `ModelRanking` 传递
- 搜索框同时作用于 NavLink 和 ModelRanking

---

## 8. Auth & Admin

### 8.1 HMAC Cookie 认证流程（自实现，不依赖 NextAuth/Supabase Auth）

```
登录 POST /api/admin/login
  → 校验 password === ADMIN_PASSWORD（环境变量）
  → 生成 HMAC-SHA256 token: crypto.createHmac("sha256", password).update("admin-session").digest("hex")
  → 设置 httpOnly secure sameSite=lax cookie，有效期 7 天

验证 verifyAdmin()
  → 读取 admin_session cookie
  → 用 ADMIN_PASSWORD 重新生成 HMAC 做 timingSafeEqual 对比
```

### 8.2 会话管理

- `setSessionCookie(password)` — 登录
- `verifyAdmin(): boolean` — 中间件检查
- `clearSession()` — 登出
- 无 token refresh 机制，cookie 过期即需重新登录

### 8.3 Admin Layout

- `app/admin/layout.tsx`：深色渐变背景（`from-sky-950 via-slate-900 to-slate-950`）
- 顶部导航栏：链接管理 / 分类管理 / 返回前台 / 登出
- 所有 /admin/* 路由先执行 `verifyAdmin()`，未认证则 redirect /login

### 8.4 API 保护模式

```ts
// 两层保护：
// 1. API 路由用 withAdmin HOF 包裹
export const GET = withAdmin(async () => { ... });

// 2. withAdmin 内部调用 verifyAdmin()，未通过返回 401
// 3. 管理员客户端始终连 DEV 数据库（admin.ts）
```

### 8.5 管理功能

- **链接管理**（`/admin`）：列表 + 新增/编辑表单 + 删除，支持设置 approved / featured
- **分类管理**（`/admin/categories`）：列表 + 新增/编辑表单 + 删除，设置 slug / sort_order
- **公共提交**（`/submit`）：游客可提交站点，提交后 `approved=false`，需管理员审核通过后才在前台展示

### 8.6 其他 API

- `/api/click`：POST 点击计数，服务端调用 `increment_click` RPC 原子递增
- `/api/checkout` 和 `/api/webhook`：已预留结构，未实现支付逻辑

---

## 9. CI/CD & Deployment

### 9.1 Vercel Deployment

- 框架预设：Next.js
- 构建命令：`pnpm build`
- 部署方式：自动（通过 GitHub 集成或 Vercel CLI）
- ISR 支持：页面路由自动启用 ISR

### 9.2 GitHub Actions

只有一个 workflow `.github/workflows/sync-db.yml`：
- 触发：每 6 小时（cron）+ 手动（workflow_dispatch）
- 步骤：checkout → setup node 22 → pnpm install → `node scripts/sync-db.mjs`
- 环境变量通过 GitHub Secrets 注入

### 9.3 域名与代理

- 真实部署：Vercel（自动分配域）
- 自定义域名：`yuanjia1314.ccwu.cc`（通过 Cloudflare 反向代理指向 Vercel）
- 用于 SEO 的 site URL：`NEXT_PUBLIC_SITE_URL`

### 9.4 环境变量清单

| 变量 | 用途 | 必须 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 生产库 URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 生产库 anon key | yes |
| `NEXT_PUBLIC_SUPABASE_URL_DEV` | 开发库 URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV` | 开发库 anon key | yes |
| `ADMIN_PASSWORD` | 管理后台密码 | yes |
| `NEXT_PUBLIC_SITE_URL` | 站点 URL | yes |
| `CRON_SECRET` | 同步 API 的保护 token | optional |
| `SOURCE_SUPABASE_URL` | GitHub Actions 源库 URL | CI only |
| `SOURCE_SUPABASE_ANON_KEY` | GitHub Actions 源库 key | CI only |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics ID | optional |

---

## 10. Key Conventions & Constraints

### 10.1 注释语言策略
- 代码注释使用英文
- 用户可见文本使用中文
- 设计文档、研究报告、沟通使用中文

### 10.2 编码模式

```ts
// 1. 双库路由 — 公开页面用 server.ts，API 路由用 config.ts 工厂
// 2. 管理员操作固定使用 admin.ts → 开发库
// 3. withAdmin HOF 包裹所有 /api/admin/* 端点
// 4. ISR 页面用 Promise.all 并行取数
// 5. 客户端组件以 "use client" 显式声明
// 6. motion 动画优先用 lib/animations.ts 的命名变体
// 7. Card 禁用 direct link，通过 onClick handler 发送点击跟踪
```

### 10.3 双库路由规则（铁律）

| 操作类型 | 数据库 | 说明 |
|----------|--------|------|
| 公开查询（页面渲染） | 按 NODE_ENV 自动路由 | DEV→开发库，PROD→生产库 |
| 管理员 CRUD | 始终开发库 | 所有增删改都写开发库 |
| 游客提交 | 开发库（submit API） | 提交后 approved=false |
| 点击计数 | 按环境路由 | DEV 点 DEV 库，PROD 点 PROD 库 |
| 数据库同步 | 开发库→生产库 | insert-only + orphan 清理 |

### 10.4 同步限制

`sync-db.mjs` 使用 `insert` 而非 `upsert`：
- 新记录会写入目标库
- 已有记录**不会被更新**
- 目标库中不在源库的记录**会被删除**（orphan 清理）
- 这意味着如果一行数据在源库被修改，更改不会自动同步到生产库

### 10.5 基础设施约束

- 运行环境：Windows 11 + Git Bash（本地开发）
- 命令前缀：所有 shell 命令必须前缀 `rtk`（通过 RTK 工具链过滤）
- 权限模型：RTK 是命令层 token 节省器，非权限边界
- Next.js 版本锁：Current is v16.2.9，有 breaking changes（见 AGENTS.md 警告，API 可能与训练数据不同）

### 10.6 其他项目配置

- `.claude/settings.json` — Claude Code 项目配置
- `CLAUDE.md / AGENTS.md` — 项目 AI 运行时规则
- 长期记忆：mem0（云端）+ cat_memories（Supabase 运行时桥接）
- 邮件验证链接等自动格式化为 Vercel 部署 URL，非 localhost

---

> 文档版本 v1.0 · 2026-06-21 · 基于项目实际代码审计编译  
> 完整性验证：已读取全部 30+ 源文件（app/layout.tsx / page.tsx / globals.css / 所有 API route / 所有组件 / lib / scripts / SQL / CI/CD / 设计文档）
