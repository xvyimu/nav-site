# CP webpack lock docs · evidence · 2026-07-24

> **模块：** M-CP-webpack-lock-docs · **WEEK：** W8  
> **分支：** `xvyimu/cp-webpack-lock-docs`  
> **范围：** package.json scripts 锁 `--webpack` + 文档双锁 + vitest 防漂移  
> **禁止已守：** push master · 改默认 bundler 为 turbopack · 放宽 CSP · 空口完成

## As-found

| 项 | 状态 |
|----|------|
| `package.json` `scripts.dev` | `next dev -p 3264 --webpack` ✅ |
| `package.json` `scripts.build` | `… next build --webpack` ✅ |
| `scripts/analyze.mjs` | 经 `pnpm run build` 继承 `--webpack` ✅ |
| `docs/PROJECT.md` | 栈表 + 防漂移已写 webpack 锁 ✅ |
| `AGENTS.md` | 硬约束已写 `--webpack` ✅（本刀补 build + 契约测指针） |
| 契约测 | **本刀新增** `tests/webpack-scripts-lock.test.ts` |

脚本本身在基线已锁；本刀补**可回归的契约测**与文档交叉引用，防止 Next 16 Turbopack 默认漂移时无声去掉 `--webpack`。

## Diff（最小）

| 文件 | 动作 |
|------|------|
| `tests/webpack-scripts-lock.test.ts` | **new** · 断言 `dev`/`build` 含 `--webpack`、无 `--turbopack`、dev 端口 3264；`analyze` 走 locked build |
| `AGENTS.md` | 硬约束补 `build` + 契约测 / PROJECT 指针 |
| `docs/PROJECT.md` | 栈表约束补契约测路径 + 禁 Turbopack 默认 |
| `docs/ops/cp-webpack-lock-docs-evidence-2026-07-24.md` | 本证据 |

**未改：** `package.json` scripts（已合规）· `next.config.ts` · CSP · 业务代码。

## Verification

| 命令 | Exit | 结果 |
|------|-----:|------|
| `pnpm exec vitest run tests/webpack-scripts-lock.test.ts` | **0** | 1 file · **2/2 pass** |
| `pnpm typecheck` | **2** | **既有** `tests/probe-security-headers.test.ts` ProcessEnv 债（PRODUCT-LAYERS L4 已记）；**与本刀无关** · 本刀未触该文件 |
| `git diff --check` | **0** | 无 whitespace error |

As-found scripts（未改 package.json）：

```text
"dev": "next dev -p 3264 --webpack"
"build": "node scripts/write-build-info.mjs && next build --webpack"
```

## Risk（一句）

低：仅契约测 + 文档交叉引用；若未来合法迁 Turbopack，须先 ADR + 改 PROJECT/AGENTS + 更新本测，不可先改 scripts。

## Stop

DONE · in-review · feature push OK（不 push master）。
