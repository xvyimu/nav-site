import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://yuanjia1314.ccwu.cc";

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
  ];

  const { data: categories } = await supabase
    .from("nav_categories")
    .select("slug, created_at");

  const categoryPages: MetadataRoute.Sitemap = (categories ?? []).map(
    (cat) => ({
      url: `${baseUrl}/category/${cat.slug}`,
      lastModified: new Date(cat.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })
  );

  return [...staticPages, ...categoryPages];
}

export const dynamic = "force-dynamic";
