# 搜索用例架构优化设计

> 日期：2026-07-04
> 状态：待用户确认后实施
> 方向：方案 B，Deepen the search use-case module
> 范围：`/api/search` 调度层、搜索响应模型、相关测试

## 一、背景

项目的搜索能力已经完成多轮优化：服务端 Fuse.js、pgvector 语义搜索、BGE query prefix、短查询保护、RRF 混排、业务信号微调、facets/suggestions/recommendations 和 golden query 测试。当前文件结构已经把若干 implementation 分散到 `lib/search/*`：

- `params.ts`：URL 参数解析、request id、日志上下文。
- `fuse.ts`：Fuse 缓存、搜索池、Fuse 结果转换。
- `semantic.ts`：embedding 端点、pgvector RPC、语义结果转换。
- `merge.ts`：RRF 混排、结果装饰。
- `search-experience.ts`：facets、suggestions、highlights、zero-result recommendations。

但 `app/api/search/route.ts` 仍然知道这些模块的调用顺序和 fallback 规则。换句话说，adapter 已拆开，use-case 还没有成型。route module 的 interface 过宽，implementation 细节泄漏到 Next.js route 中，导致测试也经常要从 `NextRequest` 进入整条链路。

## 二、目标

1. 让 `/api/search` route 变薄，只负责 request id、参数校验、调用 use-case、返回 `NextResponse`。
2. 新增一个 deep search use-case module，集中调度 Fuse、semantic、merge、facets、suggestions、fallback 和 telemetry。
3. 保持现有 API 响应 shape 稳定，不影响前端 `useServerSearch`。
4. 让核心搜索行为可以绕开 `NextRequest` 直接测试，降低测试摩擦。
5. 不改数据库 schema，不改 RPC 契约，不改 embedding 微服务接口。

## 三、非目标

- 不改变 RRF 算法本身。
- 不调整 `MIN_SEMANTIC_SIMILARITY` 或短查询阈值。
- 不重写 `lib/search/fuse.ts`、`semantic.ts`、`merge.ts` 的内部算法。
- 不改搜索 UI、视觉样式、筛选控件。
- 不新增运行时依赖。

## 四、推荐设计

新增 `lib/search/use-case.ts`，作为搜索请求的 use-case module。它提供一个小 interface：

```ts
export interface ExecuteSearchInput {
  params: SearchParams;
  requestId: string;
  startedAt?: number;
}

export interface SearchResponseModel {
  status: number;
  headers: Record<string, string>;
  body: SearchApiBody;
}

export async function executeSearch(input: ExecuteSearchInput): Promise<SearchResponseModel>
```

`SearchApiBody` 抽出当前 `/api/search` 的响应 shape，放在 `lib/search/types.ts` 或 `lib/search/use-case.ts` 中。route 不需要知道 semantic 是否 fallback，也不需要知道 facets 从哪来。

### Module 形状

Before：

```text
route.ts
  -> parseSearchParams
  -> expandQueryTerms
  -> getSearchPool
  -> buildSearchFacets
  -> buildSearchSuggestions
  -> getEmbedding
  -> searchSemantic
  -> mergeResults
  -> decorateResults
  -> logger
  -> NextResponse
```

After：

```text
route.ts
  -> zod query guard
  -> parseSearchParams
  -> executeSearch
  -> NextResponse

executeSearch
  -> query expansion
  -> Fuse adapter
  -> semantic adapter
  -> ranker
  -> experience model
  -> telemetry context
```

这样 use-case module 的 interface 小，implementation 吸收当前散在 route 里的行为，depth 提升。

## 五、数据流

