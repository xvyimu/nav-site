# 贡献指南

感谢您对综合导航站的关注！以下是一些参与贡献的指南。

## 提交 Issue

- **Bug 报告**：使用 Bug 报告模板，包含复现步骤、环境信息和预期行为
- **功能请求**：使用功能请求模板，清晰描述场景和需求
- **站点推荐**：说明站点名称、URL、分类和简短描述

## 提交 Pull Request

1. Fork 仓库并创建你的分支 (`git checkout -b feature/your-feature`)
2. 确保通过所有质量检查：

   ```bash
   pnpm lint        # ESLint — 0 errors
   pnpm tsc         # TypeScript 类型检查 — 0 errors
   pnpm test        # 单元测试 — 全部通过
   pnpm build       # 生产构建 — 成功
   ```

3. 提交前对照 `.github/PULL_REQUEST_TEMPLATE.md` 的安全审计清单逐项检查
4. 提交 PR 时请填写模板中的所有检查项

## 开发规范

### 命名约定
- **文件**：kebab-case（`link-card.tsx`）
- **函数/变量**：camelCase（`getApprovedLinks`）
- **组件**：PascalCase（`LinkCard`）
- **类型/接口**：PascalCase（`NavLink`）
- **数据库列**：snake_case（`click_count`）

### 代码风格
- 使用 TypeScript 严格模式（`strict: true`）
- 优先使用 `const` / `let`，避免 `var`
- 使用 JSDoc 注释公开 API
- 避免 `any` 类型

### 组件规范
- 服务端组件优先，仅在需要交互时使用 `"use client"`
- Props 使用 TypeScript 接口定义并导出
- 使用 Lucide React 图标，不使用 emoji

### 数据访问
- 所有数据库操作通过 `lib/repositories.ts` 抽象层
- API 路由不应直接调用 Supabase 客户端
- 使用 Zod schema 验证所有输入

## 提交信息格式

```
<type>: <简短描述>

<详细说明（可选）>
```

类型前缀：
- `feat` — 新功能
- `fix` — Bug 修复
- `chore` — 杂项（配置、依赖等）
- `refactor` — 重构
- `security` — 安全修复
- `docs` — 文档
- `ci` — CI/CD
- `test` — 测试

示例：
```
fix: 修复分类过滤在移动端不显示的问题

overflow-x-auto 被限制在 4 个分类，移除 slice 后支持横向滚动。
```

## 架构参考

- 项目架构详见 `DESIGN-DOC.md`
- 架构决策记录见 `docs/adr-*.md`
- 进度追踪见 `docs/PROGRESS.md`
