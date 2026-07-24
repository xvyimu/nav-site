<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ChronoPortal — Agent 入口

| 项 | 值 |
|----|-----|
| GitHub | [xvyimu/ChronoPortal](https://github.com/xvyimu/ChronoPortal) |
| 本地 | `D:\ChronoPortal` · 入口 `D:\projects\ChronoPortal` |
| 生产 | https://yuanjia1314.ccwu.cc |
| package name | private `nav-site`（≠ GitHub 身份） |

## 先读

1. **[`docs/PROJECT.md`](./docs/PROJECT.md)** — **形态与栈 SSOT**（Web 导航门户 + Next/Supabase 唯一栈）  
2. 续作：[`docs/AGENT-CONTINUE-2026-07-21.md`](./docs/AGENT-CONTINUE-2026-07-21.md)  
3. 根 [`README.md`](./README.md) · 身份 [`GITHUB_IDENTITY.md`](./GITHUB_IDENTITY.md)  
4. 全局门闩：形态/栈未入档 → 禁业务编码（`~/CLAUDE.md` §8）

## 硬约束（摘要）

- `pnpm dev` / `pnpm build` **必须**带 `--webpack`（端口 **3264**；**禁止**改默认 bundler 为 Turbopack）
  - 契约测：`tests/webpack-scripts-lock.test.ts`
  - 栈 SSOT：[`docs/PROJECT.md`](./docs/PROJECT.md)
- 数据写路径经 repository / domain（见 docs ADR）
- 小修不重选型；换栈先 ADR + 改 PROJECT.md  
