# 值守与告警通道 — 2026-07-18

> 配套：`docs/ops-observability-baseline.md`  
> 状态：**首版填空完成（推荐默认）**；可按人改

## 1. 值守人

| 角色 | 人 | 时段 |
|---|---|---|
| 主值守 | **仓库 owner（yuanjia / aijiai520）** | 工作日 10:00–22:00（本地） |
| 备份 | 同主值守（单人项目） | — |

> 单人项目：主/备同一人。有第二人时改本表。

## 2. 告警通道（推荐顺序）

| 优先级 | 通道 | 用途 |
|---|---|---|
| P0 | **Sentry 邮件**（项目已配置 DSN → Sentry 账户邮箱） | 错误 / 未处理异常 |
| P1 | **Vercel 部署通知**（Git 集成 → 失败邮件） | 构建/部署失败 |
| P2 | 人工抽检清单（下文） | 无 pager 时的最低值守 |

**不强制本轮**：企业微信/Telegram bot、PagerDuty。需要时再加 webhook。

### Sentry 建议设置（Dashboard 点选）

1. Project → Alerts → 默认 **Issue alert**：新 issue 立刻邮件  
2. 可选：`error` 事件 5 分钟 ≥10 次 → 邮件  
3. Web Vitals：暂不设阈值告警（仅观察 `web-vital` 消息 7 天）

### Vercel

1. Project → Settings → Notifications：Deployment Failed = on  
2. Preview Protection：见 `docs/preview-env-setup.md`（Standard / 私有仓库可 Disabled）

## 3. 发布后 1h 清单（主值守）

```powershell
cd D:\nav-site
pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit (git rev-parse HEAD)
# 或固定期望：
# pnpm run verify:production -- --base-url https://yuanjia1314.ccwu.cc --expect-commit ee5a047b29e030afc60e75e57b0be913e6b2fd00
```

手动：

1. 打开 https://yuanjia1314.ccwu.cc/api/health → `status=healthy`，`checks.embedding` 尽量 `ok`  
2. 首页硬刷新：卡片图标无破图  
3. `/admin` 能登录（生产凭据）  
4. Sentry：无新增 critical issue  

## 4. 阈值（执行口径）

沿用 `ops-observability-baseline.md` §2：

- health degraded 连续 2 次 → 查 embed / DB  
- probe 连续 2 次失败 → 查 CF / Vercel / build-info  
- 5xx >5% → 回滚上一 Production deployment  

## 5. Embed 常开（本机路径）

```powershell
powershell -NoProfile -File D:\nav-site\scripts\bootstrap-embed-always-on.ps1
# 或分步：
# scripts\ensure-embed-stack.ps1
# scripts\install-embed-autostart.ps1
```

登录自启任务名：`nav-site-embed-stack`  
公网：`https://embed.aijiaqi.ccwu.cc` → Worker `nav-site-embed-proxy` → 生产 `EMBED_SERVER_URL`

**本机休眠/关机仍会断 embedding**；彻底 24×7 需 VPS（见 `docs/embed-fly-deploy.md` T5）。

## 6. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-18 | 首版：主值守=owner；Sentry 邮件 + Vercel 失败通知；embed 本机+自启 |
| 2026-07-18 | 关闭 Vercel `ssoProtection`（API）；Preview 探针 PASS |
