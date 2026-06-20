import { createClient } from "@/lib/supabase/server";
import { type NavLink } from "@/lib/types";
import { Navigation } from "@/components/Navigation";
import { HeroSection } from "@/components/HeroSection";

// ISR: 每 60 秒重新生成页面，确保数据及时更新
export const revalidate = 60;

export default async function Home() {
  const supabase = await createClient();

  // Parallel fetch for faster initial load
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
      <HeroSection />
      <Navigation categories={categories} links={links} />
    </div>
  );
}
