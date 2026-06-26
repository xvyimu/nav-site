import { getCategories } from "@/lib/repositories";
import { SubmitForm } from "@/components/SubmitForm";
import { type Category } from "@/lib/types";

export const metadata = {
  title: "提交站点",
  description: "提交你的网站到 AI 导航站，让更多人发现。",
};

export default async function SubmitPage() {
  const categories: Category[] = await getCategories().catch(() => []);

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">提交站点</h1>
        <p className="mt-1 text-muted-foreground">
          提交你的网站到 AI 导航站，让更多人发现。
        </p>
      </div>
      <SubmitForm categories={categories} />
    </div>
  );
}
