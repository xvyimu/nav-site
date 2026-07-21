# nav-site · Agent 续作与诊断文档（2026-07-21）

> 给下一个 agent（或未来的自己）的接力说明。**先读本文件 + `docs/research/2026-07-21-integrated-master-research.md`（万字调研，方案 R 为准）**。

## 0. 当前终态事实（E0 实测）

| 项 | 值 |
|----|-----|
| CWD | `D:\ChronoPortal` |
| origin/master = 生产 runtime | **`bf3d976f`** · deploy `dpl_BLFm7Pi…` |
| 生产入口 | `https://yuanjia1314.ccwu.cc` |
| 探针 | home/health/search/tool/sitemap/robots **全 PASS** |
| 限流 | Upstash **ok** + `DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED=1` |
| embedding | Cloudflare Workers AI bge-m3 **1024-d** ok |
| CSP | Enforcing（含 script `unsafe-inline`）+ **Report-Only**（无 inline，`report-uri /api/csp-report`） |
| 死链队列 | `link_health_findings` open = **0** |
| 工作树 | clean · 与 origin 同步 |

## 1. 不可动的架构不变式（ADR）

1. 单 Next 部署，不拆微服务。
2. RSC 直连 repository，不经自身 HTTP。
3. Admin：UI → `lib/admin/client.ts` adapter → Route Handler → repository（ADR-009 seam；`tests/admin-boundary.test.ts` 守卫）。
4. 搜索：薄 route + `lib/search/use-case.ts::executeSearch` + 可选 `SearchAdapters`（ADR-004）。
5. 数据访问经 `lib/repositories` facade → `lib/repositories/*` domain modules（ADR-003/006）。
6. 生产密码只认 `ADMIN_PASSWORD_HASH`；生产 embed 默认 CF 1024-d。

**禁止：** 改分层边界 / 拆微服务 / 无阈值上 Meili·ES·虚拟列表 / 公开路径 service_role 读明细 / 把 docs commit 当 runtime commit。

## 2. 环境与陷阱（务必先读）

- 三库：**nav-prod** `vyqqbypwrbdcafanzwmj`（业务）/ **nav-dev** `nzaocqwumlmbewoddysd`（记忆）/ **rl** `ihnmfsfbfnctgkhxmghk`（爬取）。
- **key 串库陷阱**：User env `SUPABASE_SERVICE_ROLE_KEY` 常是 **RL**。凡对 nav-prod 写库/persist，必须改用 `SUPABASE_PROD_SERVICE_ROLE` 或 `.env.local` 的 prod key，否则 `Invalid API key`。
- **DB 直连**：`SUPABASE_NAV_DATABASE_URI`（User env，pooler **6543**，`postgres.vyqq…`）已配；`SUPABASE_DATABASE_URI`/`_RL_` 是 RL，**勿覆盖**。
- **DDL 通道**：`mcp.supabase.com` 可能被 CF 1010；改用 `POST https://api.supabase.com/v1/projects/<ref>/database/query`（带浏览器 UA + `SUPABASE_PROD_MCP_PAT`）。
- 单测若 User env 挂着生产 `UPSTASH_*`，limiter 会打真 Redis 造成假失败 → 测前临时 unset。
- 已知预存债：`tsc` 3 条错误全在测试文件（`check-launch-readiness.test.ts` ProcessEnv、`link-health-report.test.ts` 参数形状），与业务无关。

## 3. 已完成（2026-07-21 全天）

C1 favorites 权限纵深 · C2 文档 SSOT · C3 死链→Admin 闭环 · Upstash+FAIL_CLOSED · CSP Report-Only · Admin 实时 revalidate+乐观更新+视觉 token · Dependabot 4 high(js-yaml/brace-expansion overrides) · 书签 HTML 导入 · 五层内部优化（L1 DTO 解耦 / L2 loadEnv 去重 / L3 filtered-Fuse 有界缓存 / L5 边界测试）。

## 4. 下一步候选（按收益/风险排序）

| # | 事项 | 类型 | 就绪度 | 备注 |
|---|------|------|--------|------|
| A | 手测 Admin 写→前台秒更 | 验证 | 立即 | 隐身开首页看是否秒级刷新 |
| B | CSP T9：观察 report-only 样本后去 `unsafe-inline` | 安全 | **等 1–2 天样本** | 有真实违规再动，否则盲改 |
| C | 修 tsc 预存 3 条测试类型错误 | 债 | 立即 | 干净，不影响运行 |
| D | Admin 审核 AI 建议标签（只建议、人确认） | 产品 P2 | 需 spec | 借 Karakeep；挂审核流不自动写 |
| E | 死链周报节奏（CI schedule + Admin） | 运营 | 需 spec | 借 OneNav；不改 check-links 算法 |
| F | favorites DB 级 JWT/RPC 强制（IDOR 纵深下一阶） | 安全 P1 | 需迁移 | C1 是应用层；DB 级是 follow-up |

**明确延后（有触发条件）：** Fuse 全量池拆分（链接>2k 或 p95 上升）· 虚拟列表（单分类>800 或 INP 恶化）· i18n · 支付 · PWA。

## 5. 常用命令

```powershell
# 生产探针 + commit 对齐
node scripts/probe-production.mjs
node -e "fetch('https://yuanjia1314.ccwu.cc/build-info.json').then(r=>r.json()).then(console.log)"

# 全量测试（先 unset UPSTASH 防假失败）
$env:UPSTASH_REDIS_REST_URL=$null; $env:UPSTASH_REDIS_REST_TOKEN=$null
pnpm test

# 死链检测 + 入库（用 nav-prod service role）
$env:SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_PROD_SERVICE_ROLE
node scripts/check-links.mjs --report --json --persist

# 部署
npx vercel deploy --prod --scope aijiai520
```

## 6. 恢复协议

进度 SSOT：`~/agent-memory/continuity/projects/nav-site.md` + memory `nav-site-handoff-2026-07-21.md`。
新会话说「继续 nav-site」即可；冲突仲裁 **Policy > Continuity > mem0 > facts**。
