# nav-site 架构优化方案

Status: Accepted
Date: 2026-07-06
Scope: 现有导航站架构优化；已按低风险阶段落地

Implementation status:

- Phase 1: reviews/favorites repository modules implemented.
- Phase 2: links/categories/tags/admin/submissions repository modules implemented.
- Phase 3: `SearchAdapters` seam implemented and ADR-004 accepted.
- Phase 4: navigation URL state, server search, derived IA, and keyboard hooks split behind the `useLinksFilter` facade.

## 1. 背景

nav-site 已经完成搜索质量、视觉重构、上线门禁、生产探针、Netlify 部署等待模块等多轮收尾。当前代码质量链路可通过，生产上线的主要外部阻塞是 Netlify account credit。下一阶段的价值不在继续堆功能，而在降低长期维护成本，让搜索、分类、标签、评价、收藏、管理录入这些核心导航站能力拥有更清晰的 module、interface 和测试 surface。

本方案基于只读扫描以下内容形成：

- 项目文档：`README.md`、`PRODUCT.md`、`docs/PROGRESS.md`、`docs/LAUNCH-CHECKLIST.md`
- 已有 ADR：`docs/adr-003-data-access-domain-modules.md`、`docs/adr-004-search-adapter-seam.md`、`docs/adr-005-netlify-deploy-wait-module.md`
- 核心代码：`lib/repositories.ts`、`lib/search/*`、`components/useLinksFilter.ts`、`app/page.tsx`、`components/Navigation.tsx`
- API 与验证：`app/api/*`、`lib/schemas.ts`、`.github/workflows/ci.yml`、`scripts/check-launch-readiness.mjs`

## 2. 优化目标

1. 降低数据访问层维护成本：把 `lib/repositories.ts` 从宽 interface、混合 implementation，逐步加深为按业务域组织的 deep modules。
2. 稳定搜索体验：保留现有 RRF、语义搜索、Fuse 回退逻辑，只显式化 adapter seam，减少跨 module mock。
3. 明确信息架构：把分类层级、标签交叉筛选、URL 状态、SEO 页面和内容运营流程分清楚，避免“代码已有能力”和“运营闭环已完成”混用。
4. 保持上线安全：每阶段保持 facade 兼容、测试先行、diff 小、可 revert。

## 3. 当前架构判断

### 3.1 已经做得好的部分

- `app/api/search/route.ts` 很薄，只做 request id、参数校验、use-case 调度和响应。
- `lib/search/use-case.ts` 已经是相对 deep 的 module，调用方只需要 `executeSearch()`。
- `lib/search/fuse.ts`、`semantic.ts`、`merge.ts`、`types.ts` 已经形成搜索内部结构。
- `app/page.tsx` 已把部分导航派生数据前置到服务端预计算，减少客户端重复 `useMemo`。
- CI 有 quality/build/E2E/deploy/link-check，另有 production smoke monitor 和 launch readiness gate。

### 3.2 主要架构摩擦

#### A. `lib/repositories.ts` interface 过宽

同一个文件承载公开链接读取、分类、工具详情、评价、admin CRUD、标签同步、用户提交、收藏、点击校验和迁移缺失错误。调用方获得了统一入口，这是有 leverage 的；但 implementation 和权限语义混在一起，locality 不足。评价隐私、收藏 RLS 绕过、admin service_role、标签可选迁移等问题都需要在同一文件审查。

#### B. repository 测试 surface 过重

`tests/repositories.test.ts` 需要巨型 `MockDB` 来覆盖所有域。这个 mock 同时模拟公开读、admin 写、评价、收藏、标签和 Supabase query builder 链式调用。测试能跑，但 interface 不是自然的业务 surface。

#### C. 搜索 seam 仍是隐式的

搜索 use-case 本身较深，但 `getSearchPool`、`getEmbedding`、`searchSemantic`、`logger`、`Date.now()` 都通过直接 import 或全局状态进入。测试中需要 `vi.mock` repositories、Supabase、logger 等多个 module。ADR-004 已提出 `SearchAdapters`，但尚未落地。

