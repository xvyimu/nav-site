# 发布检查清单

> 最后更新：2026-07-05
> 当前 release line：`master` HEAD（最近已推送基线：`da242508 ci: extend netlify credit preflight window`）
> 目标分支：`master`

## 当前结论

代码质量链路已经通过，生产主站仍可访问，但最新代码尚未成功部署到 Netlify。

当前唯一红色上线阻塞是 Netlify 账号额度：GitHub Actions 的 quality/build/E2E 均已通过；deploy job 在 Netlify credit preflight 阶段停止，没有再 POST 创建新的 Netlify build。该阻塞不是代码、token 权限或 CI 脚本错误；需要在 Netlify 侧恢复账号 credit/账单额度后重新运行 deploy。

## 已完成的稳定性收尾

| 项目 | 状态 | 说明 |
|---|---:|---|
| Dependabot / npm audit | 通过 | `pnpm audit --registry=https://registry.npmjs.org --audit-level moderate`：No known vulnerabilities found |
| Netlify credit preflight | 通过 | 默认检查窗口扩展到 24 小时；额度已耗尽时阻断 deploy trigger，避免重复创建失败 build |
| embedding 健康检查 | 通过 | 未配置 `EMBED_SERVER_URL` 时 `/api/health` 标记 `embedding=skipped`；显式配置后才探测本地服务，服务不可用时整体仍保持 200/healthy 并提示语义搜索降级 |
| Supabase timeout 降级 | 通过 | 首页数据读取使用 `AbortSignal.timeout(15000)`；Supabase 短时不可达时降级为空数据而不是挂起构建/请求 |
| migration apply 兜底 | 通过 | `pnpm db:reviews:apply` 支持 `DATABASE_URL`/`SUPABASE_DB_URL`，优先 Supabase CLI，失败后回退 `psql`；无 DB URL 时可用 linked Supabase 项目 |

## 最新证据

| 项目 | 状态 | 证据 |
|---|---:|---|
| Git 状态 | 通过 | 本轮开始时工作区仅有本地 `.planning/` 未跟踪目录；发布代码基线已推送 `origin/master` |
| 本地定向测试 | 通过 | `pnpm test tests/api-health.test.ts tests/wait-netlify-deploy.test.ts`：14 passed |
| 本地全量测试 | 通过 | `pnpm test`：327 passed / 6 skipped |
| Typecheck | 通过 | `pnpm run typecheck` |
| Lint | 通过 | `pnpm run lint` |
| Build | 通过 | `pnpm run build` |
| GitHub Actions quality | 通过 | run `28734503520`：quality success |
| GitHub Actions build | 通过 | run `28734503520`：build success |
| GitHub Actions E2E | 通过 | run `28734503520`：E2E success |
| Lighthouse CI | 通过 | run `28734503518` success |
| Netlify 分支同步 | 通过 | `main` mirror 已同步到 `da242508` |
| Netlify deploy preflight | 预期阻塞 | run `28734503520` deploy job 在 preflight 阶段失败：`Netlify account credit usage exceeded`，未触发新 build |
| Link check | 未运行 | 依赖 deploy；deploy 因 Netlify credit 失败而 skipped |

## 生产现状

| 项目 | 状态 | 结果 |
|---|---:|---|
| 主站首页 | 通过 | `https://nav-site.netlify.app/` 返回 HTTP 200 |
| 生产健康检查 | 部分通过 | 当前已部署版本 `/api/health` 返回 HTTP 200，`status=healthy`；`database/env` ok，`sentry` skipped，`embedding` 可能 error。最新代码部署后，未配置 `EMBED_SERVER_URL` 时应变为 `embedding=skipped` |
| 安全响应头 | 通过 | CSP、HSTS、`X-Frame-Options=DENY`、`X-Content-Type-Options=nosniff`、`Referrer-Policy=strict-origin-when-cross-origin` 已生效 |
| 分支别名 | 异常 | `https://main--nav-site.netlify.app` 当前返回 404，不能作为健康检查来源 |
| 最新代码部署 | 未完成 | Netlify account credit 用尽导致最新 commit 未发布 |

## 上线前必须完成

1. 恢复 Netlify account credit/账单额度。
2. 重新运行 GitHub Actions `CI 检查 + Netlify 部署` 的 failed deploy job，或重新 push 一个空变更触发完整流水线。
3. 确认 deploy job 成功，并继续跑到 `link-check`。
4. 复验生产主站：
   - `/` 返回 200。
   - `/api/health` 返回 200；未配置 `EMBED_SERVER_URL` 时 `checks.embedding.status=skipped`。
   - `/api/search?q=ai&limit=5` 返回 JSON。
   - `/tool/figma` 可渲染。
   - `/sitemap.xml` 和 `/robots.txt` 可访问。
5. 处理或接受黄色运行项：
   - `NEXT_PUBLIC_SENTRY_DSN` 未配置时，Sentry 健康检查保持 `skipped`。
   - `EMBED_SERVER_URL` 是可选配置；未配置时语义搜索会走降级链路，文本/Fuse 搜索仍应可用。
   - 若显式配置 `EMBED_SERVER_URL`，需要保持本地 embedding 服务可达。

## 凭据与备用平台

GitHub 当前只配置了 Netlify 与 Supabase 相关 secret/variable：

- secret：`NETLIFY_AUTH_TOKEN`、`SOURCE_SUPABASE_URL`、`SOURCE_SUPABASE_ANON_KEY`、`TARGET_SUPABASE_URL`、`TARGET_SUPABASE_ANON_KEY`
- variable：`NETLIFY_SITE_ID`

当前没有 Vercel、Cloudflare Pages 或 Wrangler 相关凭据，无法直接切换备用生产部署平台。若要启用备用平台，至少需要先配置对应 token、project/account id 和生产环境变量。

## 回滚方案

使用 revert commit，不重写历史：

```powershell
rtk git revert <release-commit> --no-edit
rtk git push origin master
```

回滚后复验：

1. GitHub Actions quality/build/e2e 通过。
2. Netlify deploy 完成。
3. `/api/health` 返回 200。
4. 首页、搜索、工具详情页可用。
5. Sentry 或日志中无新增错误类型。
