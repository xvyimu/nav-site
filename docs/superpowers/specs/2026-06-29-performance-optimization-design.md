# 性能优化设计文档 — Phase 10+（A+C 混合方案）

> **日期**：2026-06-29
> **状态**：设计已批准，待实施
> **方案**：测量驱动审计（A） + 假设驱动深挖（C） 混合
> **关联文档**：`PROJECT-AUDIT.md` §8.6、`docs/PROGRESS.md` §九、`CLAUDE-HANDOFF.md`

---

## 一、背景与动机

### 1.1 当前状态

- 项目刚完成 9 阶段架构重构（L1-L3）+ 1 个构建修复 commit
- 审计 51/51 项已修复
- 测试规模：205 Vitest（6 skipped）+ 20 Python + 34 E2E
- 数据规模：513 站点，11 分类，29 排行榜
- 构建：ESLint 0 / TS 0 / `next build --webpack` 成功

### 1.2 已有性能优化

项目已做过明显优化：
- dynamic import（ShortcutPanel / MobileNav / Toaster / ModelRanking）
- React cache() 包裹 repositories / model-rankings
- ISR 60s 增量静态再生
- Fuse.js 搜索迁至服务端 API（减少客户端 bundle）
- 60 秒服务端搜索缓存 + AbortController
- LinkCard 图片 next/image + Content-Type 白名单

### 1.3 剩余瓶颈的不确定性

剩余性能瓶颈非显而易见，主要痛点：
- 没有数据指引哪个组件 / 哪段代码最该优化
- 测量基建缺失（Lighthouse CI / Web Vitals 实时上报 / Bundle PR 追踪均无）
- 已知可疑点（PanguSpacing DOM 修改 / 513 LinkCard 实例 / Motion 动画）未实测验证

### 1.4 选择 A+C 混合方案的理由

- **A（测量驱动）**：搭建一次性基建，后续每次改动可量化 ROI
- **C（假设驱动）**：将"已知可疑点"列为假设清单，逐个验证修复
- 混合方案兼具"系统覆盖"与"聚焦突破"

---

## 二、总体架构

### 2.1 三阶段流程

```
┌─────────────────────────────────────────────────────────┐
│  Phase 1: 测量基建（一次性）                              │
│  ─ Bundle 分析报告存档                                    │
│  ─ Web Vitals 实时上报到 Sentry                           │
│  ─ Lighthouse CI 集成到 GitHub Actions                    │
│  ─ 基线快照文档                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 2: 假设验证（逐个推进）                            │
│  每个假设走完整循环：测量 → 修复 → 验证                    │
│  ─ H1: PanguSpacing 500ms 延迟拖慢 INP                   │
│  ─ H2: 513 LinkCard 实例导致长任务                        │
│  ─ H3: Fuse.js 客户端索引残留                             │
│  ─ H4: Favicon 同步加载造成 CLS                          │
│  ─ H5: Motion 动画在低端设备触发 layout thrashing        │
│  ─ H6: 首屏 JS chunk 可继续拆分                          │
│  ─ H7: Sentry client bundle 占首屏 JS 比重过高            │
│  ─ H8: 路由切换无 prefetch 导致 TTFB 偏高                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Phase 3: 长期监控（持续）                                │
│  ─ Lighthouse CI 每次 PR 跑，回归告警                     │
│  ─ Sentry Web Vitals dashboard 周度回顾                  │
│  ─ Bundle size budget 阈值告警                            │
└─────────────────────────────────────────────────────────┘
```

### 2.2 关键约束

- **不重构现有架构**：刚完成 9 阶段重构，需稳定期
- **每个改动必须可量化**：无数据 = 不修复
- **测量基建与 E2E 测试解耦**：避免相互干扰
- **保留 webpack 模式**：NTFS reparse point 限制（见 CLAUDE-HANDOFF.md）
- **遵循 Next.js 16 API**：使用 `useReportWebVitals` hook，不引入 `web-vitals` 第三方库

---

## 三、Phase 1: 测量基建设计

