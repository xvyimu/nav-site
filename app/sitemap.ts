import type { MetadataRoute } from "next";
import { getAllApprovedLinkSlugs, getCategories } from "@/lib/repositories";
import { createStaticClient } from "@/lib/supabase/server";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yuanjia1314.ccwu.cc";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 使用无 cookie 的静态客户端，避免 cookies() 触发动态渲染，使 ISR 生效
  const client = createStaticClient();

  // 静态页面
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/submit`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // 程序化 SEO 页面：/tool/[slug]
  const toolSlugs = await getAllApprovedLinkSlugs(client).catch(() => []);
  const toolPages: MetadataRoute.Sitemap = toolSlugs.map((slug) => ({
    url: `${baseUrl}/tool/${slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // 分类页面
  const categories = await getCategories(client).catch(() => []);
  const categoryPages: MetadataRoute.Sitemap = categories.map((cat) => ({
    url: `${baseUrl}/?cat=${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticPages, ...toolPages, ...categoryPages];
}

export const revalidate = 3600; // ISR：每小时重新生成，降低 Supabase 负载
