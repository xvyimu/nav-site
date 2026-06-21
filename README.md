# 公益API导航站

精选 AI 大模型 API 与开发者资源导航平台。收录官方原厂与公益中转服务，帮助开发者快速找到可用的 AI API 入口。

**生产站点**：[https://yuanjia1314.ccwu.cc](https://yuanjia1314.ccwu.cc)

---

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | [Next.js 16](https://nextjs.org/) (App Router, ISR) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) |
| 动画 | [Motion](https://motion.dev/) (Framer Motion) |
| 数据库 | [Supabase](https://supabase.com/) (PostgreSQL) |
| 部署 | [Vercel](https://vercel.com/) |
| CDN | Cloudflare (代理 + 缓存 + SSL) |
| 包管理 | pnpm |

## 项目结构

```
nav-site/
├── app/                    # Next.js App Router 路由
│   ├── api/                # API 路由（提交/付费/统计）
│   ├── admin/              # 后台管理面板
│   ├── submit/             # 站点提交页面
│   ├── layout.tsx          # 根布局（SEO meta、JSON-LD、主题）
│   ├── page.tsx            # 首页（导航列表 + 排行榜）
│   ├── sitemap.ts          # 站点地图
│   └── robots.ts           # 爬虫规则
├── components/             # UI 组件
│   ├── ui/                 # shadcn/ui 基础组件
│   ├── LinkCard.tsx        # 链接卡片（含点击追踪）
│   ├── Navigation.tsx      # 分类筛选 + 搜索
│   ├── ModelRanking.tsx    # 模型排行榜
│   ├── SubmitForm.tsx      # 站点提交表单
│   └── Header.tsx / Footer.tsx
├── lib/                    # 工具库
│   ├── supabase/           # Supabase 客户端（server/client/admin）
│   ├── types.ts            # 类型定义
│   ├── utils.ts            # 工具函数
│   ├── model-rankings.ts   # 排行榜数据获取
│   └── animations.ts       # 动画配置
├── scripts/                # 自动化脚本
│   ├── check-links.mjs     # 链接健康度检测
│   ├── sync-db.mjs         # 开发→生产双库同步
│   └── add.mjs             # 批量添加链接
└── .github/workflows/      # CI/CD
    ├── link-check.yml      # 每周链接健康检查
    └── sync-db.yml         # 每6小时数据库同步
```

## 数据流

```
用户提交 ──→ /api/submit ──→ Supabase (开发库)
                                   │
                    sync-db.yml (每6小时)
                                   │
                            ┌──────┴──────┐
                            │  生产库 (只读) │
                            └─────────────┘
                                  │
    next.config.ts 安全头 ← ── Vercel ──→ Cloudflare CDN ──→ 用户
```

- **开发库** (`nzaocqwumlmbewoddysd`): 唯一的写入源，全部管理操作在此进行
- **生产库** (`vyqqbypwrbdcafanzwmj`): 只读副本，由 GitHub Actions 定时同步

## 本地开发

```bash
# 前置要求：Node.js 22+, pnpm

# 1. 克隆项目
git clone https://github.com/yuanjia1314/nav-site.git
cd nav-site

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 Supabase 凭据

# 4. 启动开发服务器
pnpm dev

# 访问 http://localhost:3000
```

### 环境变量

| 变量 | 说明 | 必须 |
|------|------|:----:|
| `NEXT_PUBLIC_SUPABASE_URL` | 生产 Supabase URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 生产 Supabase anon key | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL_DEV` | 开发 Supabase URL | 本地开发 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV` | 开发 Supabase anon key | 本地开发 |
| `NEXT_PUBLIC_SITE_URL` | 站点 URL（sitemap/meta） | 部署时 |

### 常用命令

```bash
pnpm dev       # 启动开发服务器
pnpm build     # 生产构建
pnpm lint      # ESLint 检查
pnpm sync      # 手动触发数据库同步
pnpm add       # 批量添加链接（交互式）
```

## 安全

- **安全响应头**: CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy、Permissions-Policy（via `next.config.ts`）
- **外链**: 全部使用 `rel="noopener noreferrer"`（via `LinkCard.tsx`）
- **CDN**: Cloudflare 代理 + SSL + HSTS Preload
- **表单**: 提交走服务端 API，CSP `form-action 'self'` 限制

## 功能

- ✅ 分类展示导航链接（官方 API / 中转服务站 / 排行榜）
- ✅ 分类筛选 + 实时搜索
- ✅ 模型排行榜（含评分与来源）
- ✅ 点击统计
- ✅ 站点提交（需审核）
- ✅ SEO 优化（OG / Twitter Card / JSON-LD / sitemap / robots）
- ✅ 安全响应头（CSP / HSTS / XSS 防护）
- ✅ 暗色模式
- ✅ 响应式设计（移动端适配）
- ✅ 链接健康度自动检测（每周）
- 🔜 Stripe 付费优选提交
- 🔜 后台管理面板

## CI/CD

| 工作流 | 触发 | 说明 |
|--------|------|------|
| `sync-db.yml` | 每6小时 / 手动 | 开发库 → 生产库数据同步 |
| `link-check.yml` | 每周一 / 手动 | 检测所有外链可用性，异常自动创建 Issue |

## 贡献指南

1. 提交 Issue 报告问题或建议
2. Fork 项目后创建特性分支
3. 确保通过 `pnpm lint` 和 `pnpm build`
4. 提交 PR 并描述变更内容

## 许可证

MIT