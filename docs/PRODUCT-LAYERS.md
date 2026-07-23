# ChronoPortal · 产品分层方案（PRODUCT-LAYERS）

> **组合总纲：** `D:\orca\.planning\portfolio-product-docs-program-2026-07-23\PORTFOLIO-PRODUCT-PROGRAM.md`  
> **形态与栈 SSOT：** [`PROJECT.md`](./PROJECT.md)  
> **tip：** `f9d3d38b`

---

## L0 · 产品身份

| 项 | 内容 |
|----|------|
| **一句话** | **综合导航门户 + 管理后台**：分类检索、书签与死链运营、限流与安全加固。 |
| **核心问题** | 如何让访客快速找到可用站点/API，并让站长可运营、可审计。 |
| **主用户** | **终端访客**（检索）· **站长/运营**（Admin CRUD） |
| **明确不做** | 小程序/桌面壳主形态 · 第二 Admin SPA 框架 · 无契约乱扩写 API · 生产 CSP 无口令 flip |
| **价值** | 可直接部署 Vercel · Supabase+RLS · 书签导入与健康检查可复用脚本 |

---

## L1 · 形态与栈

见 [`PROJECT.md`](./PROJECT.md)：Next 16 · React 19 · Tailwind 4 · shadcn · Supabase · Auth.js · Upstash · Sentry。

---

## L2 · 运行与边界

| 项 | 内容 |
|----|------|
| 路径 | `D:\ChronoPortal` · 入口 `D:\projects\ChronoPortal` |
| 本地 | `pnpm dev` · 端口 **3264** · **必须** `--webpack` |
| 生产 | Vercel · 域名见 PROJECT |
| 数据 | Supabase · RLS · 写路径经 repository/domain |
| 门闩 | **CSP 生产** 人 gate；与 TH D7 ≥48h；视觉波 **零** 改 proxy CSP |
| 密钥 | env 不进 git |

---

## L3 · 架构与扩展

| 区域 | 说明 |
|------|------|
| `app/` | App Router 前台 + Admin |
| domain / repository | 写路径契约 |
| 搜索 | Fuse + pgvector · 嵌入 bge-m3@1024 |
| 扩展点 | 分类/链接模型 · 导入脚本 · 观测钩子 |
| **禁止** | Remix/Nuxt 平行站 · 绕过 RLS 的服务端裸写 · 生产 env 与视觉同会话乱改 |

---

## L4 · 验收与质量

| 命令 | 用途 |
|------|------|
| `pnpm test` | 单测（清 Upstash env 防污染） |
| `pnpm typecheck` | 类型（`probe-security-headers` 基线债另记） |
| `pnpm build` | 生产构建 |
| `pnpm lint` | 风格 |

触达业务必绿；e2e 按改动面。

---

## L5 · 协作与合规

| 项 | 内容 |
|----|------|
| 许可 | **MIT** · 根 `LICENSE` |
| 安全 | 根 `SECURITY.md` |
| 贡献 | 根 [`CONTRIBUTING.md`](../CONTRIBUTING.md) · Issue + PR 检查清单 |

---

## L6 · 路线图与维护

| 周期 | 内容 |
|------|------|
| 近 | Preview CSP Stage A（人 gate）· major 依赖单独 |
| 中 | 搜索/死链运营体验 · 性能与限流 |
| 远 | 内容生态与安全基线保持 |
| 节奏 | Issue 分类响应 · 依赖 Dependabot 逐个 · 文档随功能 |

---

## 文档地图

PROJECT · PRODUCT-LAYERS · AGENT-CONTINUE · ops/csp-* · design/atelier-v1b-matrix（视觉）
