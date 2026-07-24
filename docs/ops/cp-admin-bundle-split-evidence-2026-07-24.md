# M-CP-admin-bundle-split · evidence · 2026-07-24

> **wt：** `cp-admin-bundle-split` · branch `xvyimu/cp-admin-bundle-split`  
> **红线：** 未 push master · 未改 Admin 业务逻辑 · 未动 CSP/RLS/webpack

## 0. 一句话

`/admin/categories` 与 `/admin/link-health` 对 `CategoryManager` / `LinkHealthPanel` 使用 `next/dynamic`，与 `AdminWorkspace` 已有 `LinkForm` dynamic 模式对齐。

## 1. 变更

| 文件 | 改动 |
|------|------|
| `app/admin/categories/page.tsx` | dynamic CategoryManager + loading 骨架 |
| `app/admin/link-health/page.tsx` | dynamic LinkHealthPanel + loading 骨架 |

**未改：** CategoryManager/LinkHealthPanel 内部 CRUD · 鉴权条件 · package scripts。

## 2. 验证

| 命令 | exit |
|------|------|
| `pnpm exec vitest run tests/admin-boundary.test.ts` | （收工实跑） |

## 3. 风险一句

dynamic 增加一次懒加载瀑布；换的是首包体积，非 SSR 数据预取（link-health SSR 在 W1 feature 支，本 base 未叠）。

## 4. 状态

```text
module: M-CP-admin-bundle-split
status: DONE
push_master: NOT_DONE
```