#### D. `components/useLinksFilter.ts` 已拆局部 hook，但文件仍承担多重职责

它同时处理 URL 双向同步、server search fetch、派生数据、键盘导航和公开返回 shape。当前结构可维护，但后续如果继续加标签、排序、推荐解释、保存视图等能力，interface 会继续变宽。

#### E. 文档状态需要校准

项目文档里“标签系统”“分类层级”“500+ 站点”等表述在不同文件中存在历史状态差异。代码已有 `parent_id`、标签 schema、标签筛选 UI 与迁移文件，但还需要确认生产数据、内容运营流程、SEO 页面和管理后台是否形成完整闭环。

## 4. 候选方案

| 维度 | 方案 A：repository 按域 deep modules | 方案 B：搜索 adapter seam | 方案 C：导航状态 module 拆分 |
|---|---|---|---|
| 核心改动 | 保留 `lib/repositories.ts` facade，拆出 `reviews/favorites/links/admin/categories/tags` | 给 `executeSearch` 增加可选 adapters，默认生产 adapter + 测试 adapter | 把 URL/filter/server-search/keyboard 拆到 `components/navigation/*` 或 `lib/navigation/*` |
| 实现复杂度 | 中，需要分批迁移并保持导出兼容 | 中低，改动集中但要保护搜索质量 | 中，前端回归面较大 |
| 运行风险 | 中，涉及 API 和页面数据读取 | 中低，路由调用保持不变 | 中，影响首页主要交互 |
| 测试收益 | 高，按域测试替代巨型 MockDB | 高，减少跨 module mock | 中，能更细测 URL/键盘/派生逻辑 |
| 业务收益 | 高，评价/收藏/admin/提交更好维护 | 中高，搜索稳定性更好诊断 | 中，后续 IA 功能更好扩展 |
| 推荐阶段 | 第一阶段 | 第二阶段 | 第三阶段 |

推荐先执行方案 A。理由：repository 是当前最宽的 interface，也是评价隐私、收藏权限、admin 写入、标签迁移等安全/业务语义的集中点；拆分后能直接降低后续功能迭代风险。

## 5. 推荐实施路线

### Phase 1：repository facade 后按域拆分

目标：不改调用方 import，不改 API response，不改数据库 schema，只移动 implementation。

建议顺序：

1. 新建 `lib/repositories/shared.ts`
   - 放 `MissingDatabaseMigrationError`
   - 放 missing relation 判断
   - 放 `mapLinkRow`
   - 放 optional tags fallback 日志
2. 新建 `lib/repositories/reviews.ts`
   - 迁移 `getToolReviews`
   - 迁移 `getReviewStats`
   - 迁移 `hasUserReviewed`
   - 迁移 `createReview`
   - 迁移 `checkReviewRateLimit`
   - 迁移 `recordReviewAttempt`
3. 新建 `lib/repositories/favorites.ts`
   - 迁移 `getUserFavorites`
   - 迁移 `addUserFavorites`
   - 迁移 `removeUserFavorite`
   - 迁移 `clearUserFavorites`
4. `lib/repositories.ts` 暂时只 re-export，保持兼容 facade。
5. 拆分测试：新增 `tests/repositories-reviews.test.ts`、`tests/repositories-favorites.test.ts`，保留旧测试直到迁移完成。

验收：

