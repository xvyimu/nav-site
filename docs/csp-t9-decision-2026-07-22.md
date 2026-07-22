# CSP T9 评估 · 2026-07-22（含 T9′ / T9″ 落地）

> **Enforcing 默认结论不变：暂不**去掉 `script-src 'unsafe-inline'`。  
> T9′：**可回滚开关 · GA 外置 · CSP builder · 边缘审计**。  
> T9″：**proxy/layout 已接 nonce**；生产默认 `CSP_DYNAMIC=off`；preview 可金丝雀 `CSP_DYNAMIC=1` + `CSP_SCRIPT_UNSAFE_INLINE=0`。  
> 生产 tip 以 `/build-info.json` 为准。

## 0. 交付清单

| # | 前置 | 状态 | 实现 |
|---|------|------|------|
| 1 | Nonce / strict-dynamic 管道 | **T9″ 已接线（flag 门闩）** | `lib/csp.ts` builders + `createDynamicCspContext`；`proxy.ts` 在 `CSP_DYNAMIC=1` 时发 `x-nonce` + CSP；`app/layout.tsx` 透传 Script/Theme/JSON-LD；`next.config` 在 dynamic 时跳过静态 CSP |
| 2 | GA 外置 | **已做** | `components/Analytics.tsx` → gtag.js + **`/api/ga?id=`**，**无** inline bootstrap；支持 `nonce` prop |
| 3 | 边缘 script 改写排查 | **已清除** | 2026-07-22：`rocket_loader` **off** · mangled **0** · 见 `docs/cloudflare-edge-csp-hardening-2026-07-22.md` |
| 4 | 样本窗口 | **通道在线** | RO + `/api/csp-report` → 采样 Sentry `source:csp-report` |
| 5 | 回滚开关 | **已做** | 见 §Env |

### Env 开关

| 变量 | 默认 | 作用 |
|------|------|------|
| `CSP_REPORT_ONLY` | on（`0` 关） | Report-Only 头 |
| `CSP_SCRIPT_UNSAFE_INLINE` | **on**（`0` 去掉） | Enforcing 是否含 script `'unsafe-inline'` |
| `CSP_DYNAMIC` | **off** | 为 1 时 next.config 不发 CSP；proxy 发动态 CSP + `x-nonce`；layout 消费 nonce |

回滚去 inline 失败：设回 `CSP_SCRIPT_UNSAFE_INLINE=1`（或不设）并 redeploy。  
回滚动态路径：去掉 `CSP_DYNAMIC` 或设 `0` 并 redeploy（回静态 next.config CSP）。

## 1. 样本通道状态

| 通道 | 状态 | 说明 |
|------|------|------|
| Report-Only 头 | **在线** | `script-src` **无** `'unsafe-inline'`；`report-uri /api/csp-report` |
| Enforcing 头 | **在线** | 默认 **含** `'unsafe-inline'`（可用 env 关掉） |
| `/api/csp-report` | **204** | 限流 + 1/20 采样；`logger.warn` + Sentry |
| Vercel Logs | 可见 POST 204 | 无 body 摘要 |
| Sentry Issues API | 需 `SENTRY_AUTH_TOKEN` | UI：`message:"csp-report:"` / tag `source:csp-report` |

## 2. 生产 HTML 结构（决定性）

对 `GET /` 在 T9′ **前**实测过：

| 指标 | 值 |
|------|-----|
| 无 `src` 的 `<script>` | **~17** |
| 含边缘改写 type | 常见 `*-text/javascript`（**现 mangled=0**） |
| GTM/GA | 有；**现已改为外置** `/api/ga` |
| JSON-LD | layout 内联 `application/ld+json`（现可挂 nonce） |

### 若 `CSP_SCRIPT_UNSAFE_INLINE=0` 且无 nonce

仍会拦 Next 运行时 / theme 内联脚本。**必须** `CSP_DYNAMIC=1` 且 layout 已接线（T9″ 代码侧已满足）。

## 3. 决策

| 问题 | 答案 |
|------|------|
| 默认能否去掉 Enforcing `'unsafe-inline'`？ | **否**（默认 flag 仍为 on） |
| GA 是否还阻塞？ | **代码层已解** |
| 代码侧 nonce 管道？ | **T9″ 已接**（需 env 打开 dynamic） |
| 下一步 | Preview 金丝雀观察 → 再生产切换 |

## 4. Cutover 清单

1. ~~Middleware/proxy 挂动态 CSP + nonce，layout 透传~~ **代码完成（T9″）**  
2. 确认生产 HTML 无 inline gtag；`audit-edge-scripts.mjs` mangled=0  
3. Sentry `csp-report` 聚类 1–2 天可解释  
4. **Preview：** `CSP_DYNAMIC=1` + `CSP_SCRIPT_UNSAFE_INLINE=0` 冒烟（首页 / 搜索 / Admin / GA）  
5. 生产切换 + 一键回滚（env）写在 runbook  

## 5. Preview 金丝雀（人工）

```text
Vercel Preview env:
  CSP_DYNAMIC=1
  CSP_SCRIPT_UNSAFE_INLINE=0
```

验收：

- 响应头 `Content-Security-Policy` 含 `'nonce-…'` + `'strict-dynamic'`  
- HTML 中 Script / theme 带相同 nonce  
- 控制台无 CSP 阻断首页交互；GA network 有 gtag + `/api/ga`  
- Sentry `source:csp-report` 可解释  

回滚：删除两 env 或 `CSP_SCRIPT_UNSAFE_INLINE=1` + redeploy。

## 6. 明确不做

- 不在无观察窗口时默认生产 `CSP_SCRIPT_UNSAFE_INLINE=0`  
- 不为「Sentry 暂时 0 条」宣布 T9 完成  
- 不把 style-src `'unsafe-inline'` 与 script 混改  

## 7. 相关代码

- `lib/csp.ts` — builders + flags + nonce + `createDynamicCspContext`  
- `next.config.ts` — 静态 CSP / `CSP_DYNAMIC` 跳过  
- `proxy.ts` — Admin 鉴权 + 动态 CSP（`CSP_DYNAMIC=1`）  
- `app/layout.tsx` / `components/Analytics.tsx` / `ThemeProvider.tsx` — 消费 `x-nonce`  
- `app/api/csp-report/route.ts` — 采样 + Sentry  
- `app/api/ga/route.ts` — GA 外置  
- `scripts/audit-edge-scripts.mjs` — 边缘审计  
- 方案：`docs/csp-t9-double-prime-plan-2026-07-22.md`  

## 8. 命令

```powershell
node scripts/probe-production.mjs --no-proxy --expect-commit <sha>
node scripts/audit-edge-scripts.mjs
pnpm exec vitest run tests/csp.test.ts tests/csp-proxy.test.ts tests/api-ga.test.ts tests/api-csp-report.test.ts
# Sentry UI: message:"csp-report:" OR tag source:csp-report
```
