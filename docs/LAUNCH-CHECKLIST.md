# 发布检查清单

> 最后更新：2026-07-05
> 当前 release candidate：`59458237 ci: let netlify build use production branch`
> 目标分支：`master`

## 当前结论

代码质量链路已经通过，生产主站仍可访问，但最新 commit 尚未成功部署到 Netlify。

当前唯一红色上线阻塞是 Netlify 账号额度：GitHub Actions deploy job 已能成功同步 `master` 到 `main`，也能通过 Netlify API 创建 build，但 Netlify 立即返回 `Skipped due to account credit usage exceeded`。这不是代码、token 权限或 CI 脚本错误；需要在 Netlify 侧恢复账号 credit/账单额度后重新运行 deploy。

## 最新证据

| 项目 | 状态 | 证据 |
|---|---:|---|
| Git 状态 | 通过 | 工作区仅有本地 `.planning/` 未跟踪文件，发布代码已推送 `origin/master` |
| 本地目标测试 | 通过 | `pnpm test tests/wait-netlify-deploy.test.ts`：8 passed |
| 本地全量测试 | 通过 | `pnpm test`：325 passed / 6 skipped |
| Typecheck | 通过 | `pnpm run typecheck` |
| Lint | 通过 | `pnpm run lint` |
| Workflow YAML | 通过 | PyYAML 可解析 `.github/workflows/ci.yml` |
| GitHub Actions quality | 通过 | run `28732970140`：quality success |
| GitHub Actions build | 通过 | run `28732970140`：build success |
| GitHub Actions E2E | 通过 | run `28732970140`：50 passed / 2 skipped |
| Lighthouse CI | 通过 | run `28732970128` success |
| Netlify 分支同步 | 通过 | deploy job 将 `main` 更新到 `59458237` |
| Netlify build API | 通过触发，失败于平台额度 | build/deploy 创建成功后 `state=error`，details=`Skipped due to account credit usage exceeded` |
| Link check | 未运行 | 依赖 deploy；deploy 因 Netlify credit 失败而 skipped |

## 生产现状

| 项目 | 状态 | 结果 |
|---|---:|---|
| 主站首页 | 通过 | `https://nav-site.netlify.app/` 返回 HTTP 200 |
| 生产健康检查 | 部分通过 | `/api/health` 返回 HTTP 200，`status=healthy`；`database/env` ok，`sentry` skipped，`embedding` error |
| 安全响应头 | 通过 | CSP、HSTS、`X-Frame-Options=DENY`、`X-Content-Type-Options=nosniff`、`Referrer-Policy=strict-origin-when-cross-origin` 已生效 |
| 分支别名 | 异常 | `https://main--nav-site.netlify.app` 当前返回 404，不能作为健康检查来源 |
| 最新代码部署 | 未完成 | Netlify account credit 用尽导致最新 commit 未发布 |

## 上线前必须完成

1. 恢复 Netlify account credit/账单额度。
2. 重新运行 GitHub Actions `CI 检查 + Netlify 部署` 的 failed deploy job，或重新 push 一个空变更触发完整流水线。
3. 确认 deploy job 成功，并继续跑到 `link-check`。
4. 复验生产主站：
   - `/` 返回 200。
   - `/api/health` 返回 200。
   - `/api/search?q=ai&limit=5` 返回 JSON。
   - `/tool/figma` 可渲染。
   - `/sitemap.xml` 和 `/robots.txt` 可访问。
5. 处理或接受黄色运行项：
   - `NEXT_PUBLIC_SENTRY_DSN` 未配置时，Sentry 健康检查保持 `skipped`。
   - `EMBED_SERVER_URL` 不可达时，语义搜索降级，文本/Fuse 搜索仍应可用。

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
