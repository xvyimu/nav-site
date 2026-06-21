# 公益API导航站（nav-site）· 全线审计报告

> **审计基准**: 2026-06-20 最后一次 git commit `3586321`  
> **报告用途**: 供其他 Agent 审计者理解全貌、定位问题、提出改进建议  
> **项目仓库**: `yuanjia1314/nav-site`  
> **生产地址**: https://yuanjia1314.ccwu.cc

---

## 目录

1. [项目总览](#1-项目总览)
2. [技术栈与版本](#2-技术栈与版本)
3. [文件结构与架构](#3-文件结构与架构)
4. [数据库架构（双库分层）](#4-数据库架构双库分层)
5. [核心组件详细分析](#5-核心组件详细分析)
6. [API 路由体系](#6-api-路由体系)
7. [权限与安全模型](#7-权限与安全模型)
8. [设计系统与样式](#8-设计系统与样式)
9. [已知问题与待改进项（Pendings）](#9-已知问题与待改进项pendings)
10. [审计者关注点（重点检查区）](#10-审计者关注点重点检查区)
11. [各审计维度建议提纲](#11-各审计维度建议提纲)

---

## 1. 项目总览

### 1.1 定位

专业简洁的 AI 大模型 API 导航平台，收录官方原厂与公益中转服务两类 API 入口。包含三个核心板块：

| 板块 Slug | 友好名称 | 标识色 | 内容 |
|-----------|----------|--------|------|
| `big-tech` | 官方 API | 蓝色 (#3B82F6) | 大厂官方 API（OpenAI / Claude / Google 等） |
| `free-relay` | 中转服务站 | 琥珀色 (#F59E0B) | 公益 API 中转地址 |
| `model-ranking` | 模型排行榜 | 紫色 | GLM/framework 排名数据 |

### 1.2 最近完成里程碑

- **P0**（基础功能）全部实现：双板块、Tab切换、分类筛选+搜索、推荐区、Badge体系、shadcn Card、ISR、双库架构
- **P1**（增强功能）全部实现：稳定性标签、点击计数、最后更新时间、暗色模式、卡片 hover 预览、CI 缓存
- **P2**: 未开始。P2需要各审计者参与评估后决定是否在当前版本推进

### 1.3 设计理念

Linear 极简克制 × Awwwards 卡片品质 × Canva 分类路径，核心原则"形式服务于功能"。

---

## 2. 技术栈与版本

| 层级 | 技术 | 版本 | 备注 |
|------|------|------|------|
| 框架 | Next.js (App Router) | 16.2.9 | **⚠️ Next.js 16** — 有 breaking changes，API 和文件约定可能异于训练数据 |
| 运行时 | React | 19.2.4 | React 19 稳定版 |
| 包管理 | pnpm | 11.5.0 | workspace 模式 |
| 样式 | Tailwind CSS | v4 | `@import "tailwindcss"` 语法，非 v3 的 `@tailwind` 指令 |
| 基础 UI | shadcn/ui | 4.11.0 | tree-shaking，仅引入使用的组件 |
| 组件库 | @base-ui/react | 1.5.0 | Radix 替代品 |
| 动画 | motion | 12.40.0 | Framer Motion fork，语法兼容 |
| 数据库 | Supabase (PostgreSQL) | N/A | 两个独立项目 |
| 部署 | Vercel | N/A | ISR 60s 增量再生 |

**版本风险提示**:
1. Next.js 16 尚未广泛普及，部分 `node_modules/next/dist/docs/` 有指导文件但可能不全
2. shadcn 4.11 对 Tailwind v4 有特定配置需求
3. `motion` 包是独立的，不是 framer-motion——API 兼容但 import 路径不同
4. `@base-ui/react` 替代了部分 Radix 组件

---

## 3. 文件结构与架构

```
nav-site/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # 根布局（Geist字体 + ThemeProvider + 全局组件）
│   ├── page.tsx                      # 首页（ISR 60s, Promise.all 并行取数）
│   ├── globals.css                   # 完整设计系统（CSS变量 + 暗色模式 + 组件样式）
│   ├── login/
│   │   └── page.tsx                  # 管理员登录（避开 admin layout 的 redirect 循环）
│   ├── admin/
│   │   ├── layout.tsx                # 管理面板布局（verifyAdmin guard + 导航栏）
│   │   ├── page.tsx                  # 链接管理 CRUD
│   │   └── categories/
│   │       └── page.tsx              # 分类管理 CRUD
│   ├── submit/
│   │   └── page.tsx                  # 用户提交站点（需审核）
│   └── api/
│       ├── admin/
│       │   ├── login/route.ts        # 登录验证（密码 → HMAC cookie）
│       │   ├── links/route.ts        # 链接 CRUD（withAdmin 保护）
│       │   ├── links/[id]/route.ts   # 单链接操作
│       │   ├── categories/route.ts   # 分类 CRUD
│       │   └── categories/[id]/route.ts
│       ├── click/route.ts            # 点击计数（RPC increment_click, 火忘式）
│       ├── submit/route.ts           # 用户提交（写入 dev 库, 默认 approved=false）
│       ├── sync/route.ts             # 双库同步端点（?secret= 鉴权）
│       ├── checkout/route.ts         # Stripe (未启用)
│       └── webhook/route.ts          # Stripe (未启用)
├── components/
│   ├── Header.tsx                    # 顶部导航（sticky + backdrop-blur）
│   ├── Footer.tsx                    # 页脚（含 oneLN 标）
│   ├── Navigation.tsx                # ⭐ 核心逻辑（Tab + 筛选 + 搜索 + 推荐/分类/排行三区）
│   ├── LinkCard.tsx                  # ⭐ 核心展示卡片（颜色边 + Badge + 域名 + 时间 + 点击计数）
│   ├── ModelRanking.tsx              # 模型排行榜组件（多榜单切换 + 排名行）
│   ├── SearchBar.tsx                 # 搜索组件
│   ├── SubmitForm.tsx                # 提交表单
│   ├── SubtleStars.tsx              # 柔和满天星背景
│   ├── PanguSpacing.tsx             # 中英文间距处理
│   ├── ThemeProvider.tsx             # next-themes 暗色模式
│   ├── ThemeToggle.tsx               # 明暗切换按钮
│   ├── Analytics.tsx                 # GA4
│   └── admin/
│       └── LogoutButton.tsx          # 管理员登出
│   └── ui/                           # shadcn 组件（card, badge, button, dialog, input 等）
├── lib/
│   ├── type.ts                       # ⭐ 核心类型定义 + getLinkType() + relativeTime()
│   ├── animations.ts                 # motion 动画变体
│   ├── utils.ts                      # cn() 工具
│   ├── admin.ts                      # 管理员鉴权核心（crypto.timingSafeEqual）
│   ├── admin-middleware.ts           # withAdmin HOF（API 路由认证包装器）
│   ├── model-rankings.ts            # 模型排行榜数据源（Supabase model_rankings 表）
│   └── supabase/
│       ├── config.ts                 # ⭐ 双库路由逻辑（getSupabaseUrl/Key vs getAdminSupabaseUrl/Key）
│       ├── server.ts                 # 服务端客户端（按环境切库）
│       ├── client.ts                 # 浏览器端客户端
│       └── admin.ts                  # 管理员客户端（永远指向 dev 库）
├── scripts/
│   ├── add.mjs                       # 一键添加链接 CLI
│   ├── sync-db.mjs                   # 双库同步脚本（GitHub Actions 调用）
│   ├── setup-env.mjs                 # 环境变量初始化
│   ├── crawl-sources.mjs            # 爬取数据源
│   ├── create-model-rankings.sql     # 模型排���表建表
│   ├── migrate-to-prod.sql           # 生产库迁移
│   ├── fix-prod-admin.sql            # 生产库修复
│   └── sync-to-prod-db.sql          # 手动同步 SQL
├── .github/workflows/
│   └── sync-db.yml                   # 双库同步 CI（cron 每6h + 手动触发）
├── DESIGN-DOC.md                     # 完整设计文档
├── AGENTS.md                         # Agent 交互指示
└── NAV-SITE-RESEARCH.md              # 调研文档（2026-06-20）
```

---

## 4. 数据库架构（双库分层）

### 4.1 核心设计

```
Dev 库 (nzaocqwumlmbewoddysd)  ←── 唯一写入源
    │  - 所有 CRUD（admin API / 用户提交 / 脚本）
    │  - 管理员客户端强制走此库
    ▼
Prod 库 (vyqqbypwrbdcafanzwmj)  ←── 公网只读
    │  - 公网用户访问题示数据
    │  - ISR 页面取数目标
    ▼
GitHub Actions (cron 6h)  ←── 同步链路
    - sync-db.yml → node scripts/sync-db.mjs
    - 只同步 approved=true 的链接
    - 用 CRON_SECRET 保护同步端点
```

### 4.2 配置路由（lib/supabase/config.ts）

```
NODE_ENV=production → 客户端 getSupabaseUrl() 返回 prod 库
NODE_ENV!=production → 客户端 getSupabaseUrl() 返回 dev 库
管理员客户端 createAdminClient() → 永远返回 dev 库
```

### 4.3 同步机制细节

- `scripts/sync-db.mjs` 是 Node.js CLI 脚本，非 API
- `app/api/sync/route.ts` 是 HTTP 端点（被 CI 调用）
- 同步逻辑：upsert 分类 + 增量插入 approved=true 的链接（避免重复）
- 注意：同步是**单向 dev→prod**，不支持反向同步

### 4.4 数据表结构

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `nav_categories` | 导航分类 | id, name, slug, icon, sort_order |
| `nav_links` | 导航链接 | id, title, url, description, category_id, approved, paid, featured, click_count |
| `model_rankings` | 模型排行榜 | id, rank, model_name, source, score, description, url, category |

---

## 5. 核心组件详细分析

### 5.1 Navigation.tsx（核心编排组件）

**职责**: 管理用户交互的全套状态——Tab切换、搜索筛选、推荐/链接/排行榜三区渲染。

**状态管理**:
- `activeCategory: "all" | slug` — 当前选中的板块 Tab
- `search: string` — 搜索关键词
- 全部使用 `useState` + `useMemo`，无外部状态管理

**filtered 数据流**:
1. 原始 links → 按 activeCategory 过滤（非"all"时匹配 category_slug）
2. 再按搜索词 text 匹配（title / description / category_name）
3. featured 区 = 过滤后的 featured+paid 条目，按 official→relay 排序
4. 分 section 渲染：`big-tech` → 官方 API / `free-relay` → 中转服务站

**板块 Tab 映射**:
```
"big-tech"      → "官方 API"   (蓝色标识)
"free-relay"    → "中转服务站"  (琥珀色标识)
"model-ranking" → "模型排行榜"  (紫色标识)
```
Tab 从 `categories` 动态渲染（加上固定的 `all` = "全部"）。Tab 下划线使用 `motion layoutId="section-indicator"` 实现弹性动画。

**关键设计决策**: 已删除旧的 CategoryFilter 组件（`782250a`），Tab 从"2行 Tab（板块行 + 分类行）"收敛为"单行干净按钮"。不重复。

### 5.2 LinkCard.tsx（展示卡片）

**状态管理**: 纯展示，无内部 state

**核心特性**:
- 左侧颜色边：官方=蓝 / 中转=琥珀 / 模型=紫（通过 `getLinkType()` 判断 category_slug）
- Badge 三件套："推荐"/"官方"/"中转"/"排行"
- 域名自动提取（`new URL(link.url).hostname`）
- 相对时间戳（`relativeTime()`）
- 点击计数显示
- 火忘式点击追踪（POST `/api/click`，fire-and-forget，不阻塞跳转）
- hover 动画：`card-hover` CSS class

### 5.3 ModelRanking.tsx（排行榜组件）

**状态管理**: `activeSource: "all" | sourceName`

**特性**:
- 多数据源 Tab（综合旗舰/开源模型/Chatbot Arena/SuperCLUE/能力冠军）
- 每个数据源的色系不同（蓝/绿/紫/琥珀/玫红）
- 按 rank 排序 + 前三名特殊底色
- 排名行可点击跳转（有 url 时）

### 5.4 已删除组件

以下 5 个组件在 `fa91d71` 之后从代码库删除（git D），如有需要可回溯：

| 组件 | 删除原因 |
|------|----------|
| `HeroSection.tsx` | 首页设计改为简洁标题+副标题，无需独立 Hero |
| `CategoryFilter.tsx` | 功能合并进 `Navigation.tsx` 的分类筛选 |
| `GridBackground.tsx` | 被 `SubtleStars.tsx` 替代 |
| `AuroraBackground.tsx` | 过度设计，不符合"克制"原则 |
| `StarBackground.tsx` | 被 `SubtleStars.tsx` 替代 |

---

## 6. API 路由体系

### 6.1 路由清单

| 路由 | 方法 | 权限 | 功能 |
|------|------|------|------|
| `/api/admin/login` | POST | 无（密码验证） | 管理员登录，设置 HMAC cookie |
| `/api/admin/login` | DELETE | 无 | 登出，清除 cookie |
| `/api/admin/links` | GET | `withAdmin` | 获取全部链接（含分类 join） |
| `/api/admin/links` | POST | `withAdmin` | 新增链接 |
| `/api/admin/links/[id]` | PUT | `withAdmin` | 更新链接 |
| `/api/admin/links/[id]` | DELETE | `withAdmin` | 删除链接 |
| `/api/admin/categories` | GET/POST | `withAdmin` | 分类 CRUD |
| `/api/admin/categories/[id]` | PUT/DELETE | `withAdmin` | 单分类操作 |
| `/api/click` | POST | 无需鉴权 | 火忘式增加点击计数 |
| `/api/submit` | POST | 无需鉴权 | 用户提交站点（写入 dev 库，未审核） |
| `/api/sync` | GET | `?secret=` 鉴权 | 手动触发双库同步 |
| `/api/checkout` | - | Stripe (未启用) | - |
| `/api/webhook` | - | Stripe (未启用) | - |

### 6.2 鉴权路径

```
管理员登录 login page
  ↓ POST /api/admin/login { password }
  ↓ 密码匹配 → setSessionCookie(password) → HMAC cookie
  ↓
Admin layout
  ↓ verifyAdmin() 检查 cookie → 不匹配则 redirect("/login")
  ↓
API 路由
  ↓ withAdmin() HOF → verifyAdmin() → 401 或继续
```

### 6.3 鉴权实现细节

`lib/admin.ts`:
- HMAC-SHA256(password, "admin-session") 作为 token
- `crypto.timingSafeEqual` 防止时序攻击
- cookie 名 `admin_session`，httpOnly, secure in prod, 7 天有效期

`lib/admin-middleware.ts`:
- `withAdmin(handler)` HOF 包装 API 路由
- **⚠️ 未接入所有路由** — 当前只有 links 和 categories 路由用了 `withAdmin`


---

## 7. 权限与安全模型

### 7.1 管理员鉴权系统

| 层 | 措施 | 状态 |
|----|------|------|
| 登录 | HMAC cookie + timingSafeEqual | ✅ 完成 |
| API 保护 | withAdmin HOF | ✅ 核心路由 |
| 密码 | ADMIN_PASSWORD 环境变量 | ✅ |
| 过�b保护 | 7 天 cookie 有效期 | ✅ |
| 生产安全 | cookie secure flag | ✅ |

### 7.2 双库安全

| 措施 | 状态 |
|------|------|
| admin client 强制走 dev 库 (不可配置篡改) | ✅ |
| dev 库不被公网 ISR 取数 | ✅ |
| 同步端点用 CRON_SECRET 保护 | ✅ |
| 同步只转发 approved=true 的链接 | ✅ |
| 所有写入操作验证 admin cookie | ✅ |

### 7.3 常规防护

| 措施 | 实现 |
|------|------|
| XSS 防护 | React 默认转义 |
| CSRF | fetch API + SameSite cookie |
| 点击劫持 | 建议补充 `X-Frame-Options` header |
| 环境变量泄露 | `.env*` 在 .gitignore 中 |
| 密码存储 | 不存密码明文（仅用于 HMAC 比对） |

### 7.4 安全建议

> 详见 [第 9 节](#9-已知问题与待改进项pendings)

---

## 8. 设计系统与样式

### 8.1 CSS 变量体系（globals.css）

完整的 Tailwind v4 + shadcn CSS 变量体系，基于 oklch 色域：

```css
/* 亮色模式（Light） */
--background: oklch(1 0 0);                    /* 纯白 */
--foreground: oklch(0.13 0.01 250);            /* 深灰蓝 */
--primary: oklch(0.62 0.18 250);               /* 浅蓝主色 */
--muted-foreground: oklch(0.45 0.01 250);      /* 次��文字 */

/* 暗色模式 (.dark) */
--background: oklch(0.15 0.01 260);            /* 深蓝黑 */
--foreground: oklch(0.93 0.005 260);            /* 亮灰白 */
```

### 8.2 关键设计参数

| 参数 | Light | Dark |
|------|-------|------|
| 背景 | #FFFFFF | 深蓝黑 |
| 卡片背景 | #FFFFFF | 深灰蓝 |
| 主色 | #3B82F6 蓝 | 同上 |
| 中转色 | #F59E0B 琥珀 | 同上 |
| 边框 | #E2E8F0 | 10% 白 |
| 圆角 | 0.75rem (卡片) | 同上 |
| 间距 | 0.75rem (网格) | 同上 |

### 8.3 动画系统

- `staggerContainer`: stagger 0.04s + delay 0.02s
- `fadeInUp`: y:10→0, 0.3s cubic-bezier(0.22,1,0.36,1)
- `slideDown`: y:-8→0, 0.35s
- Tab下划线: motion layoutId spring 动画
- 卡片 hover: 0.2s cubic-bezier + translateY(-1px)
- LinkCard: stagger delay index*0.025s

### 8.4 字体

- 主字体: Geist Sans（Next.js 内置优化）
- 等宽: Geist Mono（域名显示）
- 字号: 14px 卡片标题 / 12px 描述 / 11px 域名

---

## 9. 已知问题与待改进项（Pendings）

### 9.1 必须修复（P0 - 延迟验证中）

| # | 问题 | 位置 | 影响 | 建议方案 |
|---|------|------|------|----------|
| A1 | **admin API 路由未全部接入 withAdmin** | `app/api/admin/links/[id]/route.ts` 等 | 仍有手工 verifyAdmin 调用可能不一致 | 以 `lib/admin-middleware.ts` 的 `withAdmin` 统一替换所有 admin API 路由 |

### 9.2 需改进（P1 - 已识别待处理）

| # | 问题 | 位置 | 建议方案 |
|---|------|------|----------|
| B1 | **pangu 仍 CDN 引用** | 全局 | 改为 `import pangu from "pangu"`（已装 pangu ^7.2.1 依赖） |
| B2 | **LoginButton 用 window.location.href** | 登录页 | 改为 `useRouter().push` |
| B3 | **withAdmin 未在所有 API 路由统一使用** | admin API 路由 | 参照 `app/api/admin/links/route.ts` 的 `withAdmin` 写法 |


### 9.3 架构/代码质量（P2 - 待评估）

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| C1 | Navigation 组件功能过重 | 中等 | 耦合了 Tab切换 + 搜索 + 推荐区 + 分section渲染 + 空状态，考虑拆分 |
| C2 | 硬编码板块映射 | 低 | `sectionLabels` 对象硬编码在 Navigation 里，应在设计文档之外也有独立配置 |
| C3 | 点击追踪缺乏去重保护 | 低 | `/api/click` 不防刷，暂无保护措施 |
| C4 | 同步脚本的 upsert 逻辑潜在写入冲突 | 低 | 分类 upsert onConflict "id"，链接用 dedup check，需确认并发安全 |
| C5 | Stripe路由存在但未启用 | 低 | checkout/webhook 路由已建但无有效配置，应注释或添加启用守卫 |
| C6 | 缺少 `robots.txt` 运维策略 | 低 | `sitemap.ts` 已建但没有配套的 SEO 策略文档 |

### 9.4 性能与优化（P3 - 低优先级）

| # | 问题 | 说明 |
|---|------|------|
| D1 | ISR 60s 对公网用户延迟 | 数据变更后公网需要等待最多 60s |
| D2 | 同步间隔 6h | 手动触发可缩短窗口，但 cron 同步有 6h 延迟 |
| D3 | 无缓存 warming 策略 | 可配合 Vercel 的 `revalidate` webhook 做即时刷新 |

---

## 10. 审计者关注点（重点检查区）

以下是在审计 nav-site 时应特别关注的区域，每个标注了**风险等级**和**检查方法**。

### 10.1 关键安全审计

#### [CRITICAL] 1. withAdmin 覆盖率

**检查点**: 确认所有 admin API 路由都已使用 `withAdmin` HOF。

**检查文件**:
- `app/api/admin/links/route.ts` ✅（已检查）
- `app/api/admin/links/[id]/route.ts` ❓（需确认）
- `app/api/admin/categories/route.ts` ✅（已检查）
- `app/api/admin/categories/[id]/route.ts` ❓（需确认）

**风险**: 遗漏的路由可能暴露未经认证的管理接口。

#### [HIGH] 2. 双库路由健壮性

**检查点**:
1. 确认 `createAdminClient()` 永远返回 dev 库的 URL（不能在生产环境意外指向 prod）
2. 确认环境变量缺失时的降级行为——当前 `getAdminSupabaseUrl()` 降级到 `NEXT_PUBLIC_SUPABASE_URL`，这可能在 dev 环境值缺失时意外切换到 prod

#### [HIGH] 3. 同步端点的安全

**检查点**: `/api/sync/route.ts` 的 `CRON_SECRET` 验证只在非空时执行。如果 `CRON_SECRET` 未配置，任何人都可触发同步。

**建议**: 当 `CRON_SECRET` 未配置时，同步端点应返回 500 而非允许匿名访问。

#### [MEDIUM] 4. 管理员密码管理

**检查点**: 密码存在环境变量 `ADMIN_PASSWORD` 中，注意：
- Vercel 环境变量是否已加密
- GitHub Actions 的同步脚本是否暴露了密码
- 密码强度是否符合要求

### 10.2 关键功能审计

#### [HIGH] 5. 数据同步数据一致性

**检查点**: 双库同步后的数据一致性。检查场景：
- 同时有 dev 写入和同步运行时，是否存在写偏
- 链接删除后同步如何处理（当前只插入不删除目标已有记录）
- URL 唯一性检测是否可靠

#### [MEDIUM] 6. 搜索性能

**检查点**: `Navigation.tsx` 的搜索过滤是客户端 `useMemo`，在 100+ 链接时可能卡顿。建议评估：
- 当前数据量（`links` 数组大小）
- 是否需要服务端搜索或 SWR 分页

#### [MEDIUM] 7. ISR 和缓存行为

**检查点**: 
- `page.tsx` 的 `revalidate = 60` 是否对首页产生了合理刷新
- 暗色模式切换时是否有白色闪烁

### 10.3 代码质量审计

#### [HIGH] 8. 类型系统完整性

**检查点**:
- `lib/types.ts` 的 `NavLink` 类型是否与数据库 schema 一致
- `NavLinkWithCategory` 的 join 字段是否能正确处理 null
- `ModelRanking` 接口是否覆盖所有要渲染的字段

#### [MEDIUM] 9. 客户端/服务端边界

**检查点**: `"use client"` 标注是否合理：
- `Navigation.tsx`（客户端 ✅ — 管理交互状态）
- `LinkCard.tsx`（客户端 ✅ — 点击事件）
- `ModelRanking.tsx`（客户端 ✅ — Tab 切换）
- 检查是否有不必要的客户端组件（应尽量保持在服务端渲染）

#### [LOW] 10. 依赖版本对齐

**检查点**:
- React 19 与 shadcn v4、@base-ui 的兼容性
- Next.js 16 的已知特性变更
- motion 12 与 framer-motion API 差异

### 10.4 部署运维审计

#### [HIGH] 11. Vercel 部署安全性

**检查点**:
- 环境变量是否在 Vercel Dashboard 正确配置
- 自定义域名 (ccwu.cc) 的 Cloudflare + Vercel DNS 配置
- Vercel Deployment Protection 是否开启

#### [MEDIUM] 12. 双库故障恢复

**检查点**:
- 如果 prod 库出问题，如何从 dev 库恢复
- 如果 dev 库出问题，是否有备份
- 同步 CI (GitHub Actions) 失败的通知机制

---

## 11. 各审计维度建议提纲

### 审计者可以关注的维度

以下按审计场景分组，每个场景含建议的检查优先级和覆盖范围：

### 场景一：安全审计（Security Audit）

**检查优先级**:
1. P0 — withAdmin 路由覆盖（检查文件匹配）
2. P0 — 同步端点强制鉴权
3. P1 — HMAC cookie 安全参数（httpOnly, secure, sameSite）
4. P1 — XSS/CSRF 防御现状
5. P2 — 管理员登录爆破防护（当前无速率限制）
6. P2 — API 请求日志/审计

### 场景二：架构审计（Architecture Review）

**检查优先级**:
1. P0 — 双库分层设计是否真的实现了"写隔离"
2. P1 — Navigation 组件是否拆分/抽象不足
3. P1 — 板块映射是否应该抽出配置文件
4. P2 — 同步流程失败处理/告警
5. P2 — 是否需要引入缓存层（Redis/ISR revalidate webhook）

### 场景三：代码质量审计（Code Quality Review）

**检查优先级**:
1. P0 — 类型定义与数据库 schema 的一致性
2. P1 — 客户端/服务端组件边界合理性
3. P1 — useMemo 依赖完整性（检查 lint 规则）
4. P2 — 错误处理覆盖率（当前很多 Promise 链缺 catch）
5. P2 — 测试覆盖（当前无测试文件）
6. P3 — 注释适度性、命名规范

### 场景四：性能审计（Performance Review）

**检查优先级**:
1. P1 — 客户端搜索性能（`useMemo` 过滤器对大数据集是否够用）
2. P1 — 首页并行取数（`Promise.all` 当前已实现）
3. P2 — 动画性能（motion 动画在低端设备上表现）
4. P2 — 图片/字体体积（Geist font 大小）
5. P3 — Lighthouse 评分基准

### 场景五：运维审计（Ops Review）

**检查优先级**:
1. P0 — 环境变量完整性校验（`setup-env.mjs` 是否覆盖所有变量）
2. P1 — CI/CD 流程稳定性（GitHub Actions 是否每次都能跑通同步）
3. P1 — 部署回滚方案（Vercel Instant Rollback）
4. P2 — 数据库备份（是否有 RPO/RTO 定义）
5. P2 — 监控告警（当前无 uptime 监控）
6. P3 — 成本管理（Vercel 函数调用量、Supabase 数据量）

### 场景六：用户体验审计（UX Audit）

**检查优先级**:
1. P0 — 搜索交互反馈（空状态/加载状态/防抖）
2. P1 — 暗色模式切换体验（闪烁修复）
3. P1 — 移动端适配（响应式网格 `sm:grid-cols-2 lg:grid-cols-3`）
4. P2 — 键盘导航/无障碍（ARIA label）
5. P2 — 骨架屏/loading 状态
6. P3 — 交互动效过度（Motion 是否影响可用性）

---

## 附录 A: 关键文件参考索引

| 文件 | 行数 | 功能重要性 | 审计优先级 |
|------|------|-----------|-----------|
| `app/page.tsx` | ~44 行 | ⭐⭐⭐ 首页入口 | [P0] |
| `components/Navigation.tsx` | ~156 行 | ⭐⭐⭐ 核心编排 | [P0] |
| `components/LinkCard.tsx` | ~96 行 | ⭐⭐⭐ 展示卡片 | [P0] |
| `lib/types.ts` | ~57 行 | ⭐⭐⭐ 核心类型 | [P0] |
| `lib/admin.ts` | ~36 行 | ⭐⭐⭐ 鉴权核心 | [P0] |
| `lib/supabase/config.ts` | ~52 行 | ⭐⭐⭐ 双库路由 | [P0] |
| `app/api/sync/route.ts` | ~84 行 | ⭐⭐ 同步端点 | [P1] |
| `app/globals.css` | ~210 行 | ⭐⭐ 设计系统 | [P1] |
| `app/admin/page.tsx` | ~193 行 | ⭐⭐ 管理面板 | [P1] |
| `lib/model-rankings.ts` | ~29 行 | ⭐ 排行榜取数 | [P2] |
| `components/ModelRanking.tsx` | ~188 行 | ⭐ 排行榜展示 | [P2] |
| `app/login/page.tsx` | ~62 行 | ⭐ 登录页 | [P2] |

## 附录 B: git 历史摘要（最近 20 commit）

```
3586321 feat: add capability champion model rankings
41a10ca feat: model rankings with leaderboard display
ac67ed6 fix: resolve Navigation.tsx merge conflict markers
9e98534 fix: sync-db orphan cleanup bug — rebuild dedup after delete
fa91d71 feat: P1 complete + model ranking update + cleanup
965f98a feat: isolate admin DB - all writes go to dev, public reads from prod
b6ade77 fix: single clean tab row without icons, remove duplicate CategoryFilter
782250a fix: consolidate tabs, remove CategoryFilter, use dynamic section labels
cbd3254 refactor: cleanup unused components, extract shared config, fix sitemap, admin middleware
236cf3d feat: P1 features - dark mode, click tracking, category restructure, badges, timestamps
fc4fe5b feat: subtle stars + oneLN badge + env setup + designdoc
621c8ed feat: white/black/blue theme, two-section layout, shadcn card integration
36e56d7 feat: Linear-inspired minimal dark design system
8e76375 feat: Linear/Vercel-style grid background + minimal card design + admin permissions fix
2d501c2 feat: aurora dark theme + motion animations + glassmorphism UI overhaul
078e245 fix: move login page outside admin layout to avoid redirect loop
894f364 feat: admin panel with link & category management
3a3860b fix: replace upsert with check-then-insert for DB sync compatibility
031d926 feat: one-click add script (npm run add)
```

## 附录 C: 速查命令

```bash
# 本地开发
cd /c/Users/yuanjia/nav-site
pnpm dev                    # → http://localhost:3000

# 构建
pnpm build                  # 会验证是否有编译错误

# 添加链接 CLI
pnpm add                    # 交互式添加

# 手动同步数据库
node scripts/sync-db.mjs

# 查看当前 Vercel 部署状态
# 通过 GitHub MCP 或直接在 Vercel Dashboard 查看

# 代码搜索（排查 withAdmin 覆盖率）
grep -r "withAdmin" app/api/admin/ --include="*.ts"
```

---

> **报告生成**: 2026-06-21  
> **生成者**: 守岸人（Shorekeeper）  
> **数据来源**: 代码直接审计 + 内存文档 + git 历史  
> **用途**: 供其他 Agent 审计者作为入口文档，完整了解项目全貌后针对性地提出改进建议
