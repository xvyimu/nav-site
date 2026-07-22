# 发布检查清单

> 最后更新：2026-07-22
> 发布分支：`master`
> 生产入口：`https://yuanjia1314.ccwu.cc`（Vercel 主轨）
> 当前生产运行时 HEAD：`ee5a047b`（见 [release-manifest-2026-07-18](./release-manifest-2026-07-18.md)）
> 仓库 HEAD 可含 ops-only 提交，不以 docs SHA 为 build-info 期望

详细操作、故障处理和回滚见[生产运行手册](./PRODUCTION-RUNBOOK.md)。

## 发布轨道

- **主生产轨：Vercel Git 集成。** 已验证的 `master` HEAD 合入/推送后由 Vercel 项目 `nav-site` 创建生产部署；GitHub Actions 不直接部署 Vercel。部署后必须验证自定义域，而不是只验证预览 URL。
- **Netlify：仅紧急镜像。** 默认不构建、不部署，也不是发布验收入口。只有人工 `workflow_dispatch` 且仓库变量 `ALLOW_NETLIFY_MIRROR=1` 时，CI 的 `[Emergency] Netlify mirror` job 才可运行。
- Netlify 额度或站点状态不会阻断 Vercel 生产发布。不要为常规发布恢复 Netlify credit、启用站点或触发镜像。

## 上线前

1. 确认工作树仅有预期改动，且 `origin/master` 与待发布 HEAD 一致。
2. 运行本地门禁：

   ```powershell
   rtk pnpm test
   rtk pnpm run typecheck
   ```

3. （可选）确认 PWA 图标可再生成，且安全头矩阵仍为当前 SSOT（不改 `next.config` / `proxy`）：

   ```powershell
   pnpm run icons:pwa
   # 矩阵：docs/ops/security-headers-matrix-2026-07-22.md
   # AS-IS/TARGET：docs/ops/security-headers-as-is-target-2026-07-22.md
   # 只读头探测（默认 localhost；生产域需 --allow-production）：
   pnpm run probe:headers -- --base-url http://127.0.0.1:3264 --compare-repo
   ```

4. 在已获批准的合入/推送后，等待 Vercel Git 集成完成生产部署。不要把 CLI `vercel deploy --prod` 当作标准路径；手动部署属于带外生产操作，须单独获批。

   ```powershell
   # Vercel Dashboard：确认与 master HEAD 对应的 Production deployment 已 Ready
   # 记录 deployment 对应 commit，随后执行下一步主域验收。
   ```

5. 记录本次 HEAD，并以主域名复验：

   ```powershell
   pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <HEAD>
   ```

## 发布验收

- `https://yuanjia1314.ccwu.cc/` 返回 200。
- `/api/health` 返回 200；`database`、`env` 为 `ok`，`checks.resourceLibrarySearch.status` 为 `ok` 或 `skipped`。
- `/build-info.json` 的 `commit` 等于待发布 HEAD。
- `/api/search?q=ai&limit=5` 返回 JSON，`/tool/figma`、`/sitemap.xml` 和 `/robots.txt` 可访问。
- `pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit <HEAD>` 全部通过。
- （可选）只读安全头：`pnpm run probe:headers -- --base-url https://yuanjia1314.ccwu.cc --allow-production --compare-repo`（默认禁生产域作 canary；见 `docs/ops/security-headers-matrix-2026-07-22.md`）。

## 语义检索常开（ARCH-1）

当前生产语义检索仍依赖已配置的远程 embedding 路径；没有 Cloudflare 或 VPS 的账号、密钥和已验证端点时，**不得伪造环境变量或把健康检查改为成功**。此时保留 Fuse/FTS 降级，并通过 `HEALTH_REQUIRE_EMBEDDING=1` 或 `pnpm run verify:production -- --require-embedding` 在具备实际常开能力后启用强制验收。完整的端点、回滚和探针说明见 [生产运行手册](./PRODUCTION-RUNBOOK.md)。

## 紧急 Netlify 镜像

仅当 Vercel 主轨不可用且负责人明确批准时使用：先确认 Netlify 站点已启用、额度可用，再由人工触发 CI 并设置 `ALLOW_NETLIFY_MIRROR=1`。镜像完成后仍需按其实际 deploy URL 运行生产探针；不要把 Netlify URL 当作常规生产验收入口。

## 回滚

优先在 Vercel 恢复上一个已验证部署，或创建 revert commit 后重新部署 Vercel。完成后重复本清单的主域验证。涉及 DNS、生产环境变量、数据库或 Netlify 站点启停，先确认目标、影响和回滚方案。