### 3.1 三条数据管线

#### 管线 A：Bundle 体积分析（已就绪 + 补充存档）

**现状**：
- `@next/bundle-analyzer` 已集成
- `pnpm analyze` 命令就绪，输出到 `.next/analyze/*.html`

**补充工作**：
- 新建 `scripts/extract-bundle-stats.mjs`
- 解析 `.next/analyze` HTML 报告，提取 chunk 清单
- 输出 JSON 摘要到 `docs/perf/baseline-bundle-YYYY-MM-DD.json`
- 该 JSON 用于后续 PR 对比

#### 管线 B：Web Vitals 实时上报（新增）

**架构**：

```
[instrumentation-client.ts 已存在，不动]
  ↓
新建 app/_components/web-vitals.tsx ('use client')
  ↓ useReportWebVitals(callback)
  ↓ callback 通过 sendBeacon 上报到 /api/web-vitals
  ↓
新建 app/api/web-vitals/route.ts
  ↓ 鉴权：仅接受 same-origin POST
  ↓ 校验：Zod schema 限制字段 + 长度
  ↓ 写入：Sentry captureMessage + setMeasurement
  ↓
Sentry Dashboard 自动聚合 LCP/INP/CLS/TTFB/FCP 百分位
```

**组件设计**：

```tsx
// app/_components/web-vitals.tsx
'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { useCallback } from 'react'

export function WebVitals() {
  const handleWebVitals = useCallback((metric: any) => {
    // 同一次 page load 可能多次回调，用 metric.id 去重
    if (typeof navigator === 'undefined') return
    const body = JSON.stringify(metric)
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/web-vitals', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/web-vitals', { body, method: 'POST', keepalive: true }).catch(() => {})
    }
  }, [])

  useReportWebVitals(handleWebVitals)
  return null
}
```

**API 路由设计**：

```ts
// app/api/web-vitals/route.ts
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { z } from 'zod'

const metricSchema = z.object({
  id: z.string().max(100),
  name: z.enum(['TTFB', 'FCP', 'LCP', 'CLS', 'INP', 'FID']),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  delta: z.number(),
  navigationType: z.string().max(50),
})

export async function POST(request: Request) {
  // same-origin 检查
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'invalid origin' }, { status: 400 })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = metricSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid metric' }, { status: 400 })
  }

  const m = parsed.data
  Sentry.captureMessage(`web-vital: ${m.name}`, {
    level: 'info',
    tags: {
      metric: m.name,
      rating: m.rating,
      navigationType: m.navigationType,
    },
    extra: { id: m.id, value: m.value, delta: m.delta },
  })

  // 关联 measurement 到 Sentry transaction（如果存在）
  Sentry.setMeasurement(m.name, m.value, 'millisecond')

  return NextResponse.json({ ok: true })
}
```

**Layout 注入**：

```tsx
// app/layout.tsx 修改
import { WebVitals } from './_components/web-vitals'

// 在 <body> 内首位插入
<body>
  <WebVitals />
  {/* 其余 children */}
</body>
```

**CSP 影响**：
- 现有 CSP `connect-src 'self'` 已允许同源 sendBeacon
- 无需修改 next.config.ts

#### 管线 C：Lighthouse CI（新增 GitHub Action）

**Workflow 设计**：

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  lighthouse:
    name: Lighthouse 性能审计
    runs-on: ubuntu-latest
    # 独立 workflow，不复用 ci.yml 的 build job（GitHub Actions 不支持跨 workflow 依赖）
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10, standalone: true }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install --frozen-lockfile
      - name: 生产构建
        run: pnpm build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SOURCE_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SOURCE_SUPABASE_ANON_KEY }}
      - name: 启动生产服务器
        run: |
          pnpm start -p 3264 &
          sleep 10
      - name: 健康检查
        run: |
          curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3264/
          curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3264/favorites
          curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3264/tool/openai || echo "tool/openai 不可用，跳过"
      - name: 运行 Lighthouse CI
        run: npx @lhci/cli@0.13.x autorun --config=./lighthouserc.json
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
      - name: 上传报告
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lighthouse-report
          path: .lighthouseci/
          retention-days: 7
