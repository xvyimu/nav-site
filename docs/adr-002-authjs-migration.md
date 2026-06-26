# ADR-002: Auth.js canary → next-auth v5 beta 迁移评估

> 日期：2026-06-24
> 状态：已决策 — 迁移到 `next-auth@5.0.0-beta.31`

## 背景

项目当前使用 `@auth/core` 和 `@auth/nextjs` 的 canary 版本 `0.0.0-380f8d56`（2 年前发布），存在以下风险：

1. **无 semver 保证**：canary 版本可能引入 breaking change，无版本号约束
2. **无安全更新**：2 年未更新，期间发现的安全漏洞未修复
3. **无社区支持**：`@auth/nextjs` 周下载量仅 1,021，文档缺失
4. **替代方案成熟**：`next-auth@5.0.0-beta.31` 已稳定运行在大量生产项目中

## 方案对比

| 方案 | 包名 | 版本 | 周下载量 | 风险 |
|------|------|------|----------|------|
| 维持现状 | `@auth/core` + `@auth/nextjs` | `0.0.0-380f8d56` | 1,021 | 高 — 无更新、无安全修复 |
| 迁移 v5 beta | `next-auth` | `5.0.0-beta.31` | 4,769,522 | 低 — beta 已广泛使用，API 稳定 |
| 迁移 v4 稳定版 | `next-auth` | `4.24.14` | 4,769,522 | 中 — v4 不支持 App Router middleware |
| 替换为 Supabase Auth | `@supabase/ssr` | 已安装 | — | 高 — 重写认证逻辑，工作量大 |

## 决策

迁移到 `next-auth@5.0.0-beta.31`。

### 理由

1. v5 beta 是 Auth.js 官方推荐的 Next.js App Router 解决方案
2. API 与当前 `@auth/nextjs` 几乎相同（`NextAuth()` → `NextAuth()`），迁移成本低
3. v5 支持 App Router middleware（`authorized` 回调），v4 不支持
4. 周下载量 470 万，社区生态成熟
5. 当前项目仅使用 Credentials provider + JWT session，迁移影响面小

### 迁移影响

- `lib/auth.ts`：import 路径从 `@auth/nextjs` → `next-auth`，`@auth/core/providers/credentials` → `next-auth/providers/credentials`
- `app/api/admin/login/route.ts`：`@auth/core/jwt` 的 `encode` → `next-auth/jwt` 的 `encode`
- `package.json`：移除 `@auth/core` 和 `@auth/nextjs`，添加 `next-auth@5.0.0-beta.31`

## 后续

- 监控 `next-auth` v5 正式版发布，发布后升级
- 评估 BetterAuth 作为长期替代方案（2025 年新兴认证框架）
