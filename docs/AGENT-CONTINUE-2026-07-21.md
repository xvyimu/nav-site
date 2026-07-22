# ChronoPortal · Agent 续作与诊断（更新 2026-07-22）

> 给下一个 agent（或未来的自己）的接力说明。  
> **先读本文件**；深度方案仍见 `docs/research/2026-07-21-integrated-master-research.md`（方案 R）。  
> 产品 GitHub 名 **ChronoPortal**；npm / 历史路径可称 nav-site。

## 0. 当前终态事实（2026-07-22 实测）

| 项 | 值 |
|----|-----|
| CWD | `D:\ChronoPortal` ≡ `D:\nav-site` |
| origin/master = 生产 runtime | **`a1e5c7f6`** · deploy `dpl_EwZKkesa8YjRHwVwb1EEXFmqGpvm` |
| 生产入口 | `https://yuanjia1314.ccwu.cc` |
| 探针 | home/health/search/tool/sitemap/robots/build-info **全 PASS**（`--no-proxy`） |
| 限流 | Upstash **ok** + `DISTRIBUTED_RATE_LIMIT_FAIL_CLOSED` |
| embedding | Cloudflare Workers AI bge-m3 **1024-d** ok |
| CSP | Enforcing（script **仍有** `unsafe-inline`）+ Report-Only（无 inline，`report-uri /api/csp-report`）→ 采样 **logger + Sentry** |
| typecheck | **干净**（`3abf5eca` 已清测试债） |
| 工作树 | 以 push 后为准；docs hygiene 可能 ahead |

### 本轮已合入（master）

| commit | 内容 |
|--------|------|
| `3abf5eca` | fix(types): 测试 ProcessEnv / JSDoc，清 tsc 债 |
| `a1e5c7f6` | feat(csp): report-only 采样 mirror 到 Sentry `captureMessage` |

### 验证结论

| 项 | 结论 |
|----|------|
| Admin 写→前台秒更 | **本地 dev + prod 库写测 PASS**（~300ms 首页见新标题，已还原）。生产脚本登录因 CSRF cookie 未自动化；代码已在生产路径。 |
| CSP T9 去 inline | **暂缓**。生产 HTML ~17 inline script + GA 路径；RO 在采。Sentry 过滤：`message:"csp-report:"` 或 tag `source:csp-report`。 |

## 1. 不可动的架构不变式（ADR）

1. 单 Next 部署，不拆微服务。  
2. RSC 直连 repository，不经自身 HTTP。  
3. Admin：UI → `lib/admin/client.ts` → Route Handler → repository（ADR-009；`tests/admin-boundary.test.ts`）。  
4. 搜索：薄 route + `lib/search/use-case.ts::executeSearch` + 可选 `SearchAdapters`（ADR-004）。  
5. 数据访问经 `lib/repositories` facade → domain modules（ADR-003/006）。  
6. 生产密码只认 `ADMIN_PASSWORD_HASH`；生产 embed 默认 CF 1024-d。  

**禁止：** 改分层边界 / 拆微服务 / 无阈值上 Meili·ES·虚拟列表 / 公开路径 service_role 读明细 / 把纯 docs commit 当必须 redeploy 的 runtime。

## 2. 环境与陷阱（务必先读）

- 三库：**nav-prod** `vyqqbypwrbdcafanzwmj`（业务）/ **nav-dev** `nzaocqwumlmbewoddysd`（记忆）/ **rl** `ihnmfsfbfnctgkhxmghk`（爬取）。  
- **key 串库陷阱**：User env `SUPABASE_SERVICE_ROLE_KEY` 常是 **RL**。对 nav-prod 写库/persist 用 `SUPABASE_PROD_SERVICE_ROLE` 或 `.env.local` 的 prod key。  
- **DB 直连**：`SUPABASE_NAV_DATABASE_URI`（pooler **6543**，`postgres.vyqq…`）；`SUPABASE_DATABASE_URI`/`_RL_` 是 RL，**勿覆盖**。  
- **DDL**：`mcp.supabase.com` 可能被 CF 1010；改用 Management API + `SUPABASE_PROD_MCP_PAT` + 浏览器 UA。  
- 单测若 User env 挂生产 `UPSTASH_*`，limiter 打真 Redis → 测前 unset。  
- **生产探针代理**：本机 `127.0.0.1:7890` 常 down；硬设 `HTTPS_PROXY` 会让 undici 全挂。优先：  
  `node scripts/probe-production.mjs --no-proxy --expect-commit <shortsha>`  
- `docs/PROGRESS.md` §〇 等历史 tip **过期**；以 **build-info + 本文件 + handoff** 为准。

## 3. 已完成（累计，摘要）

C1 favorites 权限纵深 · C2 文档 SSOT · C3 死链→Admin · Upstash+FAIL_CLOSED · CSP Report-Only · Admin revalidate + 乐观更新 · Dependabot overrides · 书签 HTML 导入 · 五层内部优化 · ChronoPortal 身份 · typecheck 债 · **CSP report→Sentry** · Admin 秒更本地写测。

## 4. 下一步候选

| # | 事项 | 类型 | 就绪度 | 备注 |
|---|------|------|--------|------|
| B″ | 读 Sentry CSP 样本后评估 T9 | 安全 | 等 1–2 天 | **勿盲去** `unsafe-inline`；先 nonce 或足够证据 |
| A′ | 浏览器生产 Admin 秒更 | 验证 | 可选 | 本地已 PASS |
| D | Admin 审核 AI 建议标签 | 产品 P2 | 需 spec | 只建议、人确认 |
| E | 死链周报节奏 | 运营 | 需 spec | 不改 check-links 算法 |
| F | favorites DB 级 JWT/RPC | 安全 P1 | 需迁移 | C1 应用层 follow-up |

**明确延后：** Fuse 全量池拆分（链接>2k 或 p95 升）· 虚拟列表（单分类>800 或 INP 恶化）· i18n · 支付 · PWA。

## 5. 常用命令

```powershell
# 生产探针 + commit 对齐（推荐 --no-proxy）
node scripts/probe-production.mjs --no-proxy --expect-commit a1e5c7f6
node -e "fetch('https://yuanjia1314.ccwu.cc/build-info.json').then(r=>r.json()).then(console.log)"

# 全量测试（先 unset UPSTASH 防假失败）
$env:UPSTASH_REDIS_REST_URL=$null; $env:UPSTASH_REDIS_REST_TOKEN=$null
pnpm test
pnpm typecheck

# 死链检测 + 入库（用 nav-prod service role）
$env:SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_PROD_SERVICE_ROLE
node scripts/check-links.mjs --report --json --persist

# 部署
npx vercel deploy --prod --scope aijiai520
```

Sentry CSP：`message:"csp-report:"` 或 tag `source:csp-report`。

## 6. 恢复协议

| SSOT | 路径 |
|------|------|
| 本文件 | `docs/AGENT-CONTINUE-2026-07-21.md` |
| Continuity | `~/agent-memory/continuity/projects/nav-site.md` |
| Memory handoff | `nav-site-handoff-2026-07-21.md` |
| README | 仓库根 `README.md` |

新会话说「继续 nav-site」/「继续 ChronoPortal」即可。  
冲突仲裁：**Policy > Continuity > mem0 > facts**。
