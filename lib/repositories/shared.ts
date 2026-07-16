import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { NavLink } from "@/lib/types";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export type SupabaseAdminClient = ReturnType<typeof createServiceRoleClient>;
export type SupabaseDataClient = SupabaseServerClient | SupabaseAdminClient;

export interface RepositoryQueryOptions {
  client?: SupabaseServerClient;
  signal?: AbortSignal;
}

export class MissingDatabaseMigrationError extends Error {
  constructor(feature: string, options?: { cause?: unknown }) {
    super(`${feature} database objects are missing`, options);
    this.name = "MissingDatabaseMigrationError";
  }
}

export function isMissingRelationError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(error.message ?? "")
  );
}

export function createAdminClient(): SupabaseAdminClient {
  return createServiceRoleClient();
}

function isClientOption(input: unknown): input is SupabaseServerClient {
  return typeof input === "object" && input !== null && "from" in input;
}

export function resolveQueryOptions(
  input?: SupabaseServerClient | RepositoryQueryOptions
): RepositoryQueryOptions {
  if (isClientOption(input)) return { client: input };
  return input ?? {};
}

export interface RawLinkRow {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category_id: string | null;
  approved: boolean;
  paid: boolean;
  featured: boolean;
  click_count: number;
  slug?: string | null;
  nav_categories?: { name: string; slug: string } | null;
  updated_at?: string | null;
  created_at: string;
  review_count?: number;
  avg_rating?: number;
  tags?: NavLink["tags"];
  [key: string]: unknown;
}

const PUBLIC_LINK_FIELDS = [
  "id",
  "title",
  "slug",
  "url",
  "description",
  "icon",
  "category_id",
  "approved",
  "paid",
  "featured",
  "click_count",
  "created_at",
  "updated_at",
].join(", ");

/** Public link projection. Embedding columns must stay RPC-only. */
export const PUBLIC_LINK_SELECT = `${PUBLIC_LINK_FIELDS}, nav_categories(name, slug)`;
export const PUBLIC_LINK_SELECT_INNER_CATEGORY =
  `${PUBLIC_LINK_FIELDS}, nav_categories!inner(name, slug)`;

/** 将 Supabase 返回的链接行映射为 NavLink（含分类名） */
export function mapLinkRow(value: unknown): NavLink {
  const l = value as RawLinkRow;
  const link: NavLink = {
    id: l.id,
    title: l.title,
    url: l.url,
    description: l.description,
    icon: l.icon,
    category_id: l.category_id,
    approved: l.approved,
    paid: l.paid,
    featured: l.featured,
    click_count: l.click_count,
    created_at: l.created_at,
    updated_at: l.updated_at ?? l.created_at,
    slug: l.slug ?? null,
    category_name: l.nav_categories?.name,
    category_slug: l.nav_categories?.slug,
    tags: l.tags ?? [],
  };

  if (typeof l.review_count === "number") link.review_count = l.review_count;
  if (typeof l.avg_rating === "number") link.avg_rating = l.avg_rating;
  return link;
}
