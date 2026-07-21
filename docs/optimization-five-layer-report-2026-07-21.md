# 五层深度优化变更报告（待审）

> 分支：`feature/five-layer-internal-opt`（**未合 master**）  
> 基线：`master` @ `d44de613`  
> 日期：2026-07-21  
> 约束：不改顶层分层 / 不加第三方依赖 / 不新增产品功能 / 不做架构重写  

---

## 〇、项目架构理解（优化前确认）

### 分层（ADR-003/004/006/009）

| 层 | 位置 | 职责 |
|----|------|------|
| UI RSC / Client | `app/*`, `components/*` | 渲染；公开页 RSC **直连** `@/lib/repositories` facade |
| Admin 浏览器适配 | `lib/admin/client.ts` + contracts | 隐藏 URL/method；React Query keys |
| Route Handlers | `app/api/**`, `lib/with-admin.ts` | Auth / CSRF / Zod / 限流 → domain |
| Domain use-case | `lib/search/use-case.ts` | `executeSearch` + `SearchAdapters` |
| Repositories | `lib/repositories.ts` → `lib/repositories/*` | Supabase 访问；domain 分模块 |
| Infra | supabase / rate-limit* / logger / csrf / auth | 客户端、限流、日志、认证 |

### 关键调用流

1. **首页**：`app/page.tsx` → `getCategories` / `getApprovedLinks` → `nav-derived-data` → `Navigation`  
2. **搜索**：`/api/search` → 分布式限流 → `executeSearch` → Fuse 池(60s) + embed + semantic RPC → RRF merge  
3. **Admin 链接**：RSC 直 repo 播种；浏览器 → `adminApi` → `/api/admin/*` → domain repo → `revalidatePublicNavContent`

### 不变式（本轮**未破坏**）

- 单 Next 部署；不拆微服务  
- RSC 不自调 Admin HTTP  
- Admin UI 不直连 repository（目标）  
- 搜索薄 route + deep use-case + 可注入 adapters  
- 不新加 npm 依赖  

---

## 一、优化清单（按五层）

### 第一层 · 架构解耦（边界内）

#### L1-1 Admin 链接健康 DTO 与 data-access 解耦

| 项 | 内容 |
|----|------|
| **原有缺陷** | `LinkHealthPanel`（client）从 `@/lib/repositories/link-health` 导入类型，违反 ADR-009「UI 不依赖 repositories deep module」；`admin-boundary` 测试也未覆盖该文件 |
| **优化思路** | DTO 抽到 `lib/admin/link-health-types.ts`；repository **re-export** 类型以保持服务端/测试兼容；Panel 只引 admin 类型 |
| **新旧** | 旧：`import type { LinkHealthFinding } from "@/lib/repositories/link-health"` → 新：`from "@/lib/admin/link-health-types"`；`link-health.ts` 改为 type re-export + 实现 |
| **收益** | 恢复 seam 单向依赖；后续可把 fetch 收进 `adminApi` 而不牵动 repo 类型 |

#### L1-2 边界测试补全 LinkHealthPanel

| 项 | 内容 |
|----|------|
| **原有缺陷** | 边界测试名单漏掉 `LinkHealthPanel.tsx`，允许 silent 回归 |
| **优化思路** | 加入组件名单；禁止 `@/lib/repositories`；`/api/admin` 硬编码对 Panel 暂豁免（raw fetch 既有，收 adapter 属后续） |
| **收益** | 防再引入 UI→repo deep import |

---

### 第二层 · 代码重构

#### L2-1 脚本 `loadEnv` 去重

| 项 | 内容 |
|----|------|
| **原有缺陷** | `bulk-add` / `check-links` / `backfill-link-icons` / `dedupe-figma-api` 等近乎相同的 `.env.local` 解析逻辑，漂移风险高 |
| **优化思路** | 抽出 `scripts/lib/load-project-env.mjs`（零依赖、不覆盖已有 env、支持引号剥离） |
| **新旧** | 各脚本删除本地 `function loadEnv` → `loadProjectEnv(projectRoot)` |
| **收益** | 一处修复、行为一致；不增 npm 包 |

