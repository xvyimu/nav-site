# ChronoPortal

**GitHub：** [xvyimu/ChronoPortal](https://github.com/xvyimu/ChronoPortal)  
**产品 / 目录惯称：** 综合导航站 · `nav-site`  
**线上：** https://nav-site-chi.vercel.app  
**许可：** [MIT](./LICENSE) · Copyright (c) 2026 xvyimu  

> 仓库由 `nav-site` **改名**为 ChronoPortal。本地路径可仍为 `D:\nav-site`。

## 它是什么

精选收录 AI 模型、云服务、开发工具、设计与开源资源的 **导航门户**：搜索、语义召回、管理后台、资源入库。

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 App Router（**webpack** 构建） |
| UI | React 19 · Tailwind CSS v4 · shadcn/ui |
| 数据 | Supabase PostgreSQL + RLS |
| 认证 | Auth.js v5（Credentials + GitHub OAuth） |
| 搜索 | Fuse.js + pgvector；嵌入默认 Cloudflare Workers AI `bge-m3` @1024 |
| 部署 | Vercel |

## 目录（摘要）

```text
src/app              App Router 页面与 API
src/components       UI
src/lib              数据 / 搜索 / 鉴权
scripts/             运维与入库脚本
supabase/            迁移与策略
docs/                交接与运行说明
```

## 快速开始

```bash
pnpm install
cp .env.local.example .env.local   # 填 Supabase / AUTH_SECRET 等
pnpm dev                           # :3264 · 必须保留 --webpack
pnpm test
pnpm build
```

环境变量见 `.env.local.example` 与 `README` 历史表格（Supabase、AUTH、Admin hash、嵌入端点等）。

## 许可

MIT — 见 [LICENSE](./LICENSE)。
