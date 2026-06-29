/**
 * URL slug 生成工具
 *
 * 将工具标题转换为 SEO 友好的 URL slug。
 * 例如："ChatGPT - AI 对话助手" → "chatgpt-ai-dui-hua-zhu-shou"
 */

/**
 * 将标题转换为 URL slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, "") // 保留字母、数字、中文、空格、连字符
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
