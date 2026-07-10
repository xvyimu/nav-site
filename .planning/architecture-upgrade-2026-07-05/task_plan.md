# 任务计划：nav-site 架构升级收尾

## 目标
按“improve-codebase-architecture -> architect -> superpower -> code-review-and-quality”流程推进 nav-site 生产上线前的架构收尾：先形成架构建议和 ADR，再选择一个低风险方向完成 TDD 实现、验证和交接。

## 当前阶段
阶段 7：生产运行手册 + 统一健康检查收尾

## 各阶段

### 阶段 1：上下文恢复与架构扫描
- [x] 读取架构、ADR、Superpower、TDD、Review 技能说明
- [x] 读取项目 AGENTS.md、最新 handoff、git 状态
- [x] 扫描搜索、数据访问、健康检查、Netlify 部署等待脚本
- **状态：** complete

### 阶段 2：架构建议与 ADR
- [x] 输出架构升级建议文档
- [x] 为前 3 个方向写 ADR 草案
- **状态：** complete

### 阶段 3：TDD 实现
- [x] RED：为 Netlify 部署等待脚本写可导入、纯匹配、失败态测试
- [x] GREEN：重构脚本为纯函数 + 薄 CLI
- [x] REFACTOR：保持 CLI 行为不变，清理命名和错误信息
- **状态：** complete

### 阶段 4：验证
- [x] 目标测试通过
- [x] lint 通过
- [x] typecheck 通过
- [x] 相关/全量测试按风险运行
- [x] build 通过
- **状态：** complete

### 阶段 5：最终审查与交接
- [x] code-review-and-quality 五轴复查
- [x] 写入 Claude Code handoff checkpoint
- [x] 汇总剩余风险
- **状态：** complete

### 阶段 6：资源库健康探针 service role 收口
- [x] RED：补 `/api/resource-search-status` 优先公开 RPC 的测试
- [x] GREEN：实现 anon public health RPC 优先，不再用 service role 做健康探针
- [x] REFACTOR：同步资源库公开读 SQL/env/README
- [x] 验证：定向测试、lint、typecheck、必要全量测试
- [x] 交接：说明生产库需执行 SQL 与配置 anon key
- **状态：** complete

### 阶段 7：生产运行手册 + 统一健康检查收尾
- [x] RED：补 `/api/health` 资源库公开 RPC 健康项测试
- [x] GREEN：`/api/health` 暴露 `resourceLibrarySearch`
- [x] RED/GREEN：生产探针识别 `resourceLibrarySearch=error`
- [x] 文档：新增 `docs/PRODUCTION-RUNBOOK.md`
- [x] 验证：定向测试、lint、typecheck、必要全量测试、build
- [x] 交接：汇总 remaining production ops
- **状态：** complete

## 已做决策
| 决策 | 理由 |
|------|------|
| 文档采用 repo 内 Markdown + ADR | 比临时 HTML 更适合后续 Claude Code 接手与版本追踪 |
| 本轮实现选 Netlify 部署等待脚本 | 与当前生产发布风险直接相关，改动低风险、测试面清晰 |
| 暂不拆 `lib/repositories.ts` | 影响面大，先用 ADR 固定方向，后续按域分批迁移 |
| 暂不改搜索编排接口 | 搜索质量近期已多次修改，应先稳定 adapter 设计再动实现 |
| 资源库健康探针先做公开 RPC 优先 | 能进一步缩小公开路径 service role 使用面，同时保留 fallback 降低生产切换风险 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| codebase-memory-mcp 图谱工具未暴露 | 1 | 按 AGENTS.md 回退到 rtk/rg |
| handoff 内容落后于当前 git 状态 | 1 | 以 clean worktree、当前 commit 和源码为准 |
