## 变更描述

<!-- 简述本次变更的内容和目的 -->

## 变更类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构
- [ ] 安全修复
- [ ] 配置变更
- [ ] 文档更新

## 安全审计清单

<!-- 每次发版前必须完成的安全检查 -->

### 输入验证
- [ ] 所有用户输入通过 Zod schema 验证
- [ ] URL 输入通过 `isSafeUrl()` 校验（拒绝 javascript:/data:/file: 协议）
- [ ] SQL 查询使用参数化方式（Supabase SDK 自动参数化）
- [ ] 输出到 HTML 的内容经过转义（React 自动转义 + JSON-LD 手动转义）

### 认证与授权
- [ ] Admin API 路由调用 `requireAdmin()` 且校验 `role === "admin"`
- [ ] 公开 API 有速率限制（submit 15min/3次, click 15min/1次, login 15min/5次）
- [ ] 密码比较使用 `timingSafeEqual`（防时序攻击）
- [ ] Cookie 设置 httpOnly + secure + sameSite:lax
- [ ] JWT 使用 AUTH_SECRET 签名

### 数据安全
- [ ] 管理员写入操作通过 `createAdminClient()`（始终连开发库）
- [ ] 公开读取操作通过 `createClient()`（环境对应库）
- [ ] 环境变量未硬编码在代码中
- [ ] `.env*` 文件被 .gitignore 排除（`.env.local.example` 除外）

### CSP 与安全头
- [ ] CSP `script-src` 未引入新的不安全域名
- [ ] CSP `connect-src` 包含所有外部 API 域名
- [ ] 新增的外部资源域名已添加到 CSP
- [ ] X-Frame-Options: DENY 保持生效

### 依赖安全
- [ ] 未引入新的重型依赖（如必须引入，已在 PR 描述中说明理由）
- [ ] 新依赖无已知漏洞（`pnpm audit` 通过）
- [ ] 新依赖的 license 与项目兼容

## 验证步骤

- [ ] `pnpm test` 通过
- [ ] `pnpm tsc --noEmit` 通过
- [ ] `pnpm lint` 通过
- [ ] `pnpm build` 通过
- [ ] 手动验证核心功能（首页加载、搜索、分类切换、提交站点）

## 破坏性变更

<!-- 如果有破坏性变更（API 签名变更、数据库 schema 变更、环境变量变更等），在此说明 -->

- [ ] 无破坏性变更

## 相关 Issue

<!-- 关联的 Issue 编号，如 #123 -->
