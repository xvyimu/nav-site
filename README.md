# ChronoPortal

**GitHub：** [xvyimu/ChronoPortal](https://github.com/xvyimu/ChronoPortal)  
**产品显示名：** 综合导航站 / 公益 API 导航  
**本地路径 / package 名：** `D:\ChronoPortal` ≡ `D:\nav-site` · npm `"name": "nav-site"`（private，**不是** GitHub 身份）  
**线上：** https://yuanjia1314.ccwu.cc  
**许可：** [MIT](./LICENSE) · Copyright (c) 2026 xvyimu  

> 仓库由 `xvyimu/nav-site` **改名**为 `xvyimu/ChronoPortal`（2026-07-21）。  
> 产品品牌与本地目录可仍称「导航站 / nav-site」；**GitHub、克隆 URL、文档外链一律用 ChronoPortal**。  
> 身份卡：[GITHUB_IDENTITY.md](./GITHUB_IDENTITY.md)

## 它是什么

精选收录 AI 模型、云服务、开发工具、设计与开源资源的 **导航门户**：

- 分类浏览 · Fuse 模糊搜索 · pgvector 语义搜索（Cloudflare Workers AI `bge-m3` @1024）
- 管理后台：链接 / 分类 / 标签 CRUD · **写后 `revalidatePath` 秒级前台刷新**
- 书签 HTML 导入 · 死链检查入库 · Admin 死链面板 · 图标回填
- Auth.js（Credentials + 可选 GitHub OAuth）· Upstash 分布式限流（可 fail-closed）
- CSP Enforcing + Report-Only；采样违规进 **Sentry**（`source:csp-report`）

## 当前状态（2026-07-22）

| 项 | 值 |
|----|-----|
| **origin/master = 生产 runtime** | **`a1e5c7f6`** · deploy `dpl_EwZKkesa…` |
| 生产入口 | https://yuanjia1314.ccwu.cc |
| 探针 | `node scripts/probe-production.mjs --no-proxy` · home/health/search/tool/sitemap/robots/build-info |
| 限流 | Upstash + `DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED` |
| CSP | Enforcing 仍含 script `unsafe-inline`；RO 无 inline → `/api/csp-report` → 采样日志 + Sentry |
| typecheck | `pnpm typecheck` 干净（`3abf5eca` 已清测试债） |

Agent 续作 SSOT：[`docs/AGENT-CONTINUE-2026-07-21.md`](./docs/AGENT-CONTINUE-2026-07-21.md)（文内已刷新至 07-22 tip）。

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 App Router（**webpack** 构建，scripts 已带 `--webpack`） |
| UI | React 19 · Tailwind CSS v4 · shadcn/ui |
| 数据 | Supabase PostgreSQL + RLS |
| 认证 | Auth.js v5 |
| 搜索 | Fuse.js + pgvector；嵌入默认 CF Workers AI `bge-m3` @1024 |
| 限流 | Upstash Redis |
| 观测 | Sentry（含 web-vitals / csp-report） |
| 测试 | Vitest · Playwright |
| 部署 | Vercel（生产单轨；project 可能仍名 `nav-site`） |

## 目录

```text
.
├─ app/                     # App Router 页面与 Route Handlers
├─ components/              # UI（含 Admin）
├─ lib/                     # repositories / search / auth / admin
├─ scripts/                 # probe / check-links / bulk-add / 入库
├─ tests/ · e2e/
├─ docs/                    # 交接 · ADR · 研究
├─ public/                  # 静态资源 · build-info
├─ package.json             # private · repository → ChronoPortal
├─ GITHUB_IDENTITY.md
├─ LICENSE                  # MIT
└─ AGENTS.md · CLAUDE.md    # AI 协作入口
```

## 快速开始

```bash
pnpm install
cp .env.local.example .env.local   # Supabase / AUTH_SECRET / ADMIN_* / 嵌入 / Upstash / Sentry
pnpm dev                           # http://localhost:3264 · 必须保留 --webpack
pnpm test
pnpm typecheck
pnpm build
```

生产验收：

```bash
# Windows 上本机代理常 down 时加 --no-proxy，避免 undici 打 7890 失败
node scripts/probe-production.mjs --no-proxy --expect-commit a1e5c7f6
# 或
pnpm verify:production

# 核对线上 commit
node -e "fetch('https://yuanjia1314.ccwu.cc/build-info.json').then(r=>r.json()).then(console.log)"
```

部署（本机约定）：

```bash
npx vercel deploy --prod --scope aijiai520
```

环境变量详见 `.env.local.example`。

## 架构不变式（摘要）

1. 单 Next 部署，不拆微服务  
2. RSC 直连 repository，不经自身 HTTP  
3. Admin：UI → `lib/admin/client` → Route Handler → repository  
4. 搜索：薄 route + `executeSearch` + SearchAdapters  
5. 生产密码只认 `ADMIN_PASSWORD_HASH`；embed 默认 CF 1024-d  
6. 公开路径禁止 `service_role` 读明细  

**禁止：** 改分层边界 / 无阈值上 Meili·ES·虚拟列表 / 把 docs-only commit 误当 runtime 需求强行 redeploy。

## 近期已交付（摘要）

- 五层内部优化 · 书签导入 · 死链→Admin · Upstash fail-closed  
- Admin 写路径 `revalidatePublicNavContent`（本地 prod 库写测秒更 PASS）  
- CSP Report-Only + **`a1e5c7f6` 采样 → Sentry**  
- ChronoPortal 身份 docs · typecheck 测试债清零  

## 下一候选

| # | 事项 | 备注 |
|---|------|------|
| B″ | 读 Sentry `csp-report` 样本 1–2 天后再评估 T9 去 `unsafe-inline` | 需 nonce 或足够证据 |
| A′ | 浏览器生产 Admin 秒更手测 | 可选；本地已验证 |
| D–F | AI 建议标签 / 死链周报 / favorites DB JWT | 需 spec |

## CI / 远程

- `origin` → `ssh://git@github.com/xvyimu/ChronoPortal.git`  
- Issues：https://github.com/xvyimu/ChronoPortal/issues  
- 私有单人默认：**feature → 本地 merge/ff master → push**（PR 仅明确需要时）

## 文档

| 文档 | 用途 |
|------|------|
| [`docs/AGENT-CONTINUE-2026-07-21.md`](./docs/AGENT-CONTINUE-2026-07-21.md) | Agent 续作 / 陷阱 / 命令 |
| [`docs/PRODUCTION-RUNBOOK.md`](./docs/PRODUCTION-RUNBOOK.md) | 生产运维 |
| [`GITHUB_IDENTITY.md`](./GITHUB_IDENTITY.md) | GitHub 身份 |
| `docs/adr-*.md` | 架构决策 |
| `AGENTS.md` / `CLAUDE.md` | Agent 入口 |

## 许可证

[MIT License](./LICENSE) · Copyright © 2026 xvyimu
