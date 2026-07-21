# ChronoPortal

**GitHub：** [xvyimu/ChronoPortal](https://github.com/xvyimu/ChronoPortal)  
**产品显示名：** 综合导航站 / 公益 API 导航  
**本地路径 / package 名：** `D:\nav-site`（与 `D:\ChronoPortal` 同仓）· npm `"name": "nav-site"`（private，**不是** GitHub 身份）  
**线上：** https://yuanjia1314.ccwu.cc  
**许可：** [MIT](./LICENSE) · Copyright (c) 2026 xvyimu  

> 仓库由 `xvyimu/nav-site` **改名**为 `xvyimu/ChronoPortal`（2026-07-21）。  
> 产品品牌与本地目录可仍称「导航站 / nav-site」；**GitHub、克隆 URL、文档外链一律用 ChronoPortal**。  
> 身份卡：[GITHUB_IDENTITY.md](./GITHUB_IDENTITY.md)

## 它是什么

精选收录 AI 模型、云服务、开发工具、设计与开源资源的 **导航门户**：

- 分类浏览 · Fuse 模糊搜索 · pgvector 语义搜索  
- 管理后台（链接 CRUD + 写后 ISR revalidate）  
- 资源库入库 · 死链检查 · 图标回填  
- Auth.js（Credentials + GitHub OAuth）· Upstash 分布式限流  

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 App Router（**webpack** 构建，scripts 已带 `--webpack`） |
| UI | React 19 · Tailwind CSS v4 · shadcn/ui |
| 数据 | Supabase PostgreSQL + RLS |
| 认证 | Auth.js v5 |
| 搜索 | Fuse.js + pgvector；嵌入默认 Cloudflare Workers AI `bge-m3` @1024 |
| 限流 | Upstash Redis（`DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED`） |
| 测试 | Vitest · Playwright |
| 部署 | Vercel（生产单轨） |

## 目录

```text
.
├─ app/                     # App Router 页面与 Route Handlers
├─ components/              # UI
├─ lib/                     # 数据 / 搜索 / 鉴权 / repositories
├─ hooks/ · types/
├─ scripts/                 # probe / bulk-add / check-links / 入库
├─ tests/ · e2e/
├─ workers/                 # 边缘相关
├─ docs/                    # 交接 · 研究 · ADR
├─ public/                  # 静态资源 · build-info 模板
├─ package.json             # private · repository → ChronoPortal
├─ LICENSE                  # MIT
└─ AGENTS.md · CLAUDE.md    # AI 协作
```

## 快速开始

```bash
pnpm install
cp .env.local.example .env.local   # Supabase / AUTH_SECRET / ADMIN_PASSWORD_HASH / 嵌入端点等
pnpm dev                           # :3264 · 必须保留 --webpack
pnpm test
pnpm typecheck                     # 可能有预存测试类型债，见 handoff
pnpm build
```

生产验收：

```bash
node scripts/probe-production.mjs
# 核对线上 /build-info.json 的 commit 与 origin/master HEAD
```

环境变量详见 `.env.local.example`（Supabase、AUTH、Admin hash、CF embedding、Upstash、Sentry 等）。

## 架构不变式（摘要）

1. 单 Next 部署，不拆微服务  
2. RSC 直连 repository，不经自身 HTTP  
3. Admin：UI → `lib/admin/client` → Route Handler → repository  
4. 搜索：薄 route + `executeSearch` + SearchAdapters  
5. 生产密码只认 `ADMIN_PASSWORD_HASH`；embed 默认 CF 1024-d  

## CI / 部署

- 远程：`origin` → `https://github.com/xvyimu/ChronoPortal.git`  
- Issues：https://github.com/xvyimu/ChronoPortal/issues  
- 部署以本机约定为准（Vercel scope / 项目名见 handoff）  

## 文档

- `docs/` — 交接与运行说明  
- `AGENTS.md` / `CLAUDE.md` — Agent 约定  

## 许可证

[MIT License](./LICENSE) · Copyright © 2026 xvyimu  
