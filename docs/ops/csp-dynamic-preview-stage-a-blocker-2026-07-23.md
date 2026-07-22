# CSP_DYNAMIC · Preview Stage A · 环境阻断书 · 2026-07-23

> **范围：** W2 ChronoPortal · 仅说明为何本会话 **未** 对 Vercel Preview 写入 `CSP_DYNAMIC=1`。  
> **禁止：** 生产 `CSP_DYNAMIC` / 去 `unsafe-inline` / 本阻断书不授权任何 Production 变更。

## 1. 结论（一句话）

**Stage A 未执行。** 本机对 `*.vercel.app` **TCP 连通失败**（connect timeout），在无法完成 runbook §2.3–2.4 冒烟的前提下，**故意不**写入 Preview env，避免留下无法验证的线上开关。

## 2. 权限 vs 连通性

| 项 | 结果 | 证据 |
| --- | --- | --- |
| Vercel CLI 登录 | **有** | `vercel whoami` → `xiej4352-5525` |
| Team / 项目 | **有** | scope `aijiai520` · project `nav-site` · Production URL `yuanjia1314.ccwu.cc` |
| Worktree link | **有** | `vercel link --project nav-site --scope aijiai520 --yes` → Linked（`.vercel/` gitignored） |
| Preview env 列表 | **可读** | `vercel env ls preview` 列出 AUTH/Supabase/…；**无** `CSP_DYNAMIC` / `CSP_SCRIPT_UNSAFE_INLINE` |
| Production env | **可读** | **无** `CSP_*` 变量（生产默认仍靠代码 `readCspFlags` → DYNAMIC off） |
| Preview 部署列表 | **可读** | 例：`https://nav-site-lk16isapm-aijiai520.vercel.app` · Ready · Preview |
| `GET *.vercel.app` | **失败** | connect timeout / connection reset（见 §3） |
| `GET` 生产自定义域 | **成功** | `/build-info.json` commit `46e71ec…` |

因此：W1 写的「无 `.vercel` / 无授权」**在 W2 已解除一部分**（CLI + 项目可见）；**真正阻断是本机到 Vercel 直连边缘的网络路径**，不是 Dashboard 无权限。

## 3. 失败复现（本机 · 2026-07-23）

```text
BASE=https://nav-site-lk16isapm-aijiai520.vercel.app
# DNS OK (114dns → 107.181.166.244 / IPv6 face:b00c…)
curl / node fetch → ConnectTimeoutError / curl exit 28
--resolve 到 107.181.166.244 → timeout
--resolve 到 76.76.21.21 → connection reset
ipv4first 仍 timeout

对照：
https://yuanjia1314.ccwu.cc/build-info.json → 200 JSON (commit 46e71ec…)
https://vercel.com HEAD → 200（控制面可达）
```

`pnpm run probe:headers -- --base-url <preview> --compare-repo --json` →  
`ok:false`, `reason:"fetch failed"`, exit **1**（非 canary block，是网络）。

## 4. 为何不「先加 env 再以后验」

| 若现在做 | 风险 |
| --- | --- |
| `vercel env add CSP_DYNAMIC preview --value 1` + redeploy | Preview 行为改变，本机无法跑 §2.3 头/nonce 与 §2.4 功能冒烟 |
| 失败时回滚依赖能访问 Preview | 同路径仍断 → 回滚验证也做不到 |
| 误触 Production | 本会话 **明确禁止**；且 Production 列表当前无 CSP_*（保持） |

**策略：** 阻断写 env；本地用 builder/proxy 契约 + vitest 作替代证据；网络恢复后由操作人按 runbook 重做 Stage A。

## 5. 本地替代证据（Stage A 形状）

| 检查 | 命令 / 结果 | Exit |
| --- | --- | --- |
| CSP 单元 | `pnpm exec vitest run tests/csp.test.ts` | **0**（12 tests，含 `CSP_DYNAMIC=1` attachment） |
| CSP report 路由 | `pnpm exec vitest run tests/api-csp-report.test.ts` | **0** |
| Headers probe 单测 | `pnpm exec vitest run tests/probe-security-headers.test.ts` | **0** |
| 动态 attachment 形状 | `node --experimental-strip-types` import `createDynamicCspAttachment({CSP_DYNAMIC:'1',…}, {nonce:'w2localnonce01'})` → `dynamic:true`, enforcing 含 `'nonce-…'` + 阶段 A 仍含 `'unsafe-inline'` | **0** |
| 边缘脚本（生产只读） | `node scripts/audit-edge-scripts.mjs` → mangled 0 · rocketLoaderHints false | **0** |

这些证明 **代码路径** 在 DYNAMIC=1 时会发 nonce CSP；**不能**替代 Preview 部署上的端到端 Stage A。

## 6. 解除阻断后的最短路径（操作人）

前置：能从执行机 `curl -sI https://<preview>.vercel.app/` 拿到 HTTP 头（非 timeout）。

1. **仅 Preview**：`CSP_DYNAMIC=1`（Dashboard 或 `vercel env add CSP_DYNAMIC preview --value 1 --scope aijiai520 --yes`）。**不要**勾 Production。  
2. Redeploy 某一 Preview deployment（或推 PR 触发）。  
3. `$BASE` = 该次 `*.vercel.app`（**≠** `yuanjia1314.ccwu.cc`）。  
4. 按 `docs/ops/csp-dynamic-preview-canary-2026-07-22.md` §2.3–2.4 勾选；失败只做 Preview R1/R2。  
5. 把 §8 执行记录填进 runbook；**生产仍** DYNAMIC off · unsafe-inline on。

可选 Stage B 仍仅 Preview，且须 Stage A 全绿。

## 7. 明确未做

| 动作 | 状态 |
| --- | --- |
| Preview `CSP_DYNAMIC=1` | **未写** |
| Preview / Production `CSP_SCRIPT_UNSAFE_INLINE=0` | **未写** |
| Production 任何 CSP env | **未写** |
| push / 合默认分支 | **未做** |

## 8. 交叉引用

- Runbook：`docs/ops/csp-dynamic-preview-canary-2026-07-22.md`
- W1 报告：`docs/ops/w1-arch-upgrade-chronoportal-claude.md`
- W2 报告：`docs/ops/w2-arch-upgrade-chronoportal-claude.md`
- T9 决策：`docs/csp-t9-decision-2026-07-22.md`
