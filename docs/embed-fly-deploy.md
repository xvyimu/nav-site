# 远程 Embedding 部署 — 本机原生 + Named Tunnel + Workers 反代

> 日期：2026-07-11  
> 关联：ADR-005、`scripts/embed-server.py`、`scripts/start-embed-native.ps1`、`scripts/start-embed-tunnel.ps1`、`workers/nav-site-embed-proxy.js`

## 目标

生产通过 **HTTPS + API Key** 调用同一份 BGE-small-zh-v1.5（512 维），**不静默丢到仅 FTS**。

## 当前架构（默认）

```text
Vercel production (nav-site-kappa.vercel.app)
  └─ EMBED_SERVER_URL=https://nav-site-embed-proxy.xiej4352.workers.dev
       └─ Worker nav-site-embed-proxy  (绕 zone Bot Fight / datacenter 403)
            └─ https://embed.aijiaqi.ccwu.cc
                 └─ Cloudflare Named Tunnel  nav-site-embed
                      └─ 本机 python embed-server  127.0.0.1:18003
```

| 组件 | 值 |
|------|-----|
| Hosting | Vercel Hobby · team aijiai520 · project nav-site |
| 生产别名 | https://nav-site-kappa.vercel.app |
| Embed origin | 本机 Python（**无 Docker**） |
| Tunnel | Named：`nav-site-embed` / id `7acf685a-67f8-4301-b680-2c4cd8001a72` |
| 固定域名 | https://embed.aijiaqi.ccwu.cc（本机/直连） |
| 生产入口 | https://nav-site-embed-proxy.xiej4352.workers.dev |
| 模型 | BAAI/bge-small-zh-v1.5 · 512-d |
| 密钥文件 | `.embed-api-key.local`（gitignore） |
| 凭证 | `%USERPROFILE%\.cloudflared\7acf685a-….json` + `cert.pem`（本机，勿提交） |

## 日常启停

```powershell
# 推荐：幂等一次拉起
powershell -NoProfile -File D:/nav-site/scripts/ensure-embed-stack.ps1

# 或分步
# 1) 原生 embed
powershell -NoProfile -File D:/nav-site/scripts/start-embed-native.ps1
# 2) Named Tunnel（会先探 origin，down 则自动拉 native）
powershell -NoProfile -File D:/nav-site/scripts/start-embed-tunnel.ps1

# 停
powershell -NoProfile -File D:/nav-site/scripts/stop-embed-tunnel.ps1
powershell -NoProfile -File D:/nav-site/scripts/stop-embed-native.ps1
```

**登录自启（当前用户）：**

```powershell
powershell -NoProfile -File D:/nav-site/scripts/install-embed-autostart.ps1
# 任务名 nav-site-embed-stack · AtLogOn + 90s · 日志 .embed-autostart.log
powershell -NoProfile -File D:/nav-site/scripts/uninstall-embed-autostart.ps1
```

验收：

```text
GET  http://127.0.0.1:18003/health
GET  https://embed.aijiaqi.ccwu.cc/health
GET  https://nav-site-embed-proxy.xiej4352.workers.dev/health   # 可用 UA: node
GET  https://nav-site-kappa.vercel.app/api/health               → embedding=ok
GET  https://nav-site-kappa.vercel.app/api/resource-search-status → vector:true
POST https://nav-site-kappa.vercel.app/api/resource-search  {"query":"...","mode":"vector"|"hybrid"}
```

## Sprint C 结论（云 embed · 2026-07-12 · 已由 2026-07-18 路径 B 取代）

历史「本机 BGE + Named Tunnel + Worker 反代」仍可用于 **Resource Library 512-d** 与本地开发。  
**主导航语义搜索生产默认**已切到 Cloudflare Workers AI（见下节）。

## T5 常开落地（2026-07-18 · 路径 B 已上线）

> 目标：本机关机时 production embedding 仍 `ok`。  
> **已达成：** `EMBED_PROVIDER=cloudflare` + `embedding_1024` 全量回填。

### 路径 B — Cloudflare Workers AI（**当前生产默认**）

```text
Vercel
  EMBED_PROVIDER=cloudflare
  CF_ACCOUNT_ID / CF_AI_API_TOKEN
  → REST @cf/baai/bge-m3 (1024-d)
  → RPC search_links_semantic_v2
  → nav_links.embedding_1024
```

