# Scout 回执 → cp-coord · 2026-07-24

```text
module: M-CP-scout-lw
status: DONE
workspace-status: in-review
debt_artifacts:
  - docs/ops/cp-long-wave/DEBT.md
  - docs/ops/cp-long-wave/DISPATCH.md
  - docs/ops/cp-long-wave/progress.md
branch: xvyimu/cp-scout-lw
base_tip_scanned: df11a2f2
implementation: NOT_STARTED
prod_csp_flip: NOT_EXECUTED
rls_flip: NOT_EXECUTED
push: NOT_DONE
```

## 风险一句

Preview `*.vercel.app` 仍 TCP timeout（curl 28）+ 生产 runtime 钉 `46e71ec`（落后 tip）→ CSP Stage A/生产闭环双阻断；DB 最高风险仍是 `model_rankings` public 写（人 gate）。

## 探针

| 目标 | 结果 | exit / 码 |
|------|------|-----------|
| `yuanjia1314.ccwu.cc/build-info.json` | 200 · `46e71ec38e3828b892058f7e059f88478807434b` | 0 |
| `yuanjia1314.ccwu.cc/` HEAD | 200 · CSP static + `unsafe-inline` · XFO SAMEORIGIN · Referrer same-origin | 0 |
| `yuanjia1314.ccwu.cc/api/health` | healthy · resourceLibrarySearch **error** | 0 |
| `yuanjia1314.ccwu.cc/robots.txt` | 200 | 0 |
| Preview `nav-site-lk16isapm-aijiai520.vercel.app` | connection timed out | **28** |
| `pnpm typecheck` | **SKIP**（无 `node_modules` · 禁装依赖） | n/a |

## 建议 G0 后首派（见 DISPATCH §3）

1. **M-CP-stage-a-net** — 解 Preview 网  
2. **M-CP-prod-deploy** — tip 安全修上生产  
3. **M-CP-rls-rankings** — 非生产演练→人 gate flip  

## 总控动作请求

- 审 DEBT + DISPATCH  
- 人口令 G0（A/B/C/D/E + 验证深度）后再派 ≤3 live 模块 wt  
- 本 scout **停** · 不实现模块  
