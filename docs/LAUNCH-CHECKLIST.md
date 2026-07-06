# 发布检查清单

> 最后更新：2026-07-06
> 当前 release line：`master`
> 目标分支：`master`

## 当前结论

代码质量链路已经通过，生产主站仍可访问，但最新代码尚未成功部署到 Netlify。

当前红色上线阻塞是 Netlify 账号额度：GitHub Actions 的 quality/build/E2E 均已通过；deploy job 在 Netlify credit preflight 阶段停止，没有再 POST 创建新的 Netlify build。该阻塞不是代码、token 权限或 CI 脚本错误；需要在 Netlify 侧恢复账号 credit/账单额度后手动运行生产部署。

永久发布策略已经收敛为：`master` push 只跑 quality/build/E2E，不再自动镜像到 Netlify 生产分支，也不再自动消耗 Netlify deploy credits。生产部署只通过 GitHub Actions 的 `workflow_dispatch` 手动触发。

## 已完成的稳定性收尾

| 项目 | 状态 | 说明 |
|---|---:|---|
| Dependabot / npm audit | 通过 | `pnpm audit --registry=https://registry.npmjs.org --audit-level moderate`：No known vulnerabilities found |
| Netlify credit preflight | 通过 | 默认检查窗口扩展到 24 小时；额度已耗尽时阻断 deploy trigger，避免重复创建失败 build |
| 生产部署手动门禁 | 通过 | `master` push 只验证代码；Netlify 生产部署、分支镜像和 deploy 后 link-check 仅在手动运行 `CI 检查 / 手动 Netlify 部署` 时执行 |
| embedding 健康检查 | 通过 | 未配置 `EMBED_SERVER_URL` 时 `/api/health` 标记 `embedding=skipped`；Netlify/Serverless 运行时即使残留 loopback `EMBED_SERVER_URL` 也默认跳过，除非显式设置 `EMBED_SERVER_LOOPBACK_ENABLED=true`；本地/自托管显式配置后才探测本地服务 |
| Supabase timeout 降级 | 通过 | 首页数据读取使用 `AbortSignal.timeout(15000)`；Supabase 短时不可达时降级为空数据而不是挂起构建/请求 |
| migration apply 兜底 | 通过 | `pnpm db:reviews:apply` 支持 `DATABASE_URL`/`SUPABASE_DB_URL`，优先 Supabase CLI，失败后回退 `psql`；无 DB URL 时可用 linked Supabase 项目 |
| 生产探针抗抖动 | 通过 | `scripts/probe-production.mjs` 默认对网络错误、408/425/429/5xx 做 1 次轻量重试；commit mismatch、404、健康语义不符等真实失败不会被重试掩盖 |
| 上线就绪门禁 | 通过 | `pnpm run verify:launch-readiness` 汇总本地 git 状态、当前生产 smoke、最新 commit 部署状态；上线前必须全部通过 |

## 最新证据

| 项目 | 状态 | 证据 |
|---|---:|---|
| Git 状态 | 以门禁为准 | `pnpm run verify:launch-readiness` 会检查本地分支是否与 upstream 一致；`.planning/` 为未跟踪工作目录，不纳入发布 |
| 本地定向测试 | 通过 | `pnpm test tests/api-health.test.ts tests/search-use-case.test.ts tests/probe-production.test.ts`：19 passed |
| 本地全量测试 | 通过 | `pnpm test`：343 passed / 6 skipped |
| Typecheck | 通过 | `pnpm run typecheck` |
| Lint | 通过 | `pnpm run lint` |
| Build | 通过 | `pnpm run build` |
| 生产探针脚本 | 通过 | `pnpm run verify:production` 验证当前生产可访问；本地模拟 `NETLIFY=true` + loopback `EMBED_SERVER_URL` 后，`pnpm run verify:production:latest -- --base-url http://localhost:3264` 已确认 `embedding=skipped` |
| 生产探针重试测试 | 通过 | `pnpm test tests/probe-production.test.ts` 覆盖瞬时 `fetch failed` 后重试成功、旧部署 `build-info` 404 不重试的场景 |
| 上线就绪门禁测试 | 通过 | `pnpm test tests/check-launch-readiness.test.ts` 覆盖 git ahead/dirty 解析、最新部署阻塞、跳过网络不误判 ready |
| CI workflow 测试 | 通过 | `pnpm test tests/ci-workflow.test.ts` 覆盖手动部署触发与生产 smoke monitor |
| GitHub Actions quality/build/E2E | 通过 | 最近一次 `master` push run 中 quality/build/E2E 均为 success；用 `rtk gh run list --repo xvyimu/nav-site --branch master --limit 4` 复验 |
| Lighthouse CI | 通过 | 最近一次 `master` push 对应 Lighthouse run 为 success |
| Netlify 分支同步 | 通过 | 手动 deploy job 会将 `master` 镜像到 Netlify 监听的 `main` 分支 |
| 手动部署触发 | 已接入 | `CI 检查 / 手动 Netlify 部署` 支持 `workflow_dispatch`；Netlify 额度恢复后，代码已推送时可手动跑完整质量链路、deploy 和 link-check |
| 生产 smoke monitor | 已接入 | `Production smoke monitor` 支持 `workflow_dispatch` 和每 6 小时定时运行 `node scripts/probe-production.mjs`；失败时上传日志并创建/更新 GitHub Issue，恢复后自动评论并关闭故障 Issue |
| Deploy 后生产探针 | 已接入 | deploy job 输出 `deploy-url` 后，`link-check` 会先运行 `pnpm run verify:production:latest -- --base-url <deploy-url> --expect-commit "$GITHUB_SHA"` |
| 发布版本识别 | 已接入 | 构建前生成 `/build-info.json`；部署后探针使用 `--expect-commit "$GITHUB_SHA"` 校验线上版本确为本次发布；`/api/health` 也会尽量暴露运行时可见的版本元数据 |
| Netlify deploy preflight | 预期阻塞 | deploy job 在 preflight 阶段失败：`Netlify account credit usage exceeded`，且不触发新 build |
| Link check | 未运行 | 依赖 deploy；deploy 因 Netlify credit 失败而 skipped |

