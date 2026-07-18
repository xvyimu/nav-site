# Preview 环境 Supabase 配置 — 2026-07-18

> 目标：让 Vercel Preview 能做功能探针，而不是只证明“构建成功”  
> **2026-07-18 已完成**：Preview 挂 nav-dev 公共 env + **关闭 SSO Protection** + 探针 PASS

## 1. 现状

| 环境 | Supabase | 功能探针 |
|---|---|---|
| Production | 生产库全量 env | 主域 **PASS** |
| Preview | **nav-dev** URL/anon + AUTH/Sentry/embed Worker 等 | **PASS**（commit `ee5a047b`） |

## 2. 已同步到 Preview 的变量（无值明文）

```powershell
powershell -NoProfile -File D:\nav-site\scripts\sync-preview-env.ps1
node scripts/set-preview-admin-hash.mjs
node scripts/set-preview-embed-key.mjs
```

- `NEXT_PUBLIC_SUPABASE_URL` → nav-dev（`nzaocqwumlmbewoddysd`）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → nav-dev anon
- `AUTH_SECRET`、`ADMIN_PASSWORD_HASH`、`NEXT_PUBLIC_SITE_URL`
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
- `EMBED_SERVER_URL` → Worker `https://nav-site-embed-proxy.xiej4352.workers.dev`
- `EMBED_SERVER_API_KEY`（若本地有）
- Resource Library 相关（若本地有）

**故意未写：** 生产 `SUPABASE_SERVICE_ROLE_KEY` / `_PROD`

## 3. Deployment Protection（已关）

| 项 | 值 |
|---|---|
| 原配置 | `ssoProtection.deploymentType = all_except_custom_domains` |
| 现配置 | **`ssoProtection = null`**（`PATCH /v9/projects/{id}`） |
| 主域 | 自定义域公网；关墙后 `*.vercel.app` 亦可匿名探针 |

## 4. 验收（2026-07-18）

```powershell
pnpm run verify:production -- --base-url https://nav-site-ny3xisrm6-aijiai520.vercel.app --expect-commit ee5a047b29e030afc60e75e57b0be913e6b2fd00
# → 全 PASS
```

## 5. 可选后续

| 项 | 说明 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY_DEV` | 本地补 nav-dev service_role 再 sync → admin 写路径完整 |

## 6. 安全边界

- Preview **只**连 nav-dev  
- 禁止 Preview 挂生产 service role  
- 单人私有仓关 SSO Protection 可接受；仓库变 public 时必须重新开启  