| 项 | 状态 |
|---|---|
| 生产 health | ✅ `cloudflare embedding ready (1024-d)` · deploy `dpl_6GCemEkc…` |
| CF 凭证 | ✅ 用户长期 `cfut_` token + account `ceed74b0…`（User env / Vercel / `.env.local`，非 wrangler oauth） |
| 回填 | ✅ 512/512 `embedding_1024`（`--provider cloudflare --apply --batch-size 8`） |
| 语义 smoke | ✅ `search_links_semantic_v2` + `/api/search?semantic=true` hybrid |
| Preview | ✅ 同 env 已写 |
| 本机 BGE / Tunnel | 保留作 RL 512-d 与 fallback，**非主路径** |
| Fly/VPS | **不做主路径**（用户无 Fly 账单/VPS）；语义 24×7 已由 Workers AI 覆盖 |

回填（生产，需 CF token + service_role；默认 dry-run 加 `--apply`）：

```powershell
$env:CF_ACCOUNT_ID="..."
$env:CF_AI_API_TOKEN="..."
$env:SUPABASE_URL="https://vyqqbypwrbdcafanzwmj.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<prod service role>"
python scripts/backfill-embeddings.py --provider cloudflare --apply --batch-size 8 --max-retries 6
```

### 路径 A — 本机/VPS BGE（备援 · 512-d）

1. 常驻 Linux 或本机 `embed-server.py` @ `127.0.0.1:18003`  
2. Named Tunnel `nav-site-embed` + Worker 反代  
3. `EMBED_PROVIDER=embed-server` + `EMBED_SERVER_URL` / `EMBED_SERVER_API_KEY`  
4. 验证：`/api/health` → `embed service reachable`

### 本轮代码侧已具备

| 组件 | 状态 |
|---|---|
| embed-server + native 启停脚本 | ✅ |
| Named Tunnel + Worker 反代 | ✅ |
| ensure / autostart | ✅（2026-07-18 已装 `nav-site-embed-stack`） |
| 生产 env `EMBED_SERVER_URL` | ✅（指向 Worker；RL/备援） |
| 本机 origin 健康 | ✅ `127.0.0.1:18003` + tunnel/worker health ok（开机后，可选） |
| 主导航无本机 origin | ✅ Cloudflare Workers AI 1024-d（生产默认） |

一键：

```powershell
powershell -NoProfile -File D:\nav-site\scripts\bootstrap-embed-always-on.ps1
```

### 明确不在本轮自动执行

- 购买/登录云主机  
- 修改 Cloudflare Tunnel 路由  
- 修改 Vercel 生产 env  
- 全量 re-embed 到新模型维度  

需要负责人提供 VPS SSH 或明确「在这台机器上装 origin」后再执行路径 A 第 2–5 步。

### Fly 尝试结果（2026-07-18）

| 项 | 结果 |
|---|---|
| `flyctl` 登录 | ✅ `xxxm68009@gmail.com` / org `personal` |
| `fly.embed.toml` + `Dockerfile.embed` | ✅ 仓库已有 |
| `fly apps create nav-site-embed` | ❌ **需绑卡/买 credit**：`fly.io/dashboard/xihg/billing` |
| 本机 Docker | ❌ 未安装 |
| SSH 可用 VPS | ❌ 仅 github.com host alias |

**结论：** 云 GPU/Fly 路径硬阻塞在账单；在绑卡或提供 Linux VPS 之前，**生产语义检索继续走本机 Named Tunnel 路径**（已自启 + 探针 embedding=ok）。

解除后最短命令：

```powershell
# 1) 绑卡后
fly apps create nav-site-embed --org personal
# 2) 设 secret（与 .embed-api-key.local 相同）
fly secrets set EMBED_SERVER_API_KEY=*** -a nav-site-embed
# 3) 有 Docker 的机器上
fly deploy -c fly.embed.toml
# 4) 二选一：改 Tunnel 上游到 Fly URL，或 Vercel EMBED_SERVER_URL 直指 Fly HTTPS
```

## 已完成

