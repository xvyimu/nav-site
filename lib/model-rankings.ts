import { createClient } from "./supabase/server";
import type { ModelRanking } from "@/components/ModelRanking";

export async function getModelRankings(): Promise<ModelRanking[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("model_rankings")
    .select("*")
    .order("source")
    .order("rank");

  if (error) {
    console.error("Failed to fetch model rankings:", error.message);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    rank: r.rank,
    model_name: r.model_name,
    source: r.source,
    score: r.score,
    description: r.description,
    icon: r.icon || "🤖",
    url: r.url,
    category: r.category || "closed",
  }));
}