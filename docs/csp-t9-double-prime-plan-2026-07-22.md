# CSP T9″ 重构方案 · 2026-07-22

> **范围：** proxy/layout 接 per-request nonce；preview 可关 Enforcing `script-src 'unsafe-inline'`。  
> **不变：** 生产默认 flags（`CSP_DYNAMIC` off · `CSP_SCRIPT_UNSAFE_INLINE` on）；Admin 鉴权语义；GA 外置路径。

## 1. 背景与目标

| 项 | 现状 (T9′) | T9″ 目标 |
|----|-----------|----------|
| `lib/csp.ts` | builder + flags + `createCspNonce` 已就绪 | 增加可测的「动态上下文」装配 helper |
| `next.config.ts` | 静态 CSP；`CSP_DYNAMIC=1` 时跳过 CSP 头 | **不改行为**（仍由 flag 控制） |
| `proxy.ts` | 仅 Admin/login 鉴权；**不发** nonce/CSP | `CSP_DYNAMIC=1` 时：生成 nonce → `x-nonce` 请求头 + 响应 CSP 头 |
| `app/layout.tsx` | 无 nonce | 读 `x-nonce`，挂到 Script / theme / JSON-LD |
| 生产默认 | script `'unsafe-inline'` **保留** | **仍保留**（env 默认不变） |
| Preview 金丝雀 | 未接线 | 文档约定：`CSP_DYNAMIC=1` + `CSP_SCRIPT_UNSAFE_INLINE=0` |

## 2. 改动文件范围

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `lib/csp.ts` | 扩展 | `createDynamicCspContext` / `applyCspHeaderPairs` / 请求头合并 |
| `tests/csp.test.ts` | 扩展 | flags 门闩、nonce 头对、header 应用 |
| `proxy.ts` | 行为扩展（flag 门闩） | 动态 CSP 接线；matcher 扩到文档路由 |
| `app/layout.tsx` | 消费 | `headers().get("x-nonce")` → 子组件 |
| `components/Analytics.tsx` | 消费 | `Script nonce={…}` |
| `components/ThemeProvider.tsx` | 消费 | `next-themes` `nonce`（防 theme FOUC script 被拦） |
| `tests/csp-proxy.test.ts` | 新增 | proxy 动态/静态路径单测（mock auth） |
| `.env.local.example` | 文档 | T9″ 接线说明 |
| `docs/csp-t9-decision-2026-07-22.md` | 文档 | §4 勾选接线状态 |
| `docs/AGENT-CONTINUE-2026-07-21.md` | 文档 | Next 指向 preview 金丝雀/观察 |
| `docs/csp-t9-double-prime-plan-2026-07-22.md` | 本方案 | 存档 |

**不改：** `next.config.ts` 逻辑、`app/api/ga`、`style-src`、生产 Vercel env 默认值。

## 3. 依赖影响

| 依赖 | 影响 |
|------|------|
| `next@16.2.9` / `proxy.ts` 约定 | 用现有 `proxy.ts`（非 `middleware.ts`） |
| `next-auth` `auth()` 包装 | 保持；CSP 在返回 `NextResponse` 前/后附加 |
| `next/script` | `nonce` prop |
| `next-themes` | `nonce` prop（若版本支持；本仓已有依赖） |
| 渲染模式 | RootLayout 读 `headers()` → 该树动态化（nonce 本就 per-request） |

无新 npm 包。

## 4. 行为契约（必须保持）

1. **`CSP_DYNAMIC` 默认 off：** 与今日一致——静态 CSP 由 `next.config` 发；proxy 不写 CSP/nonce。  
2. **`CSP_SCRIPT_UNSAFE_INLINE` 默认 on：** Enforcing 仍含 `'unsafe-inline'`。  
3. **Admin 鉴权：** 非 admin 访问 `/admin` / `/api/admin/*` → redirect/401；admin 访 `/login` → `/admin`；公开 API 不经 admin gate。  
4. **入参/出参：** 无业务 API 契约变更。  
5. **异常：** 不新增 throw 路径；nonce 生成失败（无 crypto）视为环境故障（与现有 `createCspNonce` 一致）。

## 5. 风险点与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| `CSP_DYNAMIC=1` 却无 layout nonce → Next/inline 被 Enforcing 拦 | 高 | 同 PR 接线 layout；preview 先开，生产默认 off |
| 双 CSP 头（config + proxy） | 高 | 已有：`CSP_DYNAMIC=1` 时 next.config **跳过** CSP |
| matcher 过宽导致静态资源过 middleware | 中 | 排除 `_next/static`、`_next/image`、带扩展名静态文件、`api/*`（admin API 单独列） |
| 全站跑 `auth()` 增加延迟 | 中 | 可接受；文档标明；后续可拆「仅 CSP 的轻路径」 |
| `next-themes` 内联脚本无 nonce | 中 | ThemeProvider 透传 `nonce` |
| JSON-LD / 其它 inline script | 低 | JSON-LD 非 JS 执行；仍挂 nonce 以一致 |
| CF 再开 Rocket Loader | 高 | 边缘已 off；runbook 禁止在 mangled>0 时去 inline |
| 生产误开 `CSP_SCRIPT_UNSAFE_INLINE=0` 无观察 | 高 | **本次不改生产 env**；仅文档指导 preview |

## 6. 分步执行计划（每步一次 commit）

| Step | Commit 主题 | 验证 |
|------|-------------|------|
| A | `feat(csp): dynamic context helpers + unit tests` | `vitest tests/csp.test.ts` |
| B | `feat(csp): proxy attaches nonce CSP when CSP_DYNAMIC=1` | `vitest tests/csp-proxy.test.ts` + csp |
| C | `feat(csp): layout/Analytics/ThemeProvider consume x-nonce` | vitest + typecheck |
| D | `docs(csp): T9″ wiring and preview canary flags` | 文档 diff 审阅 |

## 7. 验收标准

- [x] `CSP_DYNAMIC` 未设：行为与 T9′ 一致（单测 + 代码门闩）。  
- [x] `CSP_DYNAMIC=1`：响应含 `Content-Security-Policy` 且 `script-src` 含 `'nonce-…'` + `'strict-dynamic'`；请求侧 `x-nonce` 可达 layout。  
- [x] `CSP_DYNAMIC=1` + `CSP_SCRIPT_UNSAFE_INLINE=0`：Enforcing **无** script `'unsafe-inline'`（builder 单测）。  
- [x] Admin 鉴权路径单测不回归（`tests/csp-proxy.test.ts`）。  
- [x] `pnpm test`（unset Upstash）+ `pnpm typecheck` — 见收尾验证。  
- [x] **不**在本任务把生产 env 改为去 inline。

## 8. Preview 金丝雀（人工，非本 PR 自动）

```text
Vercel Preview env:
  CSP_DYNAMIC=1
  CSP_SCRIPT_UNSAFE_INLINE=0
  # CSP_REPORT_ONLY 保持默认 on
```

冒烟：首页 / 搜索 / Admin / GA network / 控制台无 CSP 红字；Sentry `source:csp-report` 可解释。  
回滚：去掉两 env 或 `CSP_SCRIPT_UNSAFE_INLINE=1` 后 redeploy。

## 9. 明确不做

- 生产默认去掉 `'unsafe-inline'`  
- 改 `style-src`  
- 恢复/依赖 Rocket Loader  
- 为「Sentry 暂时 0 条」宣布 T9 完成  
