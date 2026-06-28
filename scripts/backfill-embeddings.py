#!/usr/bin/env python3
"""
pgvector 嵌入回填脚本 — 为所有已批准链接生成并写入向量嵌入

工作流程：
  1. 从生产库读取所有已批准链接（标题 + 描述）
  2. 用本地 bge-small-zh-v1.5 生成 512 维向量
  3. 通过 batch_update_embeddings RPC 批量写入生产库

用法：
  python scripts/backfill-embeddings.py              # 全部回填
  python scripts/backfill-embeddings.py --dry-run     # 仅预览，不写入
  python scripts/backfill-embeddings.py --limit 50    # 仅处理前 N 条（测试用）
"""

import os, sys, json, time, argparse, ssl
from sentence_transformers import SentenceTransformer

# ── 配置 ──
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required")
SUPABASE_URL = SUPABASE_URL.rstrip("/")
if not SUPABASE_URL.startswith("https://"):
    raise RuntimeError("SUPABASE_URL must use https://")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY_PROD") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY"
)
if not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY_PROD or SUPABASE_SERVICE_ROLE_KEY is required")

EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"
BATCH_SIZE = 50


# Windows schannel: CRL 检查在无互联网访问时失败（CRYPT_E_REVOCATION_OFFLINE）
# 使用 unverified context 绕过此限制，同时保持 HTTPS 加密
if os.environ.get("BACKFILL_ALLOW_INSECURE_TLS") == "1":
    # Opt-in escape hatch for local Windows CRL failures only.
    _CTX = ssl._create_unverified_context()
else:
    _CTX = ssl.create_default_context()


def _request(method: str, url: str, data: bytes | None = None) -> bytes:
    import urllib.request, urllib.error
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    # 用自定义 SSL context 绕过 CRL 问题
    resp = urllib.request.urlopen(req, context=_CTX)
    return resp.read()


def _rest(path: str) -> list | dict:
    return json.loads(_request("GET", f"{SUPABASE_URL}{path}"))


def _rpc(name: str, params: dict) -> None:
    url = f"{SUPABASE_URL}/rest/v1/rpc/{name}"
    _request("POST", url, data=json.dumps(params).encode())


def fetch_links(limit: int | None = None) -> list[dict]:
    params = "select=id,title,description&approved=eq.true&order=created_at.desc"
    if limit:
        params += f"&limit={limit}"
    data = _rest(f"/rest/v1/nav_links?{params}")
    print(f"  -> {len(data)} links")
    return data


def generate_embedding_text(link: dict) -> str:
    parts = [link["title"] or ""]
    desc = (link.get("description") or "").strip()
    if desc:
        parts.append(desc)
    return " ".join(parts)


def batch_write_embeddings(
    items: list[dict], model: SentenceTransformer, dry_run: bool = False
) -> int:
    texts, id_map = [], []
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
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    print(f"{time.time() - t0:.1f}s")

    if dry_run:
        print(f"  [dry-run] skip write")
        return len(texts)

    payload = [
        {"link_id": str(link_id), "embedding": emb.tolist()}
        for link_id, emb in zip(id_map, embeddings)
    ]
    _rpc("batch_update_embeddings", {"embeddings": payload})
    print(f"  [ok] {len(payload)}")
    return len(payload)


def main():
    parser = argparse.ArgumentParser(description="backfill pgvector embeddings")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write embeddings to Supabase")
    mode.add_argument("--dry-run", action="store_true", help="dry run only (default)")
    parser.add_argument("--limit", type=int, default=None, help="limit N links")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be greater than 0")

    dry_run = not args.apply

    print(f"[pgvector backfill] model={EMBEDDING_MODEL} batch={BATCH_SIZE}")
    print(f"  mode: {'dry-run' if dry_run else 'apply'}")
    if args.limit:
        print(f"  limit: {args.limit}")

    print("load model...", end=" ", flush=True)
    t0 = time.time()
    model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"{time.time() - t0:.1f}s (dim={model.get_embedding_dimension()})")

    print("fetch links...")
    links = fetch_links(args.limit)
    print(f"total: {len(links)}")

    batches = [links[i : i + BATCH_SIZE] for i in range(0, len(links), BATCH_SIZE)]
    ok, skip = 0, 0
    for i, batch in enumerate(batches):
        print(f"[{i + 1}/{len(batches)}] ", end="")
        n = batch_write_embeddings(batch, model, dry_run)
        ok += n
        skip += len(batch) - n

    action = "processed" if dry_run else "written"
    print(f"\ndone: {ok} {action}, {skip} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
