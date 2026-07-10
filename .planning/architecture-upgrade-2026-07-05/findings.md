# 发现与决策：架构升级收尾

## 当前事实
- 当前分支：`master...origin/master`，工作树起始为 clean。
- 最新提交包括 Netlify 部署等待和 master -> main mirror：
  - `522a2140 ci: mirror master for netlify deploy`
  - `fb1ea366 ci: wait for netlify git deploy`
- `vitest.config.ts` 仅包含 `**/*.test.{ts,tsx}`，脚本测试应放在 `tests/*.test.ts`。
- 最新 handoff 提到的未跟踪文件/迁移事项已落后于当前状态，不能作为当前事实。

## 架构扫描发现

### 1. 数据访问 module 过宽
- 文件：`lib/repositories.ts`
- 现状：分类、链接、详情页、评价、admin CRUD、标签、提交、点击、收藏混在一个 module。
- interface 接近 implementation：调用方需要知道很多函数名、客户端类型、回退语义和错误习惯。
- locality 弱：评价隐私、收藏 RLS、标签可选迁移、链接查询缓存都挤在同一文件。
- 删除测试：删除该 module 会把复杂性扩散到多个页面和 API，说明它有价值；但它内部可按域加深。

### 2. 搜索编排已有深度，但 adapter seam 仍隐式
- 文件：`lib/search/use-case.ts`、`lib/search/semantic.ts`、`lib/search/fuse.ts`、`lib/search/merge.ts`
- `executeSearch` 已经让路由层很薄，这是好方向。
- 当前 seam 仍由隐式全局组成：`getSearchPool`、`getEmbedding`、`searchSemantic`、logger、Date。
- 测试通过 `vi.mock` 替换 module，说明 seam 存在但没有被 interface 命名。
- 继续加功能时应先定义 `SearchAdapters`，让测试和生产各有 adapter。

### 3. Netlify 部署等待脚本是浅 CLI module
- 文件：`scripts/wait-netlify-deploy.mjs`
- 现状：env 读取、Netlify API、匹配逻辑、轮询、GitHub output、process.exit 都在顶层。
- interface 只有“执行这个脚本”，implementation 包含大量可测试行为。
- 风险：CI 中失败时不容易定位是 token/site/branch/commit/created_at 匹配哪一处出了问题。
- 本轮选择它作为实现切片：收益直接指向生产发布稳定性，改动不会影响用户路径。

## 风险边界
- 不读取 `.env.local`，避免 secrets 泄露。
- 不直接操作 Supabase 生产库，除非另起明确迁移/验证任务。
- Netlify/GitHub 实时 CI 状态需要联网外部验证；本轮先提高本地脚本可测性。

## 2026-07-08 资源库健康探针发现
- `/api/resource-search-status` 仍直接依赖 `RESOURCE_LIBRARY_SERVICE_ROLE_KEY` 调用 `search_pages_vector` 做探测。
- 已有 `lib/resource-library/client.ts` 可承载资源库公开读边界，适合继续加入公开 health RPC client。
- 本地可做：测试、route 优先级、env/README/SQL 模板。
- 不在本轮做：执行 Resource Library 生产 SQL、配置 Netlify/GitHub secret、移除 service role fallback。
