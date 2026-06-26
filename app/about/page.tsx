import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "关于",
  description: "综合导航站 — 精选收录 AI、开发工具、云服务等优质站点",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-foreground/90">关于本站</h1>

      <section className="mt-8 space-y-4 text-sm text-foreground/70 leading-relaxed">
        <p>
          综合导航站是一个精选收录开发者常用站点的导航平台。我们收集和整理了
          AI 大模型、云服务、开发工具、设计资源、在线工具、开源项目、软件应用、
          学习社区、企业工具等九大分类的优质站点，帮助开发者快速找到所需资源。
        </p>

        <h2 className="text-lg font-semibold text-foreground/80">为什么做这个站</h2>
        <p>
          开发者每天要用的工具和资源分散在互联网各处，从 AI API 到云服务、从
          设计工具到开源项目，信息碎片化严重。这个导航站希望把这些信息聚合起来，
          让查找和使用变得更加高效。
        </p>

        <h2 className="text-lg font-semibold text-foreground/80">内容来源</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>社区提交 — 用户通过提交表单推荐站点</li>
          <li>人工筛选 — 对每个收录站点进行可用性验证</li>
          <li>定期更新 — 持续扩充和维护各分类内容</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground/80">使用说明</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>浏览分类或使用搜索快速定位</li>
          <li>点击链接直接跳转到目标站点</li>
          <li>通过提交表单推荐新的站点</li>
          <li>每日更新，确保信息新鲜度</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground/80">免责声明</h2>
        <p>
          本站仅作为信息导航，不存储、不提供任何 API 密钥或代理服务。
          所有链接指向第三方站点，使用前请自行评估其安全性和稳定性。
          如发现违规内容，请联系我们处理。
        </p>
      </section>

      <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground/40">
        综合导航站 · 始于 2026
      </footer>
    </div>
  );
}
