# 发布检查清单

> 最后更新：2026-07-04
> Release candidate：`b79fdf70 fix: improve mobile nav readability`
> 目标分支：`master`

## 当前结论

**代码侧可以发布，但有 1 个黄色运维检查项。**

当前代码、测试、构建、安全头和健康检查均已通过。唯一黄色项是 embedding 子检查：本地生产模式访问 `/api/health` 返回 HTTP 200 且整体 `healthy`，但 `checks.embedding.status` 为 `error`，原因是本机验证时 `EMBED_SERVER_URL` 对应的 8003 embedding 微服务未运行。正式上线前需要确认生产环境的 embedding 服务可达，或明确接受语义搜索降级为文本/Fuse 搜索的行为。

## 已验证门禁

| 门禁 | 状态 | 证据 |
|---|---:|---|
| Git 状态 | ✅ | `master` 与 `origin/master` 均为 `b79fdf70`，工作树 clean |
| Lint | ✅ | `pnpm lint` |
| Typecheck | ✅ | `pnpm typecheck` |
| 单元测试 | ✅ | `pnpm test` 结果已记录在 `docs/PROGRESS.md` |
| 针对性 E2E | ✅ | 移动底栏/移动布局/分类切换 grep：`6 passed` |
| 全量 E2E | ✅ | Playwright 全量：`52 passed` |
| 生产构建 | ✅ | `pnpm build` |
| 依赖审计 | ✅ | `pnpm audit --audit-level moderate --registry=https://registry.npmjs.org`：无已知漏洞 |
| 密钥扫描 | ✅ | `node scripts/pre-commit-secret-scan.mjs` |
| 生产健康检查 | ✅ | 本地 `next start -p 3264`；`/api/health` 返回 HTTP 200、`status=healthy` |
| 安全响应头 | ✅ | CSP、HSTS、`X-Frame-Options=DENY`、`X-Content-Type-Options=nosniff`、`Referrer-Policy=strict-origin-when-cross-origin` |
| 调试输出扫描 | ✅ | 无生产 `console.log`；保留的 `console.warn/error` 均为 logger、错误边界、fetch 失败上报或性能阈值告警 |

## 发布前步骤

1. 确认最新 `master` push 的 GitHub Actions 已完成：
   - `quality`
   - `build`
   - `e2e`
   - `deploy`
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
3. 如果需要完整语义搜索能力，确认生产运行环境能访问 `EMBED_SERVER_URL`。
4. 打开生产站点做冒烟测试：
   - 首页可加载。
   - 搜索可返回结果。
   - 移动端 320px 和 390px 下底栏标签可读、无横向溢出。
   - `/api/health` 返回 200。
   - `/api/search?q=ai&limit=5` 返回 JSON。
   - `/tool/figma` 可渲染。
5. 发布后检查 Sentry：
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
rtk git revert b79fdf70 --no-edit
rtk git -c http.proxy= -c https.proxy= push origin master
```

如果视觉快照收尾提交也需要一起回滚：

```powershell
rtk git revert ecdd68c8 --no-edit
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