- `pnpm test tests/repositories.test.ts tests/api-reviews.test.ts tests/api-json-boundary.test.ts`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`

### Phase 2：links/categories/tags/admin 拆分

目标：把公开读和 admin 写分离，强化权限 locality。

建议 module：

- `lib/repositories/links.ts`：`getApprovedLinks`、slug、related、agent API 读
- `lib/repositories/categories.ts`：公开分类读 + admin 分类 CRUD
- `lib/repositories/tags.ts`：tag CRUD + link tag attach/sync
- `lib/repositories/admin-links.ts`：admin link CRUD
- `lib/repositories/submissions.ts`：URL 去重、submitLink、approved link 校验

验收重点：

- 首页 `/` 数据读取
- `/tool/[slug]`
- `/api/tools`
- `/api/submit`
- admin CRUD
- 标签缺表 fallback

### Phase 3：搜索 adapters 显式化

目标：保持 `executeSearch({ params, requestId })` 生产调用不变，新增测试 adapter。

建议 interface：

```ts
interface SearchAdapters {
  getSearchPool: typeof getSearchPool;
  getEmbedding: typeof getEmbedding;
  searchSemantic: typeof searchSemantic;
  logger: Pick<typeof logger, "info" | "warn" | "error" | "debug">;
  now: () => number;
}
```

执行原则：

- 先加可选参数，不重写搜索算法。
- 先迁移 `tests/search-use-case.test.ts` 到 adapter 注入。
- 保持 `tests/search-optimization.test.ts` 的 RRF/阈值对抗用例不变。

### Phase 4：导航状态与信息架构收束

目标：为分类层级、标签组合、URL 可分享状态和 SEO 做长期维护准备。

建议拆分：

- `lib/navigation/url-state.ts`：URL 参数 parse/serialize，覆盖 `q/cat/tag/minRating/popularity/semantic`
- `lib/navigation/derived.ts`：筛选、分区、排序、flat results
- `components/navigation/useServerSearch.ts`：客户端 fetch + debounce + abort
- `components/navigation/useKeyboardNav.ts`：键盘导航

同时更新文档，区分：

- schema 能力：数据库和类型是否支持
- UI 能力：用户是否能筛选/浏览
- admin 能力：运营是否能维护
- SEO 能力：是否有可索引页面或 sitemap

## 6. 风险与控制

| 风险 | 控制 |
|---|---|
| facade 与新域 module 重复实现 | 每次只迁移一个域，迁移完成后删除旧 implementation，只保留 re-export |
| service_role/anon 权限语义被误改 | Phase 1 先拆 reviews/favorites，测试覆盖 service_role 调用与隐私字段不泄露 |
| 搜索排序回归 | adapter 化不改 `mergeResults`、`MIN_SEMANTIC_SIMILARITY`、RRF 常量和 golden tests |
| 首页交互回归 | 导航状态拆分放到 Phase 4，必须跑 Playwright 移动端与视觉关键用例 |
| 发布阻塞误判 | 代码验证与生产上线分开；Netlify credit 未恢复前不把 launch readiness 判定为通过 |

## 7. ADR 计划

建议新增或更新：

- `docs/adr-006-repository-domain-modules-rollout.md`
  - 记录 facade 保留策略、拆分顺序、权限语义、测试迁移策略
- 更新 `docs/adr-004-search-adapter-seam.md`
  - 补充最终 `SearchAdapters` interface、默认 adapter、测试 adapter 形状
- `docs/adr-007-navigation-state-and-information-architecture.md`
  - 记录 URL 状态、分类层级、标签组合、SEO 可索引范围

## 8. 不建议现在做

- 不建议一次性重写 `lib/repositories.ts`。
- 不建议引入 ORM 替代 Supabase query builder。
- 不建议把搜索拆成独立微服务。
- 不建议在 Netlify credit 阻塞未解除前做生产部署切换决策。
- 不建议在 repository 拆分同时改视觉或交互。

## 9. 确认后第一步

如果确认本方案，建议第一轮只做 Phase 1 的 reviews/favorites 拆分：

1. 写 ADR-006。
2. 增加 reviews/favorites 域测试。
3. 拆出 `lib/repositories/shared.ts`、`reviews.ts`、`favorites.ts`。
4. `lib/repositories.ts` 维持原有导出。
5. 跑 targeted tests、全量 test、typecheck、lint、build。
6. 交付一份变更说明，说明没有改数据库 schema、没有改 API response。