---

### 第三层 · 核心逻辑（映射到搜索调度）

> 用户原文「记忆/智能体/token」→ 本项目对应 **搜索上下文与工具调度**（Fuse 池 + semantic 降级已有 throttling）。

#### L3-1 过滤搜索池 Fuse 实例复用

| 项 | 内容 |
|----|------|
| **原有缺陷** | `getSearchPool` 在非全量池时 **每次请求** `createFuse(pool)`；同一 category/filter 热路径重复 O(n) 建索引 |
| **优化思路** | 在现有 60s 全量缓存上，增加 **有界** `filteredFuseCache`（max 32，FIFO 淘汰），key = category+tags+rating+popularity+poolTimestamp；全量池重建时 `clear()` |
| **新旧** | 旧：`fuse: isFullPool ? fuseCache.fuse : createFuse(...)` → 新：`getOrCreateFilteredFuse(...)` |
| **收益** | 降低重复搜索时 CPU/分配；不改 API 契约；不增依赖 |

（语义 embed 已有 30s unavailable 缓存 + warn 节流，本轮不重复造。）

---

### 第四层 · 配额与性能

| 项 | 说明 |
|----|------|
| 分布式限流 Upstash + fail-closed | **已在 master 落地**，本分支不改签名 |
| Fuse 全量 60s + single-flight | 已有；本轮补过滤池复用（上条） |
| 9RPM / 53.3K TPM | **不适用本产品**（非 LLM 网关）；对应项映射为：**公开 API 限流 + embed 故障缓存**，避免下游打爆 |
| 测试注意 | 本地 User env 挂生产 `UPSTASH_*` 会使部分单测误打 Redis；测前 unset（工程文档见下） |

---

### 第五层 · 工程优化

| 项 | 内容 |
|----|------|
| 配置抽离 | `load-project-env.mjs`、`link-health-types.ts` |
| 边界测试 | `admin-boundary` 覆盖 LinkHealthPanel |
| 目录 | 新文件均落在既有 `scripts/lib`、`lib/admin`，无新顶层包 |
| 日志 | 未引入新日志框架；沿用 `logger` |

---

## 二、明确未做（防 scope 蔓延）

1. 不改 repository facade 政策 / 不引入 ORM  
2. 不上 Meili/ES / 不拆微服务  
3. 不改 `/api/admin/*` URL 与 envelope  
4. 不把 LinkHealthPanel raw `fetch` 迁到 `adminApi`（可后续，需扩 client 方法）  
5. 不统一全部 scripts 的 loadEnv（已改 4 个高频；其余同构可跟）  
6. 不合并进 `master`、不 push（待你审核）  

---

## 三、变更文件列表

| Path | 层 |
|------|----|
| `lib/admin/link-health-types.ts` | L1 新 |
| `lib/repositories/link-health.ts` | L1 type 外置 |
| `components/admin/LinkHealthPanel.tsx` | L1 import |
| `lib/repositories.ts` | L1 注释/export 说明 |
| `tests/admin-boundary.test.ts` | L1/L5 |
| `scripts/lib/load-project-env.mjs` | L2/L5 新 |
| `scripts/bulk-add.mjs` | L2 |
| `scripts/check-links.mjs` | L2 |
| `scripts/backfill-link-icons.mjs` | L2 |
| `scripts/dedupe-figma-api.mjs` | L2 |
| `lib/search/fuse.ts` | L3/L4 |

---

## 四、验证

```text
env -u UPSTASH_* vitest:
  admin-boundary, repositories-link-health, api-admin-link-health,
  search-optimization, api-search
→ 5 files / 48 tests PASS
```

---

## 五、审核建议

1. 在本机：`git checkout feature/five-layer-internal-opt && git log master..HEAD --oneline`  
2. 审 diff 后决定：merge / 再改 / 丢弃  
3. **禁止**直接在 `master` 上改；合入时用 PR 或你明确授权的 merge  

**本报告即优化总报告；等待审核，不自动合并 master。**
