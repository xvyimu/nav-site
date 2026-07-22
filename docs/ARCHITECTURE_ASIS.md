# ChronoPortal · 架构现状测绘（As-Is）

> **测绘日：** 2026-07-22  
> **仓路径：** worktree `cp-1` ≡ 产品 `ChronoPortal`（npm 包名历史 `nav-site`）  
> **真路径参考：** `D:\ChronoPortal` / 本 worktree  
> **生产入口：** `https://yuanjia1314.ccwu.cc`  
> **性质：** **只读测绘**；不改业务代码、不 commit、不 push  
> **总规划 SSOT：** `D:\orca\docs\architecture-stack-refactor-master-2026-07-22.md`  
> **目标栈 SSOT：** C · Python · Go · TS+Vue3+NaiveUI · 嵌入式副线 · Git/Shell/SQL  

---

## 0. 一句话结论

ChronoPortal 是 **Next.js 16 + React 19 全栈内容/导航站**（SSR/RSC + Route Handlers），数据在 **Supabase/Postgres（pgvector）**，部署 **Vercel + Cloudflare DNS**。  
与目标栈对照：**内容站 L2 遗留** — 主运行时在 SSOT 外（Next/React）；仅 **SQL 迁移、Shell/PS 脚本、旁路 Python embed** 贴合 SSOT。  
**不建议**按 Go 网关 + Vue 面板做旗舰重写；主战场在 TransitHub / MindSync。本仓默认 **维持 + 安全/运维补丁**。

**策略标签：`L2`（内容遗留）**

---

## 1. 产品职责（业务边界）

| 项 | 内容 |
|----|------|
| 定位 | 综合 AI / 开发 / 设计 **资源导航**（收录链接 × 分类 × 标签 × 搜索） |
| 用户 | 开发者 / 设计师 / AI 从业者；秒级扫一眼决策 |
| 核心路径 | 浏览分类 → 筛选/搜索 → 工具详情 → 外链点击；Admin 审核/CRUD |
| 成功指标 | 「找到 → 点击」转化，非停留时长（`PRODUCT.md`） |
| 非目标 | 不写长文 CMS、不拆微服务、不扛高并发 API 网关产品 |

---

## 2. 目录 / 模块图

### 2.1 顶层目录

```
ChronoPortal/
├── app/                 # Next App Router：页面 + Route Handlers
├── components/          # React UI（含 admin/ · navigation/ · ui/）
├── lib/                 # 领域逻辑、仓库、搜索、鉴权、CSP
├── proxy.ts             # Edge：Admin 鉴权门 + 可选动态 CSP
├── next.config.ts       # 静态安全头 / CSP / Sentry / bundle
├── scripts/             # Node/PS/SQL/Python 运维与迁移
├── workers/             # CF Worker：embed 反代（旁路）
├── tests/ · e2e/        # Vitest + Playwright
├── docs/                # ADR、runbook、审计（含本文件）
├── public/              # 静态资源 + build-info
└── types/               # TS 增强类型
```

