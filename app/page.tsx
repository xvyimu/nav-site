import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { type NavLink } from "@/lib/types";
import { Navigation } from "@/components/Navigation";
import { NavSkeleton } from "@/components/NavSkeleton";
import { getModelRankings } from "@/lib/model-rankings";

// ISR: 每 60 秒重新生成页面
export const revalidate = 60;

async function NavContent() {
  const supabase = await createClient();

  const [categoriesResult, linksResult, rankings] = await Promise.all([
    supabase.from("nav_categories").select("*").order("sort_order"),
    supabase
      .from("nav_links")
      .select("*, nav_categories(name, slug)")
      .eq("approved", true)
      .order("featured", { ascending: false })
      .order("paid", { ascending: false })
      .order("created_at", { ascending: false }),
    getModelRankings(),
  ]);

  if (categoriesResult.error || linksResult.error) {
    throw new Error(`DB query failed: ${categoriesResult.error?.message ?? linksResult.error?.message}`);
  }

  const categories = categoriesResult.data ?? [];
  const links: NavLink[] = (linksResult.data ?? []).map((l) => ({
    ...l,
    category_name: l.nav_categories?.name ?? null,
    category_slug: l.nav_categories?.slug ?? null,
    updated_at: l.updated_at ?? l.created_at,
  }));

  return (
    <Navigation
      categories={categories}
      links={links}
      modelRankings={rankings}
    />
  );
}

export default function Home() {
  return (
    <div className="w-full">
      <Suspense fallback={<NavSkeleton />}>
        <NavContent />
      </Suspense>
    </div>
  );
}
