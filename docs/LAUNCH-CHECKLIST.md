# 发布检查清单

> 最后更新：2026-07-18
> 发布分支：`master`
> 生产入口：`https://yuanjia1314.ccwu.cc`（Vercel 主轨）
> 当前生产 HEAD：`46981a1a`（见 [release-manifest-2026-07-18](./release-manifest-2026-07-18.md)）

详细操作、故障处理和回滚见[生产运行手册](./PRODUCTION-RUNBOOK.md)。

## 发布轨道

- **主生产轨：Vercel。** 将已验证的 `master` HEAD 通过 Vercel 项目 `nav-site` 部署到生产；部署后必须验证自定义域，而不是只验证预览 URL。
- **Netlify：仅紧急镜像。** 默认不构建、不部署，也不是发布验收入口。只有人工 `workflow_dispatch` 且仓库变量 `ALLOW_NETLIFY_MIRROR=1` 时，CI 的 `[Emergency] Netlify mirror` job 才可运行。
- Netlify 额度或站点状态不会阻断 Vercel 生产发布。不要为常规发布恢复 Netlify credit、启用站点或触发镜像。

## 上线前

1. 确认工作树仅有预期改动，且 `origin/master` 与待发布 HEAD 一致。
2. 运行本地门禁：

   ```powershell
   rtk pnpm test
   rtk pnpm run typecheck
   ```

3. 部署 Vercel 生产版本（需要已获授权的 Vercel 登录态）：

   ```powershell
   vercel deploy --prod --scope aijiai520 --yes
   ```

4. 记录本次 HEAD，并以主域名复验：

   ```powershell
   pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <HEAD>
   ```

## 发布验收

- `https://yuanjia1314.ccwu.cc/` 返回 200。
- `/api/health` 返回 200；`database`、`env` 为 `ok`，`checks.resourceLibrarySearch.status` 为 `ok` 或 `skipped`。
- `/build-info.json` 的 `commit` 等于待发布 HEAD。
- `/api/search?q=ai&limit=5` 返回 JSON，`/tool/figma`、`/sitemap.xml` 和 `/robots.txt` 可访问。
- `pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <HEAD>` 全部通过。

## 语义检索常开（ARCH-1）

当前生产语义检索仍依赖已配置的远程 embedding 路径；没有 Cloudflare 或 VPS 的账号、密钥和已验证端点时，**不得伪造环境变量或把健康检查改为成功**。此时保留 Fuse/FTS 降级，并通过 `HEALTH_REQUIRE_EMBEDDING=1` 或 `pnpm run verify:production -- --require-embedding` 在具备实际常开能力后启用强制验收。完整的端点、回滚和探针说明见 [生产运行手册](./PRODUCTION-RUNBOOK.md)。

## 紧急 Netlify 镜像

仅当 Vercel 主轨不可用且负责人明确批准时使用：先确认 Netlify 站点已启用、额度可用，再由人工触发 CI 并设置 `ALLOW_NETLIFY_MIRROR=1`。镜像完成后仍需按其实际 deploy URL 运行生产探针；不要把 Netlify URL 当作常规生产验收入口。

## 回滚

优先在 Vercel 恢复上一个已验证部署，或创建 revert commit 后重新部署 Vercel。完成后重复本清单的主域验证。涉及 DNS、生产环境变量、数据库或 Netlify 站点启停，先确认目标、影响和回滚方案。
