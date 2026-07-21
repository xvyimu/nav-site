import { revalidatePath } from "next/cache";

/**
 * 管理端内容写成功后，主动失效公开 ISR 页面，避免干等 revalidate=60。
 * 仅路径级 revalidatePath，不碰 tag 体系（项目尚未使用 revalidateTag）。
 */
export function revalidatePublicNavContent(options?: {
  /** 工具详情 slug；有则同步刷详情页 */
  slug?: string | null;
  /** 是否刷分类相关（默认 true，分类 CRUD 时也调用） */
  includeHome?: boolean;
}): void {
  const includeHome = options?.includeHome !== false;

  if (includeHome) {
    revalidatePath("/");
  }

  // 详情页 ISR 60s；编辑/上下架后立刻失效
  const slug = options?.slug?.trim();
  if (slug) {
    revalidatePath(`/tool/${slug}`);
  }

  // sitemap 含链接列表，低频但写入后值得刷新
  revalidatePath("/sitemap.xml");
}
