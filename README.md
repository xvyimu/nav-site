# 综合导航站 (nav-site)

精选收录 AI 大模型、云服务、开发工具、设计资源、开源项目等 500+ 优质站点的导航平台。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router + **webpack** 构建) | 16.2.9 |
| UI | React + Tailwind CSS v4 + shadcn/ui | 19.2.4 |
| 数据库 | Supabase (PostgreSQL + RLS) | 单库模式 |
| 认证 | next-auth v5 (Credentials + GitHub OAuth) | 5.0.0-beta.31 |
| 搜索 | Fuse.js 服务端模糊搜索 + pgvector 语义搜索 | — |
| 嵌入服务 | BAAI/bge-small-zh-v1.5 (512 维) | FastAPI + uvicorn |
| 动画 | Motion (Framer Motion) | — |
| 监控 | Sentry (client/server/edge) | — |
| 测试 | Vitest (单元) + Playwright (E2E) | — |
| 部署 | Netlify | — |

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local 填入 Supabase URL/KEY、AUTH_SECRET、ADMIN_PASSWORD 等

# 开发模式（端口 3264，webpack 模式）
pnpm dev

# 生产构建（webpack 模式，必须保留 --webpack 标志）
pnpm build

# 启动生产服务器
pnpm start
```

> ⚠️ `next build/dev` 必须保留 `--webpack` 标志（已在 `package.json` scripts 中配置）：`node_modules` 中存在 NTFS reparse point 损坏目录，Turbopack 无法遍历。Vitest 也已配置 `resolve.preserveSymlinks: true`。

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | 是 |
| `NEXT_PUBLIC_SITE_URL` | 站点 URL（用于 SEO） | 是 |
| `AUTH_SECRET` | Auth.js 加密密钥 | 是 |
| `ADMIN_PASSWORD` | 管理员密码 | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key（服务端绕过 RLS） | 是 |
| `SUPABASE_SERVICE_ROLE_KEY_PROD` | 生产库 service role key（优先于 `SUPABASE_SERVICE_ROLE_KEY`） | 否 |
| `EMBED_SERVER_URL` | 本地 embedding 服务地址（默认 `http://127.0.0.1:8003`） | 否 |
| `NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY` | Resource Library Edge Function public API key | 否 |
| `RESOURCE_LIBRARY_SERVICE_ROLE_KEY` | Resource Library service role key（仅服务端使用） | 否 |
| `GITHUB_ID` | GitHub OAuth App ID（用户登录） | 否 |
| `GITHUB_SECRET` | GitHub OAuth App Secret | 否 |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN | 否 |
| `CRON_SECRET` | 定时任务密钥 | 否 |

## 测试

```bash
# 单元测试
pnpm test

# 单元测试 + 覆盖率
pnpm test:coverage

# E2E 测试（需先启动 dev server）
pnpm e2e

# E2E 交互式 UI 模式
pnpm e2e:ui

# Search quality golden tests
# Requires a running site with stable seed data. Defaults are skipped in pnpm test.
QUALITY_TEST_BASE_URL=http://localhost:3264 pnpm test:quality
```

## 代码质量

```bash
# ESLint
pnpm lint

# TypeScript 类型检查
pnpm typecheck

# Bundle 分析
pnpm analyze
```

本地提交前可安装轻量密钥扫描 hook：

