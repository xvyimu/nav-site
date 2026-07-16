/**
 * 数据访问 facade。
 *
 * 页面组件和 API 路由继续从 `@/lib/repositories` 导入；具体实现按业务域
 * 放在 `lib/repositories/*` deep modules 中，避免权限语义和测试 surface 混在一起。
 */

export { MissingDatabaseMigrationError } from "@/lib/repositories/shared";

export {
  getCategories,
  getAllCategoriesForAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/repositories/categories";

export {
  getApprovedLinks,
  getApprovedLinkBySlug,
  getAllApprovedLinkSlugs,
  getRelatedLinks,
  getApprovedLinksForApi,
  queryApprovedLinksForApi,
} from "@/lib/repositories/links";

export {
  getAllTagsForAdmin,
  createTag,
  updateTag,
  deleteTag,
} from "@/lib/repositories/tags";

export {
  getAllLinksForAdmin,
  createLink,
  updateLink,
  deleteLink,
} from "@/lib/repositories/admin-links";

export {
  findExistingLinkByUrl,
  submitLink,
  findApprovedLinkByUrl,
} from "@/lib/repositories/submissions";

export {
  checkReviewRateLimit,
  createReview,
  getReviewStats,
  getToolReviews,
  hasUserReviewed,
  recordReviewAttempt,
} from "@/lib/repositories/reviews";

export {
  addUserFavorites,
  clearUserFavorites,
  getUserFavorites,
  removeUserFavorite,
} from "@/lib/repositories/favorites";
