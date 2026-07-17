/**
 * Resource Library ingest helpers (pure + small IO).
 * Target table: public.pages on Supabase project ihnmfsfbfnctgkhxmghk
 */
import { createHash } from "node:crypto";

export const RESOURCE_LIBRARY_URL =
  process.env.RESOURCE_LIBRARY_URL ||
  "https://ihnmfsfbfnctgkhxmghk.supabase.co";

/** domain → category defaults (keep in sync with ops backfill) */
export const DOMAIN_CATEGORY = Object.freeze({
  "dev.to": "Other",
  "www.reddit.com": "Other",
  "news.ycombinator.com": "Other",
  "blog.csdn.net": "Other",
  "www.cnblogs.com": "Other",
  "juejin.cn": "Other",
  "www.a9vg.com": "Media",
  "www.ali213.net": "Media",
  "www.indiehackers.com": "Startup",
  "docs.python.org": "Backend",
  "fastapi.tiangolo.com": "Backend",
  "docs.docker.com": "DevOps",
  "docs.github.com": "DevOps",
  "huggingface.co": "AI",
  "docs.anthropic.com": "AI",
  "docs.langchain.com": "AI",
  "nextjs.org": "Frontend",
  "developer.mozilla.org": "Frontend",
});


export function stripHtml(input = "") {
  return String(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(raw) {
  const u = new URL(String(raw).trim());
  u.hash = "";
  // drop common tracking params
  for (const key of [...u.searchParams.keys()]) {
    if (/^utm_/i.test(key) || key === "ref" || key === "source") {
      u.searchParams.delete(key);
    }
  }
  let href = u.toString();
  if (href.endsWith("/") && u.pathname !== "/") {
    href = href.slice(0, -1);
  }
  return href;
}

export function domainOf(url) {
  return new URL(url).hostname.toLowerCase();
}

export function guessCategory(domain, tags = []) {
  if (DOMAIN_CATEGORY[domain]) return DOMAIN_CATEGORY[domain];
  const t = tags.map((x) => String(x).toLowerCase());
  if (t.some((x) => ["ai", "llm", "machinelearning", "gpt"].includes(x))) return "AI";
  if (t.some((x) => ["javascript", "typescript", "react", "vue", "css"].includes(x))) {
    return "Frontend";
  }
  if (t.some((x) => ["python", "go", "rust", "java", "backend", "api"].includes(x))) {
    return "Backend";
  }
  if (t.some((x) => ["devops", "docker", "kubernetes", "k8s"].includes(x))) return "DevOps";
  return "Other";
}

/**
 * Content fingerprint for pages.sha256 (unique).
 * Prefer stable identity on canonical URL so re-fetch doesn't duplicate.
 */
export function pageSha256(canonicalUrl) {
  return createHash("sha256").update(`url:${canonicalUrl}`, "utf8").digest("hex");
}

/**
 * Normalize a loose article-like object into a pages insert candidate.
 * @returns {null | object}
 */
export function normalizePageCandidate(raw, { source = "unknown" } = {}) {
  if (!raw || typeof raw !== "object") return null;

  const title = stripHtml(raw.title || raw.name || "").slice(0, 300);
  const urlRaw = raw.url || raw.canonical_url || raw.source_url;
  if (!title || !urlRaw) return null;

  let url;
  try {
    url = canonicalizeUrl(urlRaw);
  } catch {
    return null;
  }
  if (!/^https?:\/\//i.test(url)) return null;

  const domain = domainOf(url);
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => (typeof t === "string" ? t : t?.name)).filter(Boolean)
    : Array.isArray(raw.tag_list)
      ? raw.tag_list.filter((t) => typeof t === "string")
      : [];

  const summary = stripHtml(
    raw.summary || raw.description || raw.description_html || ""
  ).slice(0, 500);

  const content_md = String(raw.content_md || raw.body_markdown || raw.body || "").slice(
    0,
    50_000
  );

  const category =
    (typeof raw.category === "string" && raw.category.trim()) ||
    guessCategory(domain, tags);

  const sha256 = pageSha256(url);

  return {
    title,
    url,
    domain,
    summary,
    category,
    tags,
    keywords: tags.slice(0, 12),
    language: raw.language || ( /[一-鿿]/.test(title + summary) ? "zh" : "en"),
    content_md: content_md || summary,
    sha256,
    robots_ok: true,
    _meta: { source },
  };
}

/**
 * Dedupe within batch + against existing sets.
 * @param {object[]} candidates normalizePageCandidate outputs
 * @param {{ urls?: Set<string>, shas?: Set<string> }} existing
 */
export function planIngest(candidates, existing = {}) {
  const existingUrls = existing.urls || new Set();
  const existingShas = existing.shas || new Set();
  const seenUrl = new Set();
  const seenSha = new Set();

  const toInsert = [];
  const skipped = [];

  for (const c of candidates) {
    if (!c) {
      skipped.push({ reason: "invalid", title: "", url: "" });
      continue;
    }
    if (existingUrls.has(c.url) || seenUrl.has(c.url)) {
      skipped.push({ reason: "url_exists", title: c.title, url: c.url });
      continue;
    }
    if (existingShas.has(c.sha256) || seenSha.has(c.sha256)) {
      skipped.push({ reason: "sha256_exists", title: c.title, url: c.url });
      continue;
    }
    seenUrl.add(c.url);
    seenSha.add(c.sha256);
    toInsert.push(c);
  }

  return { toInsert, skipped };
}

/** Map DEV.to article JSON → normalize input */
export function fromDevtoArticle(article) {
  return normalizePageCandidate(
    {
      title: article.title,
      url: article.url || article.canonical_url,
      description: article.description,
      body_markdown: article.body_markdown,
      tag_list: article.tag_list || article.tags,
      category: undefined,
    },
    { source: "dev.to" }
  );
}

/**
 * Map HN Algolia hit → pages candidate.
 * Prefer external url; fall back to HN item page.
 */
export function fromHnHit(hit) {
  if (!hit || typeof hit !== "object") return null;
  const objectId = hit.objectID != null ? String(hit.objectID) : "";
  const external = hit.url || hit.story_url;
  const url =
    (typeof external === "string" && external.trim()) ||
    (objectId ? `https://news.ycombinator.com/item?id=${objectId}` : "");
  const title = hit.title || hit.story_title || "";
  if (!title || !url) return null;

  const tags = ["hackernews"];
  if (Array.isArray(hit._tags)) {
    for (const t of hit._tags) {
      if (typeof t === "string" && t && t !== "story" && !t.startsWith("author_")) {
        tags.push(t);
      }
    }
  }

  const summary =
    hit.story_text ||
    hit.comment_text ||
    (hit.author ? `HN by ${hit.author}` : "Hacker News story");

  return normalizePageCandidate(
    {
      title,
      url,
      description: String(summary).slice(0, 500),
      tag_list: tags.slice(0, 12),
    },
    { source: "hn" }
  );
}

export function stripMeta(row) {
  const rest = { ...row };
  delete rest._meta;
  return rest;
}