## 生产现状

| 项目 | 状态 | 结果 |
|---|---:|---|
| 主站首页 | 通过 | `https://nav-site.netlify.app/` 返回 HTTP 200 |
| 生产健康检查 | 部分通过 | 当前已部署版本 `/api/health` 返回 HTTP 200，`status=healthy`；`database/env` ok，`sentry` skipped，`embedding` 可能 error。最新代码部署后，Netlify/Serverless 上的 loopback embedding 会变为 `skipped` |
| 安全响应头 | 通过 | CSP、HSTS、`X-Frame-Options=DENY`、`X-Content-Type-Options=nosniff`、`Referrer-Policy=strict-origin-when-cross-origin` 已生效 |
| 分支别名 | 异常 | `https://main--nav-site.netlify.app` 当前返回 404，不能作为健康检查来源 |
| 自定义域名 DNS | 待确认 | `toolifyhub.top` 当前有 Cloudflare 解析；`www.toolifyhub.top` 在公共 DNS 查询中为 NXDOMAIN，不能作为上线验收入口 |
| 最新代码部署 | 未完成 | Netlify account credit 用尽导致最新 commit 未发布 |

## 上线前必须完成

1. 恢复 Netlify account credit/账单额度。
2. 确认本地提交已推送到 `origin/master`；push 只要求 quality/build/E2E 通过。
3. 在 GitHub Actions 手动运行 `CI 检查 / 手动 Netlify 部署`，确认 deploy job 成功，并继续跑到 `link-check`。
4. 复验生产主站：
   - `/` 返回 200。
   - `/api/health` 返回 200；未配置 `EMBED_SERVER_URL`，或在 Netlify/Serverless 上残留 loopback `EMBED_SERVER_URL` 时，`checks.embedding.status=skipped`。
   - `/build-info.json` 的 `commit` 与本次发布 commit 匹配。
   - `/api/search?q=ai&limit=5` 返回 JSON。
   - `/tool/figma` 可渲染。
   - `/sitemap.xml` 和 `/robots.txt` 可访问。
   - 或直接运行 `pnpm run verify:production:latest -- --expect-commit <commit-sha>`；如需调整网络抖动容忍度，可追加 `--retries <n>` 或设置 `PRODUCTION_PROBE_RETRIES`。
   - 发布前后可运行 `pnpm run verify:launch-readiness` 汇总本地/生产/部署版本状态。
   - 若启用自定义域名，先确认 apex 和 `www` 都已正确解析到目标生产站点。
5. 处理或接受黄色运行项：
   - `NEXT_PUBLIC_SENTRY_DSN` 未配置时，Sentry 健康检查保持 `skipped`。
   - `EMBED_SERVER_URL` 是可选配置；未配置或 serverless loopback 被禁用时语义搜索会走降级链路，文本/Fuse 搜索仍应可用。
   - 若在本地/自托管环境显式配置 `EMBED_SERVER_URL`，需要保持本地 embedding 服务可达。
   - 若确实要在 serverless 环境探测 loopback embedding，需同时设置 `EMBED_SERVER_LOOPBACK_ENABLED=true`。

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
2. 手动运行 `CI 检查 / 手动 Netlify 部署`，确认 Netlify deploy 完成。
3. `/api/health` 返回 200。
4. 首页、搜索、工具详情页可用。
5. Sentry 或日志中无新增错误类型。
