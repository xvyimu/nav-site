# Security headers DRIFT · 平台层处置建议 · 2026-07

> **Read-only 建议。** 不改 `next.config.ts` / `proxy.ts`、不改生产 Cloudflare / Vercel 控制台。  
> 承接：`docs/ops/headers-drift-trace-2026-07.md`（W1 溯源）。

## 1. 重申事实（W2 复测 · 生产自定义域）

```text
pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo --json
→ exit 0, HTTP 200
```

| Header | Repo (`next.config.ts`) | Live `yuanjia1314.ccwu.cc` | Verdict |
| --- | --- | --- | --- |
| `X-Frame-Options` | `DENY` | **`SAMEORIGIN`** | **DRIFT** |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | **`same-origin`** | **DRIFT** |
| `X-Content-Type-Options` | `nosniff` | `nosniff` | OK |
| `Permissions-Policy` | cam/mic/geo deny | match | OK |

附加 live-only：`x-xss-protection: 1; mode=block`、`expect-ct: max-age=86400, enforce`、`Server: cloudflare`、`x-vercel-*` 仍在。  
`/build-info.json` 仍为 commit **`46e71ec…`**（源码已是 DENY / strict-origin；**不是**旧 commit 写了 SAMEORIGIN）。

**结论不变：** 覆盖层在 **平台/边缘**，不是「补一行 Next headers」能假装修掉的。

## 2. 分层责任（SSOT 模型）

```text
Browser
  → Cloudflare (custom domain proxy)     ← 优先怀疑：Transform / Managed Headers / 旧 Page Rules
  → Vercel edge / project Headers        ← 次要：Project Settings → Headers；无 repo vercel.json
  → Next securityHeaders (next.config)   ← 合同源；XFO DENY · Referrer strict-origin-when-cross-origin
  → proxy.ts                             ← 仅 CSP_DYNAMIC；不写 XFO/Referrer
```

| 层 | 应拥有 | 当前可疑行为 |
| --- | --- | --- |
| App (repo) | XFO / Referrer / CSP builders 的 **意图合同** | 合同正确；勿为迁就 live 改弱 |
| Vercel | 部署、可选 project headers | 无 in-repo `vercel.json` headers；需 UI 确认无隐藏覆盖 |
| Cloudflare | DNS/TLS/WAF；**若**要改头须书面且可回滚 | `Server: cloudflare` + 额外 expect-ct / X-XSS-Protection 强烈暗示边缘参与 |

## 3. 处置原则（未证明层前）

| 做 | 不做 |
| --- | --- |
| 用 **无自定义域的 Preview `*.vercel.app`** 做对比探针（绕过 CF） | 在 Next 里把 XFO 改成 `SAMEORIGIN`「对齐生产」 |
| 证明层后再开变更单（一层一次） | 同时改 CF + Vercel + Next（无法归因） |
| 保留 repo 合同为更强姿态（DENY / strict-origin…） | 无回滚地清 CF 规则 |
| 记录 `cf-cache-status` / `x-vercel-id` / deploy commit | 把 DRIFT 当成 CSP_DYNAMIC 故障 |

## 4. 推荐证明序（操作人 · 网络可达时）

> W2 本机：**`*.vercel.app` connect timeout**（见 `csp-dynamic-preview-stage-a-blocker-2026-07-23.md`）。下列步骤在 **能 curl Preview** 的环境执行。

### P1 — Preview 无自定义域（区分 H1 CF vs H2 Vercel）

```powershell
$BASE = "https://nav-site-<deployment>-aijiai520.vercel.app"  # 绝非生产域
pnpm run probe:headers -- --base-url $BASE --compare-repo --json
```

| 结果 | 推断 | 下一动作 |
| --- | --- | --- |
| Preview **匹配** repo（XFO DENY、Referrer strict-origin…） | **H1：CF/自定义域层** 覆盖生产 | 进 P2 CF 审计 |
| Preview **同样 DRIFT** | **H2：Vercel project / 框架发射** | 进 P3 Vercel 审计 |
| Preview 不可达 | 本机网络阻断；换出口或 CI runner 再测 | 不改生产 |