```bash
printf '#!/bin/sh\nnode scripts/pre-commit-secret-scan.mjs\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## 项目结构

```
nav-site/
├── app/                        # Next.js App Router
│   ├── api/                    # API 路由
│   │   ├── admin/              # 管理员 CRUD API
│   │   ├── auth/[...nextauth]/  # Auth.js 路由
│   │   ├── click/              # 点击计数
│   │   ├── favorites/          # 用户收藏同步
│   │   ├── favicon/            # Favicon 代理
│   │   ├── health/             # 健康检查
│   │   ├── reviews/            # 工具评价
│   │   ├── search/             # 服务端搜索 API
│   │   ├── submit/             # 站点提交
│   │   └── tools/              # Agent API
│   ├── admin/                  # 管理后台
│   ├── api-docs/               # API 文档页面
│   ├── favorites/              # 收藏页面
│   ├── login/                  # 登录页面
│   ├── tool/[slug]/            # 程序化 SEO 工具详情页
│   ├── submit/                 # 提交页面
│   ├── about/                  # 关于页面
│   ├── error.tsx               # 错误边界
│   ├── global-error.tsx        # 全局错误边界
│   ├── loading.tsx             # 路由级加载骨架
│   ├── not-found.tsx           # 自定义 404
│   ├── opengraph-image.tsx     # 动态 OG 图片
│   ├── sitemap.ts              # 站点地图
│   ├── robots.ts               # 爬虫规则
│   └── manifest.ts             # PWA manifest
├── components/                 # React 组件
│   ├── admin/                  # 管理后台组件
│   ├── ui/                     # UI 基础组件
│   ├── Header.tsx              # 顶栏（含登录/退出）
│   ├── Navigation.tsx          # 主导航
│   ├── Sidebar.tsx             # 侧边栏分类
│   ├── LinkCard.tsx            # 链接卡片
│   ├── SearchBar.tsx           # 搜索框
│   ├── ModelRanking.tsx        # 模型排行榜
│   ├── FavoritesProvider.tsx   # 收藏上下文
│   ├── Providers.tsx           # SessionProvider 包装
│   ├── Shell.tsx               # 布局壳
│   └── ...
├── lib/                        # 工具库
│   ├── supabase/               # Supabase 客户端
│   ├── auth.ts                 # Auth.js 配置
│   ├── repositories.ts         # 数据访问层
│   ├── use-favorites.ts        # 收藏 Hook
│   ├── useLinksFilter.ts       # 搜索/过滤 Hook
│   ├── model-rankings.ts       # 模型排行榜数据
│   ├── slugify.ts              # URL slug 生成
│   ├── rate-limit.ts           # 速率限制
│   ├── logger.ts               # 结构化日志
│   └── ...
├── scripts/                    # 运维脚本
│   ├── bulk-add.mjs            # 批量导入站点（JSON/TXT）
│   ├── bulk-sites.json         # 批量录入数据源（356 条）
│   ├── check-links.mjs         # 链接健康检测
│   ├── dedupe-figma-api.mjs    # Figma 去重脚本（admin API）
│   ├── setup-env.mjs           # 环境配置初始化
│   ├── seed-data.json          # 种子数据（示例）
│   ├── migration-complete.sql  # slug + favorites + RLS 完整迁移
│   ├── migration-slug.sql      # slug 列迁移
│   ├── migration-user-favorites.sql  # 收藏表迁移
│   ├── migration-reviews.sql   # 评价系统迁移
│   ├── migration-pgvector.sql  # 语义搜索迁移（可选）
│   └── rls-audit.sql           # RLS 审计
├── tests/                      # 单元测试
├── e2e/                        # E2E 测试
├── docs/                       # 文档
│   ├── PROGRESS.md             # 项目进度
│   ├── adr-001-dual-db-merge.md
│   └── adr-002-authjs-migration.md
├── proxy.ts                    # Auth.js middleware
├── next.config.ts              # Next.js 配置
├── eslint.config.mjs           # ESLint 配置
└── package.json
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tools` | GET | Agent API，支持分类过滤、搜索、限制 |
| `/api/search` | GET | 服务端 Fuse.js 模糊搜索 + pgvector 语义搜索 |
| `/api/click` | POST | 点击计数（sendBeacon） |
| `/api/favorites` | GET/POST/DELETE | 用户收藏同步（需登录） |
| `/api/reviews` | GET/POST | 工具评价 |
| `/api/submit` | POST | 站点提交 |
| `/api/favicon` | GET | Favicon 代理（Content-Type 白名单） |
| `/api/health` | GET | 健康检查 |
| `/api/admin/*` | GET/POST/PUT/DELETE | 管理员 CRUD（需 admin 角色） |

API 文档详见 `/api-docs` 页面。

## CI/CD 流水线

```
push/PR → quality (lint + tsc + test+coverage)
                ↓
          build (next build)
                ↓
           e2e (Playwright)
                ↓
         deploy (Netlify)  [仅 master push]
```

## 架构决策

### ADR-001: 双库合并（已执行）

项目原采用双库架构（开发库写入 + 生产库只读 + 6 小时同步），已于 2026-06-23 合并为单库模式。详见 `docs/adr-001-dual-db-merge.md`。

### ADR-002: Auth.js 迁移（已执行）

从 `@auth/core` canary 迁移到 `next-auth` v5 beta，降低供应链风险。详见 `docs/adr-002-authjs-migration.md`。

### 数据访问层

所有数据库操作通过 `lib/repositories.ts` 统一抽象，避免 API 路由直接调用 Supabase 客户端。

### 程序化 SEO

每个收录的工具自动生成 `/tool/[slug]` 详情页，包含 JSON-LD `SoftwareApplication` 结构化数据，便于搜索引擎和 AI 引擎理解。

### 服务端搜索

搜索请求通过 `/api/search` API 在服务端执行。默认使用 Fuse.js 模糊搜索；传入 `semantic=true` 时调用本地 embedding 服务生成 512 维向量，再通过 Supabase pgvector RPC 检索，服务不可用时自动回退到 Fuse.js。200ms 防抖，支持分类过滤。

**搜索质量优化（Phase 22）：**
- **BGE query prefix** — 查询向量加中文前缀 `"为这个句子生成表示以用于检索相关文章："`，文档向量不加（BGE 官方要求）
- **增强 embedding 文本** — 回填文本格式 `"title description [分类名]"`，提升语义区分度
- **短查询保护** — `<3` 字符跳过语义搜索，回退 Fuse.js
- **RRF 混合排序** — K=60 互惠排名融合，融合 Fuse.js + pgvector 双源结果
- **业务信号加权** — featured/paid +0.05 similarity boost，click_count>5 +0.02
- **金标准评估框架** — 6 条金标准查询 × recall@10，`QUALITY_TEST_BASE_URL` 集成测试

`/api/search` emits low-sensitivity structured logs with request id, query length, query hash, mode, result count, duration, and fallback reason. Raw query text is intentionally not logged.

### 用户收藏同步

未登录用户收藏存储在 localStorage；登录后自动合并到服务端 `user_favorites` 表，跨设备同步。

## 数据库迁移

在 Supabase SQL Editor 中按顺序执行：

```sql
-- 1. RLS 策略审计
-- 运行 scripts/rls-audit.sql

-- 2. 用户评价系统
-- 验证状态：pnpm db:reviews:verify
-- 执行迁移：设置 DATABASE_URL 后运行 pnpm db:reviews:apply
-- 或在 Supabase SQL Editor 中运行 scripts/migration-reviews.sql

-- 3. slug 列迁移（SEO 友好 URL）
-- 运行 scripts/migration-slug.sql

-- 4. 用户收藏表
-- 运行 scripts/migration-user-favorites.sql

-- 5. pgvector 语义搜索（已执行）
-- 先在 Supabase Dashboard 启用 vector 扩展
-- 然后运行 scripts/migration-pgvector.sql
-- 本地 embedding 服务：python scripts/embed-server.py
```

## 内容管理

```bash
# 批量导入站点（JSON/TXT）
pnpm bulk:add scripts/bulk-sites.json
pnpm bulk:add scripts/bulk-sites.json --dry-run    # 预览模式

# 检查链接健康状态
pnpm check:links
```

## License

MIT
