# 安全策略

## 报告漏洞

nav-site 非常重视安全性。如果您发现了安全漏洞，请**不要**公开提交 Issue，而是通过以下方式私密报告：

1. **GitHub Security Advisory**：在仓库页导航到 `Security` → `Report a vulnerability`
2. **直接联系**：通过提交 Issue 说明"安全报告"并附上联系方式

我们会在 48 小时内确认收到报告，并在修复后公开致谢。

## 安全承诺

- 所有安全报告将在 14 天内评估并给出修复计划
- 高危漏洞优先修复，通常在 72 小时内发布补丁
- 修复后将在 CHANGELOG 中记录，不披露具体细节直到用户完成升级

## 安全审计清单

每次发版前必须完成以下安全检查：

### 输入验证
- 所有用户输入通过 Zod schema 验证
- URL 输入通过 `isSafeUrl()` 校验（拒绝 `javascript:` / `data:` / `file:` 协议）
- SQL 查询使用参数化方式（Supabase SDK 自动参数化）
- 输出到 HTML 的内容经过转义（React 自动转义 + JSON-LD 手动转义）

### 认证与授权
- Admin API 路由调用 `requireAdmin()` 且校验 `role === "admin"`
- 公开 API 有速率限制（submit 15min/3次, click 15min/1次, login 15min/5次）
- 密码比较使用 `timingSafeEqual`（防时序攻击）
- Cookie 设置 httpOnly + secure + sameSite:lax
- JWT 使用 `AUTH_SECRET` 签名

### 数据安全
- 管理员写入操作通过 `createAdminClient()`
- 公开读取操作通过 `createClient()`
- 环境变量未硬编码在代码中
- `.env*` 文件被 `.gitignore` 排除（`.env.local.example` 除外）

### CSP 与安全头
- Content Security Policy 严格配置，限制脚本来源
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

## 已知安全措施

参见 `docs/PROGRESS.md` Phase 12 代码扫描修复章节，以及 `.github/PULL_REQUEST_TEMPLATE.md` 的完整安全审计清单。