### 2.2 逻辑分层（As-Is）

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser / Cloudflare edge (DNS, Rocket Loader off)         │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel · Next.js 16 (单一部署单元)                          │
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │ RSC pages    │  │ Route Handlers /api/*               │  │
│  │ Admin React  │  │  thin → use-case / repositories     │  │
│  └──────┬───────┘  └──────────────┬──────────────────────┘  │
│         │                         │                         │
│  proxy.ts (auth gate + optional CSP_DYNAMIC nonce)          │
│         │                         │                         │
│         └──────────┬──────────────┘                         │
│                    ▼                                        │
│         lib/repositories/*  (facade → domain modules)       │
│         lib/search/*        (Fuse + semantic adapters)      │
│         lib/auth · rate-limit · csrf · schemas              │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────────────┐
        ▼            ▼                    ▼
  Supabase      Embed path           Resource Library
  Postgres      (CF Workers AI       (独立 Supabase 项目
  nav-prod      bge-m3 1024-d 或     rl · public_pages)
  + pgvector    本机 Python BGE 512)
```

### 2.3 `lib/` 域模块（ADR-003/006）

| 模块 | 职责 |
|------|------|
| `lib/repositories/*` | 数据访问：categories / links / tags / admin-links / submissions / reviews / favorites / link-health |
| `lib/search/*` | 搜索用例 `executeSearch` + Fuse + semantic + merge（ADR-004 适配缝） |
| `lib/admin/*` | Admin 契约与 client（ADR-009：UI → client → Route → repository） |
| `lib/supabase/*` | 服务端客户端与配置 |
| `lib/resource-library/*` | 资源库浏览/客户端（跨库） |
| `lib/auth.ts` · `with-admin` · `csrf` · `rate-limit*` | 鉴权与横切 |
| `lib/csp.ts` | CSP builders / flags / nonce（安全加固，非产品主路径） |
| `lib/embedding-runtime.ts` · `search/embed-provider` | Embed 端点解析与调用 |

### 2.4 页面面（`app/`）

| 路径 | 类型 |
|------|------|
| `/` | 首页导航（分类/标签/搜索） |
| `/tool/[slug]` | 工具详情 |
| `/resources` · `/resources/[id]` | 资源库 |
| `/favorites` · `/submit` · `/about` · `/login` | 用户侧 |
| `/admin/*` | 管理台（React，非 Vue） |
| `/api-docs` | OpenAPI 文档页 |

---

## 3. 语言 / 技术占比（仓内源码，排除 node_modules）

| 扩展 | 约文件数 | 约行数 | 角色 |
|------|----------|--------|------|
| `.ts` | 153 | ~19.3k | 服务端/领域主量 |
| `.tsx` | 89 | ~8.2k | React 页面与组件 |
| `.md` | 65 | ~9.4k | 文档（不计入运行时） |
| `.mjs` | 33 | ~4.3k | Node 运维脚本 |
| `.sql` | 21 | ~1.8k | 迁移 / RLS / 约束 |
| `.py` | 6 | ~1.0k | **旁路** embed 服务与 backfill / 测试 |
| `.css` | 1 | ~0.5k | 全局样式 |
| `.go` / `.vue` / `.c` | **0**（业务） | — | **目标栈主路径缺失** |

**运行时主栈：** TypeScript + React + Next.js（~90%+ 业务代码）  
**SSOT 贴合碎片：** SQL、Shell/PS（`scripts/*.ps1`）、Python embed 微服务

**依赖锚点：** `next@16.2.9` · `react@19` · `next-auth@5 beta` · `@supabase/*` · `fuse.js` · `@sentry/nextjs` · Radix/shadcn · Tailwind 4 · Vitest · Playwright

---

## 4. 对外 API 面

生成入口：`pnpm docs:openapi` → `scripts/generate-openapi.mjs`（UI：`/api-docs`）。

### 4.1 公开

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/health` | 健康（DB / embed / 限流等） |
| GET | `/api/search` | 混合搜索（Fuse ± 语义） |
| GET | `/api/tools` | 已通过链接列表/查询 |
| GET | `/api/favicon` | 图标代理 |
| POST | `/api/click` | 点击追踪 |
| POST | `/api/submit` | 用户提交链接 |
| GET/POST | `/api/reviews` | 评价 |
| GET/POST… | `/api/favorites` | 收藏（会话用户） |
| GET | `/api/resource-browse` · `resource-search` · `resource-search-status` · `resource-ratings` | 资源库 |
| POST | `/api/csp-report` | CSP Report-Only 采样 |
| GET | `/api/ga` | GA bootstrap JS（外置，无 inline） |
| POST | `/api/web-vitals` | 性能指标 |
| * | `/api/auth/[...nextauth]` | Auth.js |
| POST | `/api/checkout` · `/api/webhook` | 支付 **预留**（`ENABLE_PAYMENTS_API=0` 时 404） |

### 4.2 Admin（需 admin 角色；proxy 门闩）

| 前缀 | 资源 |
|------|------|
| `/api/admin/links` · `[id]` | 链接 CRUD |
| `/api/admin/categories` · `[id]` | 分类 |
| `/api/admin/tags` · `[id]` | 标签 |
| `/api/admin/link-health` | 死链/健康发现 |

### 4.3 旁路（非 Next 主进程）

| 服务 | 技术 | 说明 |
|------|------|------|
| CF Workers AI | 外部 | 生产默认 embedding 1024-d（`EMBED_PROVIDER=cloudflare`） |
| `scripts/embed-server.py` | Python FastAPI + sentence-transformers | 本机/远程 BGE 512；经 Worker 反代可选 |
| `workers/nav-site-embed-proxy.js` | CF Worker | Named Tunnel / HTTPS 入口 |

**信任边界现状：** 浏览器可直打 Next `/api/*`；**无**独立 Go 网关层；密钥在 Vercel env + Supabase service role（服务端）。

---

## 5. 数据存储

### 5.1 库划分（三库事实）

| 逻辑名 | 角色 | 备注 |
|--------|------|------|
| **nav-prod** | 生产业务（分类/链接/标签/评价/收藏/限流表…） | 主路径 |
| **nav-dev** | Preview / 记忆向 | 勿与 prod key 串库 |
| **rl** | Resource Library 爬取/公开页 | 独立 project；公开读 + service fallback |

### 5.2 引擎与能力

- **Postgres + Supabase**（Auth 部分用 Auth.js，非全盘 Supabase Auth 产品形态）
- **pgvector**：`embedding` / `embedding_1024` + RPC `search_links_semantic_v2` 等
- **RLS / 硬化迁移**：`scripts/migration-*.sql`、`rls-audit.sql`
- **限流：** 进程内桶 + 可选 **Upstash Redis**（分布式；`DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED`）

### 5.3 对象 / 日志 / 可观测

- 无自建对象存储主路径；favicon 等走代理
- **Sentry**（错误 + CSP 采样 + web-vitals 间接）
- 生产探针：`scripts/probe-production.mjs` · `/build-info.json`

---

## 6. 横切与安全（一笔）

- **Auth：** NextAuth v5 Credentials（admin scrypt hash）+ 可选 GitHub OAuth；`proxy.ts` 收窄 Admin
- **CSRF：** 写路径 Origin/Referer 检查（`lib/csrf`）
- **CSP：** 静态头（next.config）+ Report-Only；T9′/T9″ 有 flags/nonce 管道，**生产默认仍可保留 script unsafe-inline**（细节见 `docs/csp-t9-decision-2026-07-22.md`）
- **边缘：** Cloudflare Rocket Loader **已关**（nonce 前置）
- 测试体量：Vitest 大套 + e2e；typecheck 干净（测绘时点以分支 tip 为准）

---

## 7. 与目标栈偏离清单

| 目标层 | SSOT | As-Is | 偏离 | 建议标签 |
|--------|------|-------|------|----------|
| 前端面板 | TS + **Vue3 + NaiveUI** | TS + **React + Next**（Radix/shadcn） | **高** — 整站 UI 栈不同 | **L2** 维持；不设 Vue 重写 P0 |
| 高性能网关 | **Go** | Next Route Handlers 同进程 | **高** — 无 Go 边界 | **L2**；流量形态不需独立网关 |
| AI/核心服务 | **Python** | 搜索/领域在 **TS**；Python 仅 embed 旁路 | **中** — AI 非主产品形态 | embed 可标 **SIDE/TOOL**；不抽 AI-Core 除非产品升级 |
| 底层 C | 标准 C | **无** | N/A | 不引入 |
| 嵌入式 | STM32/eLinux | **无** | N/A | **SIDE** 独立仓，与本站无关 |
| 数据 | **SQL** | Postgres/SQL 迁移 **已对齐** | **低** | 保持 SQL 规范 |
| 工具 | Git / Shell | Git + mjs + **PowerShell** | **低** | Shell/PS 维持 |
| 内容站策略 | 遗留 Next 可接受 | 正是 Next 内容/导航 | **符合总规划 Phase 4** | **L2** |

### 7.1 明确「不是」的东西

- 不是 TransitHub 式 API 聚合/计费网关  
- 不是 MindSync 式 Prompt/Agent 桌面核  
- 不是需要 Vue 管理台绞杀迁移的旗舰  
- Admin 是 **站内 React 岛**，不是独立 Console 产品  

---

## 8. 迁移风险（若强行对齐目标栈）

| 动作 | 风险 | 成本 | 建议 |
|------|------|------|------|
| 整站 React→Vue3+NaiveUI | 全 UI 重写；SEO/RSC 行为变更 | **极高** | **不做**（L2） |
| API 抽到 Go 网关 | 双部署、会话/Cookie 对齐、限流重做 | 高 | 无业务驱动则 **不做** |
| 搜索/仓库迁 Python | 延迟、运维双运行时；与 RSC 直连冲突 | 高 | 仅当 AI 产品化再评估 |
| 静态化导航 | 失动态搜索/登录/Admin | 中 | 可选远期；非当前 |
| 继续 Next 上「微重构堆栈」 | 与产品线战略抢带宽 | 中 | **冻结无 SSOT 目标的微重构** |

**残留技术债（L2 内可修，不升格为栈迁移）：** 密钥串库陷阱文档化、CSP 生产金丝雀观察、favorites DB 级硬化、支付预留死代码等 — 见 `docs/AGENT-CONTINUE-2026-07-21.md`。

---

## 9. 建议标签与处置

| 标签 | 含义 | 对本仓 |
|------|------|--------|
| **L2** | 内容遗留；默认维持 | **主标签** |
| P0 / P1 | 旗舰/核心迁移 | **不适用**（让位 TransitHub / MindSync） |
| LEGACY | 整栈 SSOT 外且冻结 | 不必升格；L2 已够 |
| TOOL | 开发者工具 | 仅 `scripts/`、`workers/` 局部可类比 |
| SIDE | 嵌入式副线 | **无**；勿把固件塞进本 monorepo |

### 9.1 Phase 映射（总规划）

- **Phase 0：** 标签确认 → **L2**（本文）  
- **Phase 4：** 内容站 — 仅安全/运维补丁；禁止新功能栈实验  
- **不进** Phase 1（TH 骨架）/ Phase 2（AI-Core）主序列  

### 9.2 允许的后续（仍属 L2）

1. 安全补丁、依赖 CVE、CSP/边缘 hardening  
2. SQL 迁移与 RLS  hardening  
3. 探针/runbook/可观测  
4. 明确产品需求的内容功能（仍用现栈）  

### 9.3 禁止

1. 为「对齐 SSOT」启动 Vue/Go 重写  
2. 无阈值上 Meili/ES/虚拟列表等架构飘移（既有 ADR 不变式）  
3. 把本仓当 Python AI-Core 宿主  

---

## 10. ADR 索引（现状决策）

| ADR | 主题 |
|-----|------|
| 001 | 双库合并为单业务库叙事 |
| 002 | Auth.js 迁移 |
| 003 / 006 | Repository 域模块 |
| 004 | 搜索适配器缝 |
| 007 | 导航 IA / URL state |
| 008 | 远程 embed 端点 |
| 009 | Admin 前后端接口边界 |

架构不变式摘要（`docs/AGENT-CONTINUE-2026-07-21.md`）：单 Next 部署；RSC 直连 repository；Admin 不绕 boundary；搜索薄 route + use-case。

---

## 11. 测绘方法与限制

- 基于 worktree 目录、`package.json`、路由 glob、行数统计、ADR/PRODUCT/runbook 只读摘录  
- **未**对生产 DB 做实时 schema dump；表结构以 `scripts/migration-*.sql` 与文档为准  
- tip 以测绘时 git 分支为准；生产 runtime 以 `/build-info.json` 为准（可能滞后 docs tip）  
- **本文件写入不算业务重构**；按任务要求可落盘 `docs/ARCHITECTURE_ASIS.md`，**不 commit**

---

## 12. 给协调员的可执行摘要

1. **标签：** ChronoPortal = **`L2` 内容遗留**  
2. **主栈：** Next/React/TS — 与 Vue/Go SSOT **系统性偏离**，但是总规划已预期的内容站形态  
3. **贴合点：** SQL + Shell + 旁路 Python embed  
4. **Next 动作：** 产品线精力给 **TransitHub P0 / MindSync P1**；本仓仅安全与运维  
5. **产出路径：** `docs/ARCHITECTURE_ASIS.md`（本文件）
