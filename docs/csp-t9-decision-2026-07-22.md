# CSP T9 评估 · 2026-07-22（含 T9′ 落地）

> **Enforcing 默认结论不变：暂不**去掉 `script-src 'unsafe-inline'`。  
> T9′ 已交付：**可回滚开关 · GA 外置 · CSP builder · 边缘审计脚本**。  
> **T9″（T-CP-001）已接线**：`CSP_DYNAMIC=1` 时 proxy 发带 nonce 的 CSP + `x-nonce`，layout/`Analytics` 可读并挂 nonce。  
> **生产默认保持关闭**——仅 preview 手动开 `CSP_DYNAMIC`；`CSP_SCRIPT_UNSAFE_INLINE` 默认仍 true。

## 0. T9′ 交付清单（1–5）

| # | 前置 | 状态 | 实现 |
|---|------|------|------|
| 1 | Nonce / strict-dynamic 管道 | **Builder + T9″ 接线就绪；默认仍关** | `lib/csp.ts`：`createCspNonce` / `createDynamicCspAttachment`；`CSP_DYNAMIC=1` 时 next.config **跳过**静态 CSP，`proxy.ts` 发 CSP + `x-nonce`；`app/layout.tsx` / `Analytics` 读 `x-nonce` 挂 nonce。**仅 preview 手动开** |
| 2 | GA 外置 | **已做** | `components/Analytics.tsx` → gtag.js + **`/api/ga?id=`**（`app/api/ga/route.ts`），**无** inline bootstrap |
| 3 | 边缘 script 改写排查 | **已清除** | 2026-07-22：`rocket_loader` **off** · mangled **0** · 见 `docs/cloudflare-edge-csp-hardening-2026-07-22.md` |
| 4 | 样本窗口 | **通道在线** | RO + `/api/csp-report` → 采样 Sentry `source:csp-report`；本机无 `SENTRY_AUTH_TOKEN` 时用 UI。结构阻断已足够否决立刻去 inline |
| 5 | 回滚开关 | **已做** | 见 §Env |

### Env 开关

| 变量 | 默认 | 作用 |
|------|------|------|
| `CSP_REPORT_ONLY` | on（`0` 关） | Report-Only 头 |
| `CSP_SCRIPT_UNSAFE_INLINE` | **on**（`0` 去掉） | Enforcing 是否含 script `'unsafe-inline'` |
| `CSP_DYNAMIC` | **off** | 为 1 时 next.config 不发 CSP；proxy 动态+nonce + layout 读 `x-nonce`。**仅 preview 手动开；生产勿开** |

回滚去 inline 失败：设回 `CSP_SCRIPT_UNSAFE_INLINE=1`（或不设）并 redeploy。

## 1. 样本通道状态

| 通道 | 状态 | 说明 |
|------|------|------|
| Report-Only 头 | **在线** | `script-src` **无** `'unsafe-inline'`；`report-uri /api/csp-report` |
| Enforcing 头 | **在线** | 默认 **含** `'unsafe-inline'`（可用 env 关掉） |
| `/api/csp-report` | **204** | 限流 + 1/20 采样；`logger.warn` + Sentry |
| Vercel Logs | 可见 POST 204 | 无 body 摘要 |
| Sentry Issues API | 需 `SENTRY_AUTH_TOKEN` | UI：`message:"csp-report:"` / tag `source:csp-report` |

## 2. 生产 HTML 结构（决定性，去 inline 前）

对 `GET /` 在 T9′ **前**实测过：

| 指标 | 值 |
|------|-----|
| 无 `src` 的 `<script>` | **~17** |
| 含边缘改写 type | 常见 `*-text/javascript` |
| GTM/GA | 有；**现已改为外置** `/api/ga`（deploy 后生效） |
| JSON-LD | layout 内联 `application/ld+json`（data 类型，script-src 通常不拦执行，但仍是 `<script>` 节点） |

### 若现在 `CSP_SCRIPT_UNSAFE_INLINE=0` 且无 nonce

1. Next / 运行时仍可能注入 inline（需 nonce 管道）。  
2. 边缘改写 type 的脚本行为不确定。  
3. JSON-LD 一般安全；真正风险是 **JS inline** 与第三方。

## 3. 决策

| 问题 | 答案 |
|------|------|
| 默认能否去掉 Enforcing `'unsafe-inline'`？ | **否**（默认 flag 仍为 on） |
| GA 是否还阻塞？ | **代码层已解**；等生产 deploy 后用 RO/Sentry 确认 |
| 下一步 | T9″ 接线已合入；**preview** 手动 `CSP_DYNAMIC=1` 冒烟后，再 `CSP_SCRIPT_UNSAFE_INLINE=0` 金丝雀（仍勿生产 cutover） |

## 4. 真正 cutover 清单（仍须全部满足）

1. ~~**Middleware/proxy 挂动态 CSP + nonce**，layout/Script 透传 nonce（`CSP_DYNAMIC=1`）。~~ **T9″ 代码已接**（默认关；preview 开）。  
2. 确认生产 HTML **不再**出现 inline gtag bootstrap；`audit-edge-scripts.mjs` 无 mangled type 或已关 Rocket Loader。  
3. Sentry `csp-report` 聚类 1–2 天可解释。  
4. Preview：`CSP_DYNAMIC=1` 冒烟 → 再 `CSP_SCRIPT_UNSAFE_INLINE=0`（首页 / 搜索 / Admin / GA network）。  
5. 生产切换 + 一键回滚说明写在 runbook。

## 5. 明确不做

- 不在无 nonce 时默认 `CSP_SCRIPT_UNSAFE_INLINE=0`。  
- 不为「Sentry 暂时 0 条」宣布 T9 完成。  
- 不把 style-src `'unsafe-inline'` 与 script 混改。

## 6. 相关代码

- `lib/csp.ts` — builders + flags + nonce  
- `next.config.ts` — 静态 CSP / `CSP_DYNAMIC` 跳过  
- `app/api/csp-report/route.ts` — 采样 + Sentry  
- `app/api/ga/route.ts` + `components/Analytics.tsx` — GA 外置  
- `scripts/audit-edge-scripts.mjs` — 边缘审计  
- `proxy.ts` — Admin 鉴权 + `CSP_DYNAMIC=1` 时动态 CSP/nonce（T9″）

## 7. 命令

```powershell
node scripts/probe-production.mjs --no-proxy --expect-commit <sha>
node scripts/audit-edge-scripts.mjs
pnpm exec vitest run tests/csp.test.ts tests/api-ga.test.ts tests/api-csp-report.test.ts
# Sentry UI: message:"csp-report:" OR tag source:csp-report
```
