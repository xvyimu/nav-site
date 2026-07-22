# Cloudflare 边缘改写 · 关闭清单（ChronoPortal / yuanjia1314.ccwu.cc）

> 目的：去掉 **Rocket Loader** 与 **JS Auto Minify**，消除 `type="<hex>-text/javascript"` 改写，为 CSP nonce（T9″）清障。  
> 生产 host：`https://yuanjia1314.ccwu.cc`  
> 实测 NS：`luciane.ns.cloudflare.com` / `lee.ns.cloudflare.com`（**子域在 Cloudflare**；根域 `ccwu.cc` NS 为 dnshe，不是同一套）。

## 0. 2026-07-22 结果

| 项 | 结果 |
|----|------|
| zone | `yuanjia1314.ccwu.cc` · id `8d87055fa1e04b3b65a3490b5caa8480` |
| `rocket_loader` | **on → off**（API PATCH） |
| `minify.js` | 已是 **off**（css/html 亦 off） |
| cache | `purge_everything` **success** |
| `audit-edge-scripts.mjs` | **mangledScriptTypeCount=0** · `rocketLoaderHints=false` |
| 生产探针 | 仍 **全 PASS**（runtime `46e71ec3`） |

旧 User env / `CF_AI` token 无 zone；本次用 **Zone Settings Edit** 令牌完成。令牌若曾出现在聊天中，建议在 CF 轮换/删除。

## 1. Dashboard（推荐，一次做完）

1. 登录 **实际托管该子域** 的 Cloudflare 账号（NS 为 luciane/lee 的那个）。  
2. 选中 zone（可能是 `yuanjia1314.ccwu.cc` 或父级若托管在 CF 的 zone）。  
3. **Speed → Optimization → Content Optimization**  
   - **Rocket Loader** → **Off**  
4. **Speed → Optimization → Content Optimization / Auto Minify**（UI 文案因版本略异）  
   - **JavaScript** minify → **关**  
   - CSS/HTML 可保持原样（除非你也要关）  
5. **Caching → Configuration → Purge Everything**（或至少 purge 主页 HTML）  
6. 等 1–2 分钟后本机验证：

```powershell
cd D:\ChronoPortal
node scripts/audit-edge-scripts.mjs
# 期望: mangledScriptTypeCount = 0, rocketLoaderHints = false
```

## 2. API（有 Zone 权限令牌时）

1. Cloudflare Dashboard → **My Profile → API Tokens → Create Token**  
2. 模板 **Edit zone settings** 或自定义：  
   - **Zone → Zone Settings → Edit**  
   - **Zone → Cache Purge → Purge**（可选）  
   - Zone Resources：包含托管 `yuanjia1314.ccwu.cc` 的 zone  
3. 本机执行（**不要把 token 写进 git**）：

```powershell
$env:CLOUDFLARE_API_TOKEN = '<zone-edit-token>'
cd D:\ChronoPortal
node scripts/cf-disable-rocket-loader.mjs --dry-run   # 先看会改什么
node scripts/cf-disable-rocket-loader.mjs             # 关闭 rocket_loader + minify.js 并尝试 purge
node scripts/audit-edge-scripts.mjs
```

脚本路径：`scripts/cf-disable-rocket-loader.mjs`。

## 3. 验收门槛（T9″ 前置）

| 检查 | 通过标准 |
|------|----------|
| `audit-edge-scripts.mjs` | `mangledScriptTypeCount === 0` |
| Rocket Loader | `rocketLoaderHints === false` |
| 生产探针 | `probe-production.mjs --no-proxy` 仍全 PASS |
| CSP | Enforcing 仍可暂留 `'unsafe-inline'` 直到 nonce→layout 接线 |

## 4. 仍不要做的

- 在 mangled type 仍 >0 时设 `CSP_SCRIPT_UNSAFE_INLINE=0`  
- 把 Zone Edit token 写进仓库 / 提交到 Vercel 公开日志  

## 5. 相关

- 决策：`docs/csp-t9-decision-2026-07-22.md`  
- 审计：`scripts/audit-edge-scripts.mjs`  
- 关闭脚本：`scripts/cf-disable-rocket-loader.mjs`
