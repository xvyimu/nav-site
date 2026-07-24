# Code-review findings triage · ChronoPortal · 2026-07-24

**源：** `D:\orca\.planning\portfolio-stack-policy-2026-07-24\code-review\chronoportal-findings.md`  
**总控：** `cp-coord` · **禁** push master · **禁** 生产 CSP flip / D7

## P0

| id | 结论 |
|----|------|
| （无） | 审查声明 **无新 P0** 鉴权绕过 |

## P1 处置

| id | 主题 | 处置 | wt / 备注 |
|----|------|------|-----------|
| **CP-CR-001** | 生产 CSP unsafe-inline residual | **DEFER 人 gate** · 不派生产 flip | 已有 T9 文档；W9 已做 NOT_RELAXED 观测加固 `11520432` |
| **CP-CR-002** | 无 Upstash → 进程内限流 | **DONE** docs | **`ddb6d664`** `cp-cr-rate-limit-ops` rm |
| **CP-CR-003** | 登录限流 DB 路径 ops 确认 | **DONE** 并入 CR-002 | 同上 |
| **CP-CR-004** | service_role 应用层纪律 | **DONE** 清单 | **`faab2a7b`** `cp-cr-service-role-checklist` rm |
| **CP-CR-005** | 公开 submit CSRF/脚本面 | **DONE** docs | **`c69517f4`** rm |
| **CP-CR-006** | Netlify CSP 漂移 | **queued** P2 | `cp-cr-netlify-drift` |
| **CP-CR-BUILD** | csp-report route 导出 `toPathOnlyUri` → next build 红 | **DONE** | **`a8eb537a`** · vitest6 · **build0** · rm |

## P2

CI soft gates / next-auth beta / eslint-config 微差 → W11 verify / 后续；不阻塞本波。

## 与 WEEK 波次关系

- W9 观测（csp-report 脱敏）**已收** · 覆盖 CR-001 residual 的观测侧，**不**等于 cutover  
- W11 long-verify ≈ findings `cp-cr-verify`  
- 本批 CR wt **不**并入已收 W6–W8 代码面（revalidate/search/webpack 已 push feature）
