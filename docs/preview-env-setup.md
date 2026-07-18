# Preview 环境 Supabase 配置 — 2026-07-18

> **状态：完成并验收**  
> Preview 挂 **nav-dev** + SSO Protection 关闭 + embedding ok

## 1. 现状

| 环境 | Supabase | 探针 |
|---|---|---|
| Production | 生产库 | 主域 PASS · embedding ok |
| Preview | nav-dev（ref `nzaocqwumlmbewoddysd`） | PASS · embedding ok · service_role 已挂 DEV |

最新可探针 Preview 例：`https://nav-site-c44z6np3k-aijiai520.vercel.app`（commit `ee5a047b`）

## 2. 同步命令

```powershell
powershell -NoProfile -File D:\nav-site\scripts\sync-preview-env.ps1
node scripts/set-preview-admin-hash.mjs
# 可选单独补 embed key：
# 从 .embed-api-key.local 写入 Preview（勿用 User EMBEDDING_API_KEY，可能是别的产品）
vercel env add EMBED_SERVER_API_KEY preview --scope aijiai520 --yes --force --sensitive --value (Get-Content D:\nav-site\.embed-api-key.local -Raw).Trim()
vercel redeploy <preview-url> --scope aijiai520
```

`sync-preview-env.ps1` 会读取：

| 变量 | 来源 |
|---|---|
| Supabase URL/anon | `.env.local` `*_DEV` / `SOURCE_*` |
| `SUPABASE_SERVICE_ROLE_KEY`（Preview） | User env **`SUPABASE_DEV_SERVICE_ROLE`**（JWT ref 必须 `nzaoc…`） |
| `EMBED_SERVER_URL` | 固定 Worker `nav-site-embed-proxy…` |
| `EMBED_SERVER_API_KEY` | `.embed-api-key.local` |
| AUTH / Sentry / RL | `.env.local` |

**禁止：** 生产 `SUPABASE_PROD_SERVICE_ROLE` / `vyqq…` JWT 写入 Preview。

## 3. Protection

`ssoProtection = null`（API 已关）。仓库变 public 时务必重新开启。

## 4. 验收

```powershell
pnpm run verify:production -- --base-url https://nav-site-c44z6np3k-aijiai520.vercel.app --expect-commit ee5a047b29e030afc60e75e57b0be913e6b2fd00
# health.checks.embedding.status === "ok"
# health.checks.database.detail 含 categories（nav-dev）
```
