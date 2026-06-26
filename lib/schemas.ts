import { z } from "zod";

/**
 * 共享 Zod Schema
 *
 * 供 API 路由统一复用，避免在多个文件中重复定义验证规则。
 */

/** URL 字段：必须是合法的 http/https URL */
export const urlSchema = z
  .string()
  .url("URL 格式不正确")
  .refine(
    (u) => {
      try {
        const protocol = new URL(u).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    "仅允许 http/https 协议",
  )
  .max(2000, "URL 不能超过 2000 字符");

/** 标题字段 */
export const titleSchema = z
  .string()
  .min(1, "名称不能为空")
  .max(100, "名称不能超过 100 字符");

/** 描述字段 */
export const descriptionSchema = z
  .string()
  .max(500, "描述不能超过 500 字符")
  .nullish();

/** 图标字段 */
export const iconSchema = z
  .string()
  .max(20, "图标不能超过 20 字符")
  .nullish();

/** 分类 ID 字段 */
export const categoryIdSchema = z
  .string()
  .uuid("分类 ID 格式不正确")
  .nullable()
  .nullish();

/** Slug 字段 */
export const slugSchema = z
  .string()
  .min(1, "Slug 不能为空")
  .max(50, "Slug 不能超过 50 字符")
  .regex(/^[a-z0-9-]+$/, "Slug 只能包含小写字母、数字和连字符");

/** 排序字段 */
export const sortOrderSchema = z
  .number()
  .int("排序必须是整数")
  .optional()
  .default(0);

// ── 标签 ──

/** 标签名称字段 */
export const tagNameSchema = z
  .string()
  .min(1, "标签名称不能为空")
  .max(30, "标签名称不能超过 30 字符");

/** 标签 slug 字段（复用 slugSchema 规则但允许更短） */
export const tagSlugSchema = z
  .string()
  .min(1, "Slug 不能为空")
  .max(50, "Slug 不能超过 50 字符")
  .regex(/^[a-z0-9-]+$/, "Slug 只能包含小写字母、数字和连字符");

/** 标签 ID 列表（用于链接创建/更新时关联标签） */
export const tagIdsSchema = z.array(z.string().uuid()).max(20).optional();

/** 标签创建 schema */
export const createTagSchema = z.object({
  name: tagNameSchema,
  slug: tagSlugSchema,
});

/** 标签更新 schema */
export const updateTagSchema = z.object({
  name: tagNameSchema.optional(),
  slug: tagSlugSchema.optional(),
});

/** 链接创建 schema */
export const createLinkSchema = z.object({
  title: titleSchema,
  url: urlSchema,
  description: descriptionSchema,
  icon: iconSchema,
  category_id: categoryIdSchema,
  approved: z.boolean().optional().default(true),
  featured: z.boolean().optional().default(false),
  tag_ids: tagIdsSchema,
});

/** 链接更新 schema（所有字段可选） */
export const updateLinkSchema = z.object({
  title: titleSchema.optional(),
  url: urlSchema.optional(),
  description: descriptionSchema,
  icon: iconSchema,
  category_id: categoryIdSchema,
  approved: z.boolean().optional(),
  featured: z.boolean().optional(),
  tag_ids: tagIdsSchema,
});

/** 分类创建 schema */
export const createCategorySchema = z.object({
  name: z.string().min(1, "名称不能为空").max(50, "名称不能超过 50 字符"),
  slug: slugSchema,
  description: z.string().max(200, "描述不能超过 200 字符").nullish(),
  icon: iconSchema,
  sort_order: sortOrderSchema,
  parent_id: z.string().uuid("父分类 ID 格式不正确").nullable().nullish(),
});

/** 分类更新 schema */
export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(200).nullish(),
  icon: iconSchema,
  sort_order: z.number().int().optional(),
  parent_id: z.string().uuid("父分类 ID 格式不正确").nullable().nullish(),
});

/** 提交新链接 schema */
export const submitLinkSchema = z.object({
  title: titleSchema,
  url: urlSchema,
  description: descriptionSchema.default(null),
  category_id: categoryIdSchema.default(null),
});

/** 收藏 linkIds schema */
export const linkIdsSchema = z.array(z.string().uuid()).min(1).max(100);
