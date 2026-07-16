#!/usr/bin/env python3
"""
Backfill pgvector embeddings for approved nav_links.

Default mode is dry-run. Providers:
  - local / embed-server: BAAI/bge-small-zh-v1.5 via sentence-transformers,
    512-d, writes through batch_update_embeddings.
  - cloudflare: Workers AI @cf/baai/bge-m3 REST, 1024-d by default, writes
    through batch_update_embeddings_v2.
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable, TypeVar

LOCAL_EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"
CLOUDFLARE_EMBEDDING_MODEL = "@cf/baai/bge-m3"
DEFAULT_LOCAL_BATCH_SIZE = 50
DEFAULT_CLOUDFLARE_BATCH_SIZE = 25
REQUEST_TIMEOUT_SECONDS = 60
DEFAULT_PAGE_SIZE = 200
DEFAULT_MAX_RETRIES = 3
DEFAULT_CHECKPOINT_PATH = ".backfill-embeddings.checkpoint.json"

T = TypeVar("T")


def _ssl_context() -> ssl.SSLContext:
    # Opt-in escape hatch for local Windows CRL failures only.
    if os.environ.get("BACKFILL_ALLOW_INSECURE_TLS") == "1":
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def _request(method: str, url: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req, context=_ssl_context(), timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        return resp.read()


def _supabase_config() -> tuple[str, str]:
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required")
    supabase_url = supabase_url.rstrip("/")
    if not supabase_url.startswith("https://"):
        raise RuntimeError("SUPABASE_URL must use https://")

    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY_PROD") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY"
    )
    if not supabase_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY_PROD or SUPABASE_SERVICE_ROLE_KEY is required")

    return supabase_url, supabase_key


def _supabase_headers() -> dict[str, str]:
    _, supabase_key = _supabase_config()
    return {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _rest(path: str) -> list[Any] | dict[str, Any]:
    supabase_url, _ = _supabase_config()
    return json.loads(_request("GET", f"{supabase_url}{path}", headers=_supabase_headers()))


def _rpc(name: str, params: dict[str, Any]) -> Any:
    supabase_url, _ = _supabase_config()
    url = f"{supabase_url}/rest/v1/rpc/{name}"
    response = _request("POST", url, data=json.dumps(params).encode(), headers=_supabase_headers())
    return json.loads(response) if response else None


def resolve_provider(raw: str | None = None) -> str:
    value = raw
    if value is None:
        value = os.environ.get("BACKFILL_EMBED_PROVIDER") or os.environ.get("EMBED_PROVIDER") or "local"

    normalized = value.strip().lower()
    if normalized in {"local", "embed-server", "embed_server", "sentence-transformers", "sentence_transformers"}:
        return "local"
    if normalized == "cloudflare":
        return "cloudflare"
    raise ValueError(f"unsupported embedding provider: {value}")


def resolve_expected_dim(provider: str, raw_dim: int | str | None = None) -> int:
    value = raw_dim if raw_dim is not None else os.environ.get("EMBED_DIM")
    if value is not None and str(value).strip():
        dim = int(value)
        if dim < 1:
            raise ValueError("embedding dimension must be greater than 0")
        return dim
    return 1024 if provider == "cloudflare" else 512


def resolve_backfill_rpc(provider: str, raw_rpc: str | None = None) -> str:
    value = raw_rpc or os.environ.get("BACKFILL_EMBEDDINGS_RPC")
    if value and value.strip():
        return value.strip()
    return "batch_update_embeddings_v2" if provider == "cloudflare" else "batch_update_embeddings"


def fetch_link_page(after_id: str | None = None, page_size: int = DEFAULT_PAGE_SIZE) -> list[dict[str, Any]]:
    if page_size < 1:
        raise ValueError("page_size must be greater than 0")

    # UUID ordering gives checkpoint/resume a deterministic keyset cursor.
    params = (
        "select=id,title,description,category_id,nav_categories(name)"
        "&approved=eq.true&order=id.asc"
    )
    if after_id:
        params += f"&id=gt.{after_id}"
    params += f"&limit={page_size}"
    data = _rest(f"/rest/v1/nav_links?{params}")
    if not isinstance(data, list):
        raise RuntimeError("nav_links REST response must be a list")
    return data


def fetch_links(limit: int | None = None) -> list[dict[str, Any]]:
    """Compatibility helper that collects keyset-paginated rows."""
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    while limit is None or len(rows) < limit:
        page_size = min(DEFAULT_PAGE_SIZE, limit - len(rows)) if limit else DEFAULT_PAGE_SIZE
        page = fetch_link_page(cursor, page_size)
        if not page:
            break
        rows.extend(page)
        cursor = str(page[-1]["id"])
        if len(page) < page_size:
            break
    print(f"  -> {len(rows)} links")
    return rows


def run_with_retries(
    operation: Callable[[], T],
    max_retries: int = DEFAULT_MAX_RETRIES,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    if max_retries < 0:
        raise ValueError("max_retries must be 0 or greater")

    for attempt in range(max_retries + 1):
        try:
            return operation()
        except Exception:
            if attempt >= max_retries:
                raise
            delay = float(2**attempt)
            print(f"  [retry {attempt + 1}/{max_retries}] after {delay:.0f}s", flush=True)
            sleep(delay)
    raise RuntimeError("retry loop exhausted")


def save_checkpoint(path: str, state: dict[str, Any]) -> None:
    target = os.path.abspath(path)
    parent = os.path.dirname(target)
    if parent:
        os.makedirs(parent, exist_ok=True)
    payload = {
        **state,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    temporary = f"{target}.tmp"
    with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, target)


def load_checkpoint(
    path: str,
    provider: str,
    rpc_name: str,
    expected_dim: int,
) -> dict[str, Any] | None:
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        state = json.load(handle)
    expected = {"provider": provider, "rpc": rpc_name, "dim": expected_dim}
    actual = {key: state.get(key) for key in expected}
    if actual != expected:
        raise RuntimeError(
            f"checkpoint contract does not match current run: expected={expected}, actual={actual}"
        )
    return state


def generate_embedding_text(link: dict[str, Any]) -> str:
    parts = [link["title"] or ""]
    desc = (link.get("description") or "").strip()
    if desc:
        parts.append(desc)
    category = link.get("nav_categories")
    if category and isinstance(category, dict) and category.get("name"):
        parts.append(f"[{category['name']}]")
    return " ".join(parts)


def _as_float_list(vector: Any) -> list[float]:
    if hasattr(vector, "tolist"):
        vector = vector.tolist()
    if not isinstance(vector, list):
        raise RuntimeError("embedding vector must be a list")
    return [float(value) for value in vector]


def _is_number_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, (int, float)) for item in value)


def extract_cloudflare_embeddings(json_body: Any, expected_count: int | None = None) -> list[list[float]]:
    data = None
    if isinstance(json_body, dict):
        result = json_body.get("result")
        if isinstance(result, dict):
            data = result.get("data")
        if data is None:
            data = json_body.get("data")

    if _is_number_list(data):
        embeddings = [_as_float_list(data)]
    elif isinstance(data, list) and all(_is_number_list(item) for item in data):
        embeddings = [_as_float_list(item) for item in data]
    else:
        raise RuntimeError("Cloudflare Workers AI embed response has unsupported shape")

    if expected_count is not None and len(embeddings) != expected_count:
        raise RuntimeError(
            f"Cloudflare Workers AI returned {len(embeddings)} embeddings for {expected_count} texts"
        )
    return embeddings


class LocalEmbedder:
    def __init__(self, model_name: str):
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name)
        self.dimension = self.model.get_embedding_dimension()

    def encode(self, texts: list[str]) -> list[list[float]]:
        embeddings = self.model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [_as_float_list(embedding) for embedding in embeddings]


class CloudflareEmbedder:
    def __init__(self, account_id: str, token: str, model_name: str = CLOUDFLARE_EMBEDDING_MODEL):
        self.endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model_name}"
        self.token = token

    def encode(self, texts: list[str]) -> list[list[float]]:
        body = json.dumps({"text": texts}).encode()
        response = _request(
            "POST",
            self.endpoint,
            data=body,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        return extract_cloudflare_embeddings(json.loads(response), expected_count=len(texts))


def build_embedder(provider: str, model_name: str | None = None):
    if provider == "cloudflare":
        account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        token = (
            os.environ.get("CF_AI_API_TOKEN")
            or os.environ.get("CLOUDFLARE_API_TOKEN")
            or os.environ.get("CLOUDFLARE_AUTH_TOKEN")
        )
        if not account_id or not token:
            raise RuntimeError("CF_ACCOUNT_ID and CF_AI_API_TOKEN are required for --provider cloudflare")
        return CloudflareEmbedder(account_id.strip(), token.strip(), model_name or CLOUDFLARE_EMBEDDING_MODEL)
    return LocalEmbedder(model_name or LOCAL_EMBEDDING_MODEL)


def validate_embedding_dimensions(embeddings: list[list[float]], expected_dim: int) -> None:
    for index, embedding in enumerate(embeddings):
        if len(embedding) != expected_dim:
            raise RuntimeError(
                f"embedding #{index + 1} has dim={len(embedding)}, expected dim={expected_dim}"
            )


def batch_write_embeddings(
    items: list[dict[str, Any]],
    embedder,
    dry_run: bool = False,
    rpc_name: str = "batch_update_embeddings",
    expected_dim: int = 512,
) -> int:
    texts: list[str] = []
    id_map: list[str] = []
    for item in items:
        text = generate_embedding_text(item)
        if not text.strip():
            continue
        texts.append(text)
        id_map.append(item["id"])

    if not texts:
        print("  [skip] empty text")
        return 0

    print(f"  embed {len(texts)}...", end=" ", flush=True)
    t0 = time.time()
    embeddings = embedder.encode(texts)
    validate_embedding_dimensions(embeddings, expected_dim)
    print(f"{time.time() - t0:.1f}s")

    if dry_run:
        print("  [dry-run] skip write")
        return len(texts)

    payload = [
        {"link_id": str(link_id), "embedding": embedding}
        for link_id, embedding in zip(id_map, embeddings)
    ]
    updated = _rpc(rpc_name, {"embeddings": payload})
    try:
        updated_count = int(updated)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"embedding RPC returned invalid updated count: {updated!r}") from exc
    if updated_count != len(payload):
        raise RuntimeError(
            f"embedding RPC updated {updated_count} rows, expected {len(payload)}"
        )
    print(f"  [ok] {len(payload)}")
    return len(payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="backfill pgvector embeddings")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write embeddings to Supabase")
    mode.add_argument("--dry-run", action="store_true", help="dry run only (default)")
    parser.add_argument("--limit", type=int, default=None, help="limit N links")
    parser.add_argument("--provider", default=None, help="local, embed-server, or cloudflare")
    parser.add_argument("--dim", type=int, default=None, help="expected embedding dimension")
    parser.add_argument("--rpc", default=None, help="Supabase RPC used to write embeddings")
    parser.add_argument("--batch-size", type=int, default=None, help="links per embedding batch")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help="rows per REST page")
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES, help="retries per page/batch")
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT_PATH, help="checkpoint JSON path")
    parser.add_argument("--resume", action="store_true", help="resume from a compatible checkpoint")
    parser.add_argument("--reset-checkpoint", action="store_true", help="ignore any existing checkpoint")
    parser.add_argument("--model", default=None, help="override embedding model")
    args = parser.parse_args()

    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be greater than 0")

    provider = resolve_provider(args.provider)
    expected_dim = resolve_expected_dim(provider, args.dim)
    rpc_name = resolve_backfill_rpc(provider, args.rpc)
    batch_size = args.batch_size or (
        DEFAULT_CLOUDFLARE_BATCH_SIZE if provider == "cloudflare" else DEFAULT_LOCAL_BATCH_SIZE
    )
    if batch_size < 1:
        parser.error("--batch-size must be greater than 0")
    if args.page_size < 1:
        parser.error("--page-size must be greater than 0")
    if args.max_retries < 0:
        parser.error("--max-retries must be 0 or greater")

    dry_run = not args.apply

    print(
        f"[pgvector backfill] provider={provider} dim={expected_dim} rpc={rpc_name} batch={batch_size}"
    )
    print(f"  mode: {'dry-run' if dry_run else 'apply'}")
    if args.limit:
        print(f"  limit: {args.limit}")

    print("load embedder...", end=" ", flush=True)
    t0 = time.time()
    embedder = build_embedder(provider, args.model)
    actual_dim = getattr(embedder, "dimension", None)
    if actual_dim is not None and actual_dim != expected_dim:
        raise RuntimeError(f"loaded model dim={actual_dim}, expected dim={expected_dim}")
    print(f"{time.time() - t0:.1f}s")

    checkpoint = None
    if args.resume and not args.reset_checkpoint:
        checkpoint = load_checkpoint(args.checkpoint, provider, rpc_name, expected_dim)
    cursor = str(checkpoint["last_id"]) if checkpoint and checkpoint.get("last_id") else None
    processed = int(checkpoint.get("processed", 0)) if checkpoint else 0
    if cursor:
        print(f"resume after id={cursor} processed={processed}")

    ok, skip = 0, 0
    remaining = args.limit
    page_index = 0
    while remaining is None or remaining > 0:
        fetch_size = min(args.page_size, remaining) if remaining is not None else args.page_size
        page = run_with_retries(
            lambda: fetch_link_page(cursor, fetch_size),
            max_retries=args.max_retries,
        )
        if not page:
            break
        page_index += 1
        print(f"[page {page_index}] {len(page)} links")

        for start in range(0, len(page), batch_size):
            batch = page[start : start + batch_size]
            print(f"  [batch {start // batch_size + 1}] ", end="")
            written = run_with_retries(
                lambda current=batch: batch_write_embeddings(
                    current,
                    embedder,
                    dry_run,
                    rpc_name,
                    expected_dim,
                ),
                max_retries=args.max_retries,
            )
            ok += written
            skip += len(batch) - written
            processed += len(batch)
            cursor = str(batch[-1]["id"])
            if not dry_run:
                save_checkpoint(args.checkpoint, {
                    "provider": provider,
                    "rpc": rpc_name,
                    "dim": expected_dim,
                    "last_id": cursor,
                    "processed": processed,
                    "completed": False,
                })

        if remaining is not None:
            remaining -= len(page)
        if len(page) < fetch_size:
            break

    if not dry_run:
        save_checkpoint(args.checkpoint, {
            "provider": provider,
            "rpc": rpc_name,
            "dim": expected_dim,
            "last_id": cursor,
            "processed": processed,
            "completed": True,
        })

    action = "processed" if dry_run else "written"
    print(f"\ndone: {ok} {action}, {skip} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