- [x] ADR-005 远程 HTTPS + Bearer
- [x] 本机原生 embed（弃用 Docker Desktop）
- [x] Docker 镜像/容器 `nav-site-embed*` 已删除
- [x] Cloudflare Named Tunnel + DNS `embed.aijiaqi.ccwu.cc`
- [x] Worker 反代 `nav-site-embed-proxy`（绕 Bot Fight）
- [x] Vercel `EMBED_SERVER_URL` → workers.dev + redeploy
- [x] 生产 embedding=ok / vector 检索可用（2026-07-12）
- [x] 启停脚本：`start|stop-embed-native.ps1`、`start|stop-embed-tunnel.ps1`
- [x] `ensure-embed-stack` + 登录计划任务自启
- [x] 客户端 UA：`nav-site-embed-client/1.0`（`lib/embedding-runtime.ts`）
- [x] 资源库 B6 hybrid RRF（`mode=hybrid`）
- [x] Sprint C：文档固化「云路径」= Worker+Tunnel；Fly 仍为可选备胎

## 路径对照（历史）

| 路径 | 状态 |
|------|------|
| **本机 Python + Named Tunnel + Workers 反代** | ✅ 当前生产默认 |
| 本机 Python + Named Tunnel 直连自定义域 | 本机 OK；Vercel 因 Bot Fight **403** |
| Quick Tunnel（trycloudflare） | 退役：URL 会变 |
| Docker Desktop + 镜像 | 已清理 |
| Fly.io | 拒绝绑卡 |
| Netlify | credit 用尽，生产已迁 Vercel |

## 配置文件位置

| 文件 | 说明 |
|------|------|
| `%USERPROFILE%\.cloudflared\config-nav-site-embed.yml` | tunnel ingress → 18003 |
| `%USERPROFILE%\.cloudflared\7acf685a-….json` | tunnel credentials（密钥） |
| `%USERPROFILE%\.cloudflared\cert.pem` | origin cert（login 产物） |
| `D:/nav-site/.embed-api-key.local` | Bearer key |
| `D:/nav-site/.embed-tunnel-url.local` | 自定义域 URL |
| `D:/nav-site/.embed-proxy-url.local` | 生产 Worker 入口（gitignore） |
| `D:/nav-site/workers/nav-site-embed-proxy.js` | Worker 源码（重部署用） |

重装 cloudflared 登录后：

```powershell
cloudflared tunnel login
# cert 写入 ~/.cloudflared/cert.pem
# credentials 已存在则不必 recreate；丢了才：
# cloudflared tunnel create nav-site-embed
# cloudflared tunnel route dns 7acf685a-67f8-4301-b680-2c4cd8001a72 embed.aijiaqi.ccwu.cc
```

重部署 Worker（需 wrangler OAuth / `workers:write`）：

```powershell
powershell -NoProfile -File D:/nav-site/scripts/deploy-embed-proxy-worker.ps1
```

## 脆弱点

- **本机需在线**（origin + cloudflared）；关机则 production embedding 降级 FTS
- 会话环境变量误设 `EMBEDDING_MODEL=bge-m3` 会错维：`start-embed-native.ps1` 已强制 small-zh
- 改 Vercel `EMBED_SERVER_*` 后必须 **redeploy** 才进入运行时
- zone Bot Fight 仍在；若关了 Bot Fight 可把 `EMBED_SERVER_URL` 改回 `https://embed.aijiaqi.ccwu.cc` 再 redeploy
- wrangler OAuth **无** zone Security 写权限（仅 `zone:read` + `workers:write` 等）

## Fly（可选）

登录过；绑卡/核验前不要 `deploy`。

## Cloudflare Bot Fight（重要）

`aijiaqi.ccwu.cc` 开启 Bot 挑战时，**Vercel 数据中心出口 IP** 会收到 **403**（与 User-Agent 无关；本机 UA 正常仍可能生产 403）。

### 当前绕过（已生效）

生产 `EMBED_SERVER_URL` 指向 Workers 反代：

```
https://nav-site-embed-proxy.xiej4352.workers.dev
  └─ Worker fetch → https://embed.aijiaqi.ccwu.cc
       └─ Named Tunnel → 127.0.0.1:18003
```

- Worker 名：`nav-site-embed-proxy`（account gmail / subdomain `xiej4352`）
- 固定 UA：`nav-site-embed-client/1.0`
- 自定义域仍给本机/浏览器直连；生产走 workers.dev

可选（Dashboard，需 zone **Security/WAF 写权限**）：  
Security → Bots 对 `embed.aijiaqi.ccwu.cc` 关闭 Bot Fight 或加 skip 规则后，可把 `EMBED_SERVER_URL` 改回 `https://embed.aijiaqi.ccwu.cc`。

代码侧 `buildEmbedRequestHeaders` 仍固定 UA，保留双保险。
