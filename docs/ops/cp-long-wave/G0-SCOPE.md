# G0 范围锁定 · 2026-07-24

**授权：** 人闸消息 · ChronoPortal 产品仓总控  
**过滤源：** Phase0 [`DEBT.md`](./DEBT.md) + [`DISPATCH.md`](./DISPATCH.md) + `docs/frontend-perf-optimization-2026-07-18.md`

## IN

| 面 | 内容 |
|----|------|
| 前台 P0 | 07-18 G1–G6 **已落地** → 本波 **复核/补测/残余可量化稳定**；不重做已完成动画/remount 方案 |
| Admin 瀑布 P1 | link-health 客户端冷拉瀑布；layout+page 重复 `auth()`；明显串行 await（非 CRUD 功能重写） |
| 验证 | typecheck / vitest / build（webpack）本地 |
| 文档 | evidence · progress · 最终 INTEGRATE.md |

## OUT（本波 DEFER · 不派 live）

| ID 族 | 原因 |
|-------|------|
| D-CSP-01/02 Stage A/Prod | 网络 BLOCKED + 人 gate 生产 flip |
| D-RLS-* | 须「RLS flip 现在」 |
| D-HDR-01 平台头 | 平台层 · 非本波 |
| D-OPS-01 prod deploy | 须人授 vercel --prod |
| 全量 Admin UX 重写 | 人明确排除 |
| push / merge master | 总控不执行 |

## 首派

**M-CP-admin-lh-ssr** → wt `cp-admin-lh-ssr`
