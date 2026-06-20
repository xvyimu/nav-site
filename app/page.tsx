import { createClient } from "@/lib/supabase/server";
import { type NavLink } from "@/lib/types";
import { Navigation } from "@/components/Navigation";

// ISR: 每 60 秒重新生成页面
export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();

  const [categoriesResult, linksResult] = await Promise.all([
    supabase.from("nav_categories").select("*").order("sort_order"),
    supabase
      .from("nav_links")
      .select("*, nav_categories(name, slug)")
      .eq("approved", true)
      .order("featured", { ascending: false })
      .order("paid", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const categories = categoriesResult.data ?? [];
  const links: NavLink[] = (linksResult.data ?? []).map((l) => ({
    ...l,
    category_name: l.nav_categories?.name ?? null,
    category_slug: l.nav_categories?.slug ?? null,
    updated_at: l.updated_at ?? l.created_at,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-center text-foreground/90 sm:text-3xl mb-2">
        公益API导航站
      </h1>
      <p className="text-center text-sm text-muted-foreground/70 mb-8 max-w-md mx-auto">
        精心收录 AI 大模型 API，涵盖官方原厂与公益中转服务
      </p>
      <Navigation categories={categories} links={links} />
    </div>
  );
}