1. `route.ts` 读取 `searchParams`，执行现有 `searchQuerySchema.safeParse`，保留早失败能力。
2. `route.ts` 调用 `parseSearchParams(searchParams, requestId)`。若返回 `NextResponse`，维持当前 400 行为。
3. 成功后调用 `executeSearch({ params: parsed, requestId, startedAt })`。
4. `executeSearch` 根据 `params.q` 走两条路径：
   - 空查询：返回空 results、facets、suggestions、zero-result recommendations。
   - 非空查询：构建 Fuse candidates；若 `semantic=true` 且 query 长度足够，尝试 embedding + semantic candidates；最后 merge/decorate。
5. `route.ts` 用 `SearchResponseModel` 构造 `NextResponse.json(body, { status, headers })`。

## 六、错误处理

保留当前语义：

- 参数错误仍返回 400，并带 `x-request-id`。
- 搜索 implementation 抛错时仍返回 `{ error: "Search failed", results: [], total: 0 }` 和 500。
- embedding 不可用、RPC 失败、semantic empty 都不抛到 route，继续返回 semantic mode 下的 Fuse fallback。
- 日志仍不记录 raw query，只记录 hash、长度、request id、duration 和候选数量。

新增约束：

- `executeSearch` 内部 catch 应只覆盖搜索 use-case，不吞掉 route 参数校验。
- `fallbackReason` 继续只出现在 semantic 响应中。
- `Cache-Control: no-store` 行为保持：空查询不强制 no-store，非空查询保持 no-store。

## 七、测试计划

### 新增或迁移测试

1. `tests/search-use-case.test.ts`
   - 空 query 返回空 results、facets、suggestions、recommendations。
   - Fuse mode 返回 decorated results、facets、suggestions。
   - semantic mode 短 query 跳过 embedding，`fallbackReason=short_query`。
   - embedding unavailable 时 fallback 到 Fuse，`fallbackReason=embedding_unavailable`。
   - semantic empty 时 fallback 到 Fuse，`fallbackReason=semantic_empty`。
   - route 不记录 raw query，可通过 use-case telemetry context 断言。

2. `tests/api-search.test.ts`
   - 保留 route 参数校验、`x-request-id`、NextResponse shape 的测试。
   - 减少对内部 fallback 调度的断言，避免 route 测试承担 use-case 测试。

3. `tests/search-optimization.test.ts`
   - 保持现有 7 项优化测试。
   - 如果 import path 受影响，只调整到新的 use-case 或继续走 route，行为不变。

### 验证命令

```powershell
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test
rtk git diff --check
rtk node scripts/pre-commit-secret-scan.mjs
```

## 八、实施顺序

1. 在 `lib/search/types.ts` 增补 `SearchApiBody`、`SearchResponseModel` 类型。
2. 新建 `lib/search/use-case.ts`，先搬迁 `route.ts` 的成功路径逻辑，保持行为一致。
3. 修改 `app/api/search/route.ts`，只保留参数 guard、`parseSearchParams`、`executeSearch`、统一 catch。
4. 添加 `tests/search-use-case.test.ts`，覆盖 use-case 的核心分支。
5. 调整 `tests/api-search.test.ts` 中与 implementation 绑定过深的断言。
6. 跑全量验证。

## 九、风险与回滚

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 响应 shape 细节变化 | 前端搜索面板可能丢字段 | 先定义 `SearchApiBody`，迁移前后用测试锁定字段 |
| fallbackReason 行为变化 | 影响调试和测试 | use-case 测试覆盖三种 fallback |
| logger context 变动 | 可观测性回退 | 保留 `searchLogContext`，只移动调用位置 |
| route 参数校验顺序变化 | 坏请求可能加载搜索数据 | 早失败测试保留在 `api-search.test.ts` |

回滚策略：该优化应保持单提交实施。若上线后搜索异常，直接 revert 实现提交；设计文档无需回滚。

## 十、自检

- 完整性扫描：无未完成标记。
- 一致性检查：目标、非目标、实施顺序均只覆盖搜索 use-case，不包含 UI 或 schema 变更。
- Scope 检查：一个可独立实施的 architecture slice。
- 歧义检查：route 和 use-case 的责任边界已明确，fallback 语义已列出。