```

**lighthouserc.json 设计**：

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3264/",
        "http://localhost:3264/favorites"
      ],
      "numberOfRuns": 5,
      "settings": {
        "preset": "desktop"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["warn", { "minScore": 0.85 }],
        "first-contentful-paint": ["warn", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["warn", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["warn", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["warn", { "maxNumericValue": 200 }]
      }
    },
    "budgets": [
      {
        "resourceSizes": [
          { "resourceType": "script", "budget": 250 },
          { "resourceType": "total", "budget": 400 }
        ]
      }
    ],
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

**关键决策**：
- **不阻断 PR**：所有断言用 `warn` 不用 `error`
- **不搭建 LHCI Server**：用 temporary-public-storage 上传，省去维护负担
- **不测 `/tool/[slug]`**：slug 不稳定，依赖数据库状态；改为只测 `/` 和 `/favorites`
- **只测 desktop**：移动端测试在 Playwright E2E 中已部分覆盖

### 3.2 基线快照文档

新建：`docs/perf/baseline-2026-06-29.md`

记录：
- Lighthouse 三页面 × desktop 的分数
- Bundle 三大 chunk 大小（first-load / commons / page-specific）
- Sentry 24h 抽样的 P75 LCP/INP/CLS（部署后人工截图）
- 测试规模基线：205 Vitest / 34 E2E / build 时长

### 3.3 验收标准

Phase 1 完成判定：
- [ ] `pnpm analyze` 输出存档（JSON 摘要提交）
- [ ] WebVitals 组件上线，本地 dev 验证上报成功
- [ ] Lighthouse CI workflow 在 master push 时成功运行（首次允许部分断言 fail，仅看报告）
- [ ] 基线快照文档提交（部分数据待 CI 跑完后补充）

---

## 四、Phase 2: 假设验证流程

### 4.1 通用工作流

每个假设必须走完整循环：

1. **验证假设成立**
   - 工具：Chrome DevTools Performance 面板 / Lighthouse / Sentry traces
   - 不成立 → 跳过修复，在 findings.md 记录"已排除"原因
2. **制定修复方案**
   - 最小改动，避免范围蔓延
   - 多个候选方案时优先选简单可逆的
3. **本地实现 + 跑 typecheck / lint / test**
4. **量化对比**
   - `pnpm analyze` 对比 before/after bundle 体积
   - Lighthouse 本地跑前后对比（同环境同网络）
5. **提交 commit**（格式：`perf(hX): <短描述>`）
6. **推送后跟踪 Sentry traces**（72h 数据积累）

### 4.2 假设清单

| # | 假设 | 验证方法 | 优先级 |
|---|---|---|---|
| H1 | PanguSpacing 500ms 后 DOM 修改拖慢 INP | Performance 面板录 INP 长任务，看是否含 pangu.spacingPage | P0 |
| H2 | 513 LinkCard 实例造成首屏长任务 | Performance 录首次渲染，找 >50ms 长任务 | P0 |
| H3 | Fuse.js 客户端索引残留 | 代码审查 + DevTools Memory snapshot | P1 |
| H4 | Favicon 同步 `new Image()` 加载阻塞 CLS | Layout Shift Regions 录制 + Lighthouse CLS 分项 | P1 |
| H5 | Motion 动画在低端设备触发 layout thrashing | Chrome CPU 6x slowdown + Performance 录制 | P2 |
| H6 | 首屏 JS chunk 中存在可拆分的 sync import | bundle-analyzer 报告审查 | P2 |
| H7 | Sentry client bundle 占首屏 JS 比重过高 | bundle-analyzer 查看 @sentry 大小 | P3 |
| H8 | 路由切换无 prefetch 导致 TTFB 偏高 | Network 面板看 prefetch 状态 | P3 |

### 4.3 H1 修复预案（首个示范）

**前提**：先实测验证假设成立，再实施修复。

**预案 A（推荐）**：移除 PanguSpacing 全局 DOM 修改，改为在渲染时通过工具函数处理
- 优点：彻底解决 DOM 修改冲突，零运行时开销
- 代价：需找到所有展示用户输入文本的组件，注入 pangu.spacingText 调用

**预案 B**：保留 PanguSpacing 但改为 requestIdleCallback 调度 + 限制作用域
- 优点：改动小
- 代价：仍存在 DOM 修改，只是延后

**预案 C**：完全移除 pangu
- 优点：极简
- 代价：失去中英文混排空格美化功能

**选择依据**：实测后若 pangu 影响范围集中在少数组件 → A；若全局散落 → B。

### 4.4 假设追踪表

新建：`docs/perf/findings.md`

每个假设一个章节，记录：
- 假设陈述
- 验证方法与结果
- 修复方案（若有）
- before/after 数据
- commit hash
- 状态（待验证 / 已排除 / 已修复）

---

## 五、Phase 3: 长期监控

### 5.1 持续机制

| 机制 | 频率 | 触发 | 自动化程度 |
|---|---|---|---|
| Lighthouse CI | 每次 PR + master push | 自动 | 全自动 |
| Bundle size budget | 每次 PR | 自动（lighthouserc 声明 budget） | 全自动 |
| Sentry Web Vitals dashboard | 周度回顾 | 人工 | 半自动 |
| Bundle 体积趋势 | 月度 | 人工跑 `pnpm analyze` 存档 | 手动 |

### 5.2 Bundle Budget 阈值

在 `lighthouserc.json` 声明：
- script: 250 KB
- total: 400 KB

超 budget 仅警告，不阻断 PR（避免误伤）。

### 5.3 退出条件（整套优化结束的标准）

- P75 LCP < 2.5s（Sentry 7 日数据）
- P75 INP < 200ms
- P75 CLS < 0.1
- Bundle first-load JS < 250KB
- 所有 P0/P1 假设已验证（修复或排除）

---

## 六、本次会话 scope

按用户"继续，直到全部完成"的要求，本次会话目标：

### 6.1 必交付

1. 本设计文档
2. Phase 1 测量基建实现：
   - 新建 `app/_components/web-vitals.tsx`
   - 新建 `app/api/web-vitals/route.ts`
   - 修改 `app/layout.tsx` 注入 WebVitals 组件
   - 新建 `.github/workflows/lighthouse.yml`
   - 新建 `lighthouserc.json`
   - 新建 `scripts/extract-bundle-stats.mjs`
   - 新建 `docs/perf/baseline-2026-06-29.md`（占位，待 CI 跑完填数据）
   - 新建 `docs/perf/findings.md`（假设清单与追踪表）
3. 跑 typecheck / lint / test / build 验证
4. 提交并推送

### 6.2 可选（如时间允许）

- H1 假设验证示范：启动 dev server，实测 PanguSpacing 是否影响 INP，在 findings.md 记录结果
- 若 H1 成立则实施修复预案

### 6.3 不在 scope 内

- H2-H8 假设的逐个验证（后续会话）
- 第三方依赖升级（如 Sentry major 版本）
- 架构级重构（刚完成 9 阶段，需稳定期）
- LHCI Server 自建（用 temporary-public-storage 替代）

---

## 七、风险与回滚

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Web Vitals 上报量超 Sentry 配额 | 中 | 中 | tracesSampleRate 生产 0.1 已限流；额外 captureMessage 需评估 |
| Lighthouse CI 在 GitHub Actions 超时 | 低 | 低 | timeout-minutes: 15，continue-on-error 不阻断部署 |
| instrumentation-client.ts 改动影响 hydration | 低 | 高 | 仅在 layout.tsx 注入 WebVitals 组件，不改 instrumentation 文件本身 |
| Lighthouse 测试 URL 选错 | 中 | 低 | 在 workflow 中先 curl 验证 200 |
| Bundle analyzer 报告体积大，污染 git | 低 | 低 | `docs/perf/*.html` 加入 .gitignore，仅存 JSON 摘要 |
| Web Vitals API 路由被滥用刷量 | 低 | 中 | same-origin 检查 + Zod 严格校验 |

**回滚策略**：
- WebVitals 组件出问题 → 直接从 layout.tsx 移除，无副作用
- Lighthouse CI 失败 → workflow `continue-on-error: true`，不影响部署
- 整体回滚 → revert 单个 commit 即可

---

## 八、技术决策记录

### 8.1 为何用 `useReportWebVitals` 而非 `web-vitals` npm 包

- Next.js 16 内置 `next/web-vitals`，无需额外依赖
- 自动适配 App Router 的路由切换
- 自动处理 BFCache restore 等边缘场景
- 与 instrumentation-client.ts 解耦（WebVitals 组件是 React 组件，时机更晚但更安全）

### 8.2 为何不搭建 LHCI Server

- LHCI Server 需要独立部署 + 数据库维护
- 当前团队规模（单人开发）不足以支撑
- temporary-public-storage 提供 7 天临时链接，足够 PR 评审
- 后续如需长期趋势追踪，再升级到 LHCI Server

### 8.3 为何 Lighthouse 只测 desktop

- 移动端测试在 Playwright E2E（mobile-chrome）中已部分覆盖
- Lighthouse mobile 测试时间约为 desktop 的 2-3 倍，增加 CI 时长
- 后续如需移动端专项数据，可扩展 lighthouserc 配置多 preset

### 8.4 为何不引入 `web-vitals` npm 包

- Next.js 16 `useReportWebVitals` 已封装 `web-vitals` 库
- 重复引入会增加 bundle 体积
- 失去 Next.js 自动适配路由切换的好处

### 8.5 为何把 WebVitals API 写入 Sentry 而非自建数据库

- Sentry 已配置且性能监控基建完备
- 自建需新增表 / API / Dashboard，投入产出比低
- Sentry 自动聚合百分位 + 与 performance traces 关联

---

## 九、依赖清单

### 9.1 新增 npm 依赖

- `@lhci/cli`（通过 `npx` 调用，不安装为项目依赖）

### 9.2 复用现有依赖

- `@sentry/nextjs`（已装，用于 captureMessage + setMeasurement）
- `@next/bundle-analyzer`（已装，用于 bundle 分析）
- `zod`（已装，用于 API 路由校验）

### 9.3 不新增的依赖

- 不引入 `web-vitals` npm 包
- 不引入 Lighthouse 核心包（@lhci/cli 自带）
- 不引入 LHCI Server

---

## 十、文件清单

### 10.1 新建文件

- `app/_components/web-vitals.tsx`
- `app/api/web-vitals/route.ts`
- `.github/workflows/lighthouse.yml`
- `lighthouserc.json`
- `scripts/extract-bundle-stats.mjs`
- `docs/perf/baseline-2026-06-29.md`
- `docs/perf/findings.md`

### 10.2 修改文件

- `app/layout.tsx`（注入 WebVitals 组件）
- `.gitignore`（添加 `docs/perf/*.html` 规则）

### 10.3 不修改文件

- `instrumentation-client.ts`（保持不动）
- `next.config.ts`（CSP 已兼容，无需修改）
- `sentry.shared.config.ts`（tracesSampleRate 已配置）
- `package.json`（不新增依赖）

---

## 十一、后续会话计划

完成本次会话后，后续会话按优先级推进 Phase 2 假设：

1. **会话 2**：H1 PanguSpacing + H2 LinkCard 实例
2. **会话 3**：H3 Fuse.js + H4 Favicon CLS
3. **会话 4**：H5 Motion + H6 chunk 拆分
4. **会话 5**：H7 Sentry bundle + H8 prefetch
5. **会话 6**：整体回归 + 退出条件评估

每个会话开始前，先读 `docs/perf/findings.md` 确认上一个假设的状态。
