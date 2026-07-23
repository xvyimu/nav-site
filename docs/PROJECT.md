# ChronoPortal · 形态与技术栈（SSOT）

> **产品显示名：** 综合导航站 / 公益 API 导航 · **GitHub：** [xvyimu/ChronoPortal](https://github.com/xvyimu/ChronoPortal)  
> **本地：** `D:\ChronoPortal`（入口 `D:\projects\ChronoPortal`）· npm private name 仍可能为 `nav-site`  
> **生产：** https://yuanjia1314.ccwu.cc  
> 全局门闩：`~/CLAUDE.md` §8 · `~/.claude/specs/principle.md`「形态与技术栈」。  
> **本文件 = 本产品形态与唯一技术栈权威。** 换形态/换栈：先 ADR → 改本文 → 再代码。小修不重选型。

---

## 产品方案指针与验收摘要

| 项 | 链接 |
|----|------|
| **产品分层（L0–L6）** | [`PRODUCT-LAYERS.md`](./PRODUCT-LAYERS.md) |
| **形态与栈 SSOT** | 本文其余章节 |
| **组合总纲** | 本机 `D:\orca\.planning\portfolio-product-docs-program-2026-07-23\PORTFOLIO-PRODUCT-PROGRAM.md` |

**五问快答：** 身份/用户/边界见 PRODUCT-LAYERS **L0**；栈见本文；验收见 **L4**；许可与协作见 **L5** 与根 `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md`。

---

## 1. 产品形态（唯一）

| 项 | 结论 |
|----|------|
| **形态** | **Web 导航门户 + 管理后台**（公开站 + Admin） |
| **交付** | Vercel 生产；本地 `pnpm dev`（端口 **3264**，**必须** `--webpack`） |
| **能力面** | 分类/搜索（模糊+语义）、书签导入、死链、图标回填、限流、CSP/Sentry |
| **不是** | 小程序、原生 APP、桌面壳、纯静态无后端导航 |

**做 / 不做（形态级）**

| 做 | 不做 |
|----|------|
| App Router 前台 + Admin CRUD + revalidate | 另起独立 Admin SPA 第二框架 |
| Supabase 数据 + RLS；Auth.js 鉴权 | 为炫技换栈到 Remix/Nuxt 平行实现 |
| Fuse + pgvector 语义搜索 | 无契约乱扩写入 API |

---

## 2. 唯一技术栈

| 层 | 技术 | 约束 |
|----|------|------|
| 框架 | **Next.js 16** App Router | 构建 **webpack**（scripts 已带 `--webpack`；勿擅自改默认 bundler 策略） |
| UI | **React 19** · **Tailwind CSS v4** · **shadcn/ui** · Radix | |
| 语言 | TypeScript · **pnpm@11** | |
| 数据 | **Supabase** PostgreSQL + **RLS** | 写路径经 repository / domain 模块（见 ADR） |
| 认证 | **Auth.js v5**（Credentials + 可选 GitHub OAuth） | |
| 搜索 | Fuse.js + **pgvector**；嵌入默认 CF Workers AI **`bge-m3` @1024** | |
| 限流 | **Upstash** Redis（可 fail-closed） | |
| 观测 | **Sentry**（含 web-vitals / csp-report） | |
| 测试 | Vitest · Playwright | |
| 部署 | **Vercel**（生产单轨） | CF Rocket Loader off（CSP） |

目录与续作：根 README · [`AGENT-CONTINUE-2026-07-21.md`](./AGENT-CONTINUE-2026-07-21.md) · 根 [`AGENTS.md`](../AGENTS.md) / [`CLAUDE.md`](../CLAUDE.md)。

---

## 3. 选型理由（取舍）

- **Web 门户：** 外链导航与 SEO/分享匹配；管理后台同仓 Route Handlers 降低双仓成本。
- **Next + Supabase：** 成熟 BaaS + RLS；语义搜索用 pgvector 而非自建向量服务。
- **webpack 固定：** 与现网构建/插件兼容；换 Turbopack 须单独验证门闩后再改文档。
- **唯一栈：** 禁止平行 Vue Admin / 独立 Express 网关替代本仓写路径（除非 ADR）。

---

## 4. 防漂移

1. 形态/栈以本文为准；Next 大版本 API 以本仓 `node_modules/next/dist/docs/` 为准（见 AGENTS 警告块）。  
2. 不擅自去掉 `--webpack`、不放宽生产 CSP 默认策略而不经 `docs/csp-*` 决策。  
3. 换栈/换形态 → ADR（`docs/adr-*`）+ 更新本文 → 再实现。  
4. 领域边界：`adr-003` / `adr-006` 等 repository 模块约定。
