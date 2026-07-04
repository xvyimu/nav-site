# 发布检查清单

> 最后更新：2026-07-04
> Release candidate：当前 `master` HEAD（以 `git log -1 --oneline` 为准）
> 目标分支：`master`

## 当前结论

**本地代码侧 launch gate 已通过，但生产部署链路仍有 1 个红色项和 2 个黄色运维检查项。**

当前代码、测试、构建、本地 E2E 和本地安全检查均已通过。本轮 launch hardening 修复了 ResourceRating toast 动态加载阻塞评分 UI 的问题，刷新了已批准纸面视觉的 hero 快照，并收紧了移动端工具详情页 E2E locator。红色项仍是 GitHub Actions 的 `netlify deploy --prod` 实际返回 `JSONHTTPError: Forbidden`，因此最新生产部署仍需修复 Netlify token/site 权限后复验；黄色项有两个：生产 `/api/health` 显示 Sentry DSN 未配置；embedding 子检查为 `error`，说明生产运行环境暂时无法访问 `EMBED_SERVER_URL`。正式上线前需要修复 Netlify token/site 权限，补齐 `NEXT_PUBLIC_SENTRY_DSN`，并确认生产 embedding 服务可达，或明确接受语义搜索降级为文本/Fuse 搜索的行为。

## 已验证门禁

| 门禁 | 状态 | 证据 |
|---|---:|---|
| Git 状态 | ✅ | 本轮 launch hardening 提交后需保持工作树 clean |
| Lint | ✅ | `pnpm lint` |
| Typecheck | ✅ | `pnpm typecheck` |
| 单元测试 | ✅ | `pnpm test`：317 passed / 6 skipped |
| 针对性 E2E | ✅ | ResourceRating 目标测试 `3 passed`；Figma 详情页 + hero visual 子集 `4 passed` |
| 全量 E2E | ✅ | `pnpm exec playwright test --reporter=line`：52 passed |
| 生产构建 | ✅ | `pnpm build` |
| 依赖审计 | ✅ | `pnpm audit --audit-level moderate --registry=https://registry.npmjs.org`：无已知漏洞 |
| 密钥扫描 | ✅ | `node scripts/pre-commit-secret-scan.mjs` |
| 生产健康检查 | ✅ | 本地 `next start -p 3264`；`/api/health` 返回 HTTP 200、`status=healthy` |
| 安全响应头 | ✅ | CSP、HSTS、`X-Frame-Options=DENY`、`X-Content-Type-Options=nosniff`、`Referrer-Policy=strict-origin-when-cross-origin` |
| 调试输出扫描 | ✅ | 无生产 `console.log`；保留的 `console.warn/error` 均为 logger、错误边界、fetch 失败上报或性能阈值告警 |

## 生产验证记录

| 项目 | 状态 | 结果 |
|---|---:|---|
| GitHub Actions | ❌ | 最近一次远端验证：`quality`、`build`、`e2e` 通过；`deploy` 真实失败，日志显示 `netlify deploy --prod --site "$NETLIFY_SITE_ID"` 返回 `JSONHTTPError: Forbidden`；本轮提交推送后需重新跑 Actions |
| Lighthouse CI | ✅ | 最新 `master` run success |
| 生产首页 | ✅ | `GET /` 返回 200 |
| 生产搜索 API | ✅ | `/api/search?q=ai&limit=5` 返回 200，5 条结果 |
| 工具详情页 | ✅ | `/tool/figma` 返回 200，包含 Figma 与访问官网入口 |
| Sitemap | ✅ | `/sitemap.xml` 返回 200，包含 `/tool/figma` |
| Robots | ✅ | `/robots.txt` 返回 200，包含 `User-Agent` |
| 生产健康检查 | ⚠️ | `/api/health` 返回 200/healthy；`database/env` ok；`sentry` skipped；`embedding` error |
| 生产安全头 | ⚠️ | `netlify.toml` 已加全站安全头；生产 HEAD 仍为 `X-Frame-Options=SAMEORIGIN`、`Referrer-Policy=same-origin`，需待 Netlify 部署权限修复并重新部署后复验 |

## 发布前步骤

1. 确认最新 `master` push 的 GitHub Actions 已完成：
   - `quality`
   - `build`
   - `e2e`
   - `deploy`（必须真实成功，不能依赖 `continue-on-error`）
   - `link-check`
2. 确认 Netlify 或生产部署环境已配置必要环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `AUTH_SECRET`
   - `ADMIN_PASSWORD`
   - `SUPABASE_SERVICE_ROLE_KEY` 或 `SUPABASE_SERVICE_ROLE_KEY_PROD`
   - `NEXT_PUBLIC_SENTRY_DSN`
   - 可选：`EMBED_SERVER_URL`
3. 修复 Netlify 部署凭据或站点权限：
   - `NETLIFY_AUTH_TOKEN` 需能访问目标站点。
   - `NETLIFY_SITE_ID` 可配置为 GitHub secret 或 repository variable。
   - 重新跑 deploy 后复验生产安全头。
4. 配置 `NEXT_PUBLIC_SENTRY_DSN`，让生产 `/api/health` 的 Sentry 检查从 `skipped` 变为 `ok`。
5. 如果需要完整语义搜索能力，确认生产运行环境能访问 `EMBED_SERVER_URL`。
6. 打开生产站点做冒烟测试：
   - 首页可加载。
   - 搜索可返回结果。
   - 移动端 320px 和 390px 下底栏标签可读、无横向溢出。
   - `/api/health` 返回 200。
   - `/api/search?q=ai&limit=5` 返回 JSON。
   - `/tool/figma` 可渲染。
7. 发布后检查 Sentry：
   - 无新增错误类型。
   - Web Vitals 事件有上报。
   - API failure 没有明显 spike。

## 首小时监控

发布后一小时至少观察以下指标：

| 区域 | 绿色 | 暂停观察 | 回滚 |
|---|---|---|---|
| 错误率 | 无新增 Sentry 错误类型 | 少量新 client/API 错误 | 新错误影响核心搜索或导航 |
| API 延迟 | 接近发布前基线 | P95 高于基线 20% 以上 | P95 高于基线 50% 以上 |
| 健康检查 | 200 healthy | 仅 embedding warning 且 fallback 正常 | database/env 检查失败 |
| 搜索 | 文本搜索和 fallback 正常 | 仅语义搜索不可用 | 搜索接口失败或大范围空结果 |
| 移动体验 | 无横向溢出 | 轻微视觉问题 | 底栏或搜索阻断核心移动流程 |

## 回滚方案

使用 revert commit，不重写历史：

```powershell
rtk git revert <release-commit> --no-edit
rtk git -c http.proxy= -c https.proxy= push origin master
```

如果需要连续回滚多个发布提交：

```powershell
rtk git revert <newest-release-commit> <older-release-commit> --no-edit
rtk git -c http.proxy= -c https.proxy= push origin master
```

回滚后：

1. 确认 Netlify 重新部署完成。
2. 验证 `/api/health`。
3. 冒烟测试首页、搜索、移动底栏。
4. 检查 Sentry 错误率是否回落。
5. 记录事故和后续修复项。

## 已知非阻塞风险

- Embedding 服务独立于 Next.js 应用运行；不可用时语义搜索质量会下降，但文本/Fuse 搜索应继续可用。
- GitHub OAuth App 配置仍依赖外部账号操作。
- 真实 Core Web Vitals 需要 Sentry 生产数据积累；本地 Playwright 和构建检查不能替代真实用户遥测。