### P2 — Cloudflare（仅当 P1 指向 H1）

操作人在 zone（`ccwu.cc` / 相关）只读导出：

1. **Transform Rules**（Response Header Modification）是否写 `X-Frame-Options` / `Referrer-Policy`  
2. **Managed Transforms / Security Headers** 类产品是否启用  
3. 遗留 **Page Rules** / Configuration Rules  
4. 与 `expect-ct`、`X-XSS-Protection` 同源的规则（旁证边缘头注入）

**建议修复方向（人 gate 后）：** 删除或收窄把 XFO 设为 `SAMEORIGIN`、把 Referrer 设为 `same-origin` 的规则，使源站 Next 合同透出；或 **若业务故意要 SAMEORIGIN**，则 **反向改 repo 合同并 ADR**，而不是静默双源。

回滚：规则 diff 截图 + 一键关规则 + `probe:headers --allow-production --compare-repo`。

### P3 — Vercel（仅当 P1 指向 H2）

1. Project **Settings → Headers**（及 Environment 级覆盖）是否声明 XFO/Referrer  
2. `vercel inspect <deployment>` / Dashboard 响应头对比  
3. 确认无团队级共享 headers 策略

**建议修复方向：** 去掉与 repo 冲突的 project headers；保持 `next.config.ts` 为唯一应用层 SSOT。

### P4 — 排除缓存幻觉（可选）

在 owner 批准下 purge 自定义域缓存后再 probe；W1 已见 MISS 仍 DRIFT，**优先仍当改写而非纯缓存**。

## 5. 目标态（平台处置完成后）

| 模式 | 条件 | 验收 |
| --- | --- | --- |
| **A. 源站合同胜出（推荐）** | CF/Vercel 不再改写 XFO/Referrer | 生产 `probe:headers --compare-repo` 四行全 match；可保留无害平台头或一并清理 expect-ct/X-XSS 若政策允许 |
| **B. 平台故意更严/不同** | 书面 ADR：平台为 SSOT，repo 对齐或文档「已知例外」 | matrix 与 AS-IS 文档更新；CI 可用 allowlist 而非假绿 |

当前 **未** 选 A/B——缺 P1 证据（Preview 网络）。

## 6. 与 CSP canary 的关系

| 主题 | 关系 |
| --- | --- |
| XFO / Referrer DRIFT | **正交**于 `CSP_DYNAMIC`；Stage A 不修复 DRIFT |
| 生产 CSP flip | W3 + 人 gate；不依赖本 DRIFT 关闭 |
| Preview headers 探针 | 同一 `$BASE` 可顺带 `--compare-repo`，一举两用 |

## 7. 工单模板（给平台操作人）

```text
标题: [CP] 消除 yuanjia1314.ccwu.cc XFO/Referrer 相对 next.config DRIFT
证据: docs/ops/headers-drift-trace-2026-07.md + 本文件 §1
预证: P1 Preview compare-repo（附件 JSON）
怀疑层: CF Transform / Vercel Headers（按 P1 结果二选一）
变更: 仅一层；禁止同时改 Next 合同
回滚: 规则/UI 截图 + probe 复跑
验收: compare-repo XFO+Referrer match=true 或书面模式 B ADR
禁止: 生产 CSP_DYNAMIC、RLS、无批准 purge 以外的 DNS 变更
```

## 8. 交叉引用

- `docs/ops/headers-drift-trace-2026-07.md`
- `docs/ops/security-headers-as-is-target-2026-07-22.md`
- `docs/ops/security-headers-matrix-2026-07-22.md`
- `docs/ops/csp-dynamic-preview-stage-a-blocker-2026-07-23.md`
- `docs/ops/w2-arch-upgrade-chronoportal-claude.md`
