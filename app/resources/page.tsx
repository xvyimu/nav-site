import { ResourcesClient } from "./_components/ResourcesClient";
import { browseResources } from "@/lib/resource-library/browse";

export const revalidate = 300;

export default async function ResourcesPage() {
  const result = await browseResources({ limit: 80 });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">资源库</h1>
      <ResourcesClient
        initialResults={result.ok ? result.results : []}
        initialError={result.ok ? null : "资源库暂时不可用，请稍后重试"}
      />
    </div>
  );
}
