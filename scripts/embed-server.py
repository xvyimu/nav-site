#!/usr/bin/env python3
"""
嵌入微服务 — 为 nav-site 提供实时 embedding 生成

用于新增/更新链接时自动生成 pgvector 向量，无需每次重新加载模型。
也支持挂到 Fly/Railway/VPS 作为远程 HTTPS 服务（需配置 EMBED_SERVER_API_KEY）。

端点：
  GET  /health          → {"status": "ok", "dim": 512, "model": "BAAI/bge-small-zh-v1.5"}
  POST /embed           → {"embedding": [0.0123, ...], "dim": 512}
  POST /embed-query     → same, with BGE query instruction prefix
  POST /embed-batch     → {"embeddings": [[0.0123, ...], ...], "count": N}

鉴权：
  若设置环境变量 EMBED_SERVER_API_KEY：
    - GET /health、/healthz 公开（平台探针）
    - 其余路由必须 Authorization: Bearer <key>
  未设置时全部开放（适合本机 loopback）。

用法：
  python scripts/embed-server.py            # 默认 127.0.0.1:8003
  python scripts/embed-server.py --port 8003
  EMBED_SERVER_API_KEY=secret python scripts/embed-server.py --host 0.0.0.0
"""

import os, time, argparse, secrets
from contextlib import asynccontextmanager
from sentence_transformers import SentenceTransformer
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ── 配置 ──
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
DEFAULT_PORT = int(os.environ.get("EMBED_PORT", "8003"))
MAX_TEXT_CHARS = int(os.environ.get("EMBED_MAX_TEXT_CHARS", "2000"))
MAX_BATCH_SIZE = int(os.environ.get("EMBED_MAX_BATCH_SIZE", "32"))
EMBED_SERVER_API_KEY = (os.environ.get("EMBED_SERVER_API_KEY") or "").strip()

# BGE query instruction prefix (language-matched to model)
BGE_QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："

PUBLIC_PATHS = frozenset({"/health", "/healthz"})


def embedding_dim(m: SentenceTransformer) -> int:
    dim = m.get_sentence_embedding_dimension()
    if dim is None:
        raise RuntimeError("model embedding dimension is None")
    return int(dim)


# ── 模型（懒加载 + 启动预热） ──
model: SentenceTransformer | None = None
_model_loaded = False


def get_model() -> SentenceTransformer:
    global model, _model_loaded
    if not _model_loaded:
        print(f"loading model {EMBEDDING_MODEL}...", end=" ", flush=True)
        t0 = time.time()
        model = SentenceTransformer(EMBEDDING_MODEL, trust_remote_code=False)
        print(f"{time.time() - t0:.1f}s (dim={embedding_dim(model)})")
        _model_loaded = True
    assert model is not None
    return model


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_model()
    yield


app = FastAPI(title="nav-site embed service", version="1.2.1", lifespan=lifespan)


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def _is_public_path(path: str) -> bool:
    normalized = path.rstrip("/") or "/"
    return normalized in PUBLIC_PATHS


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    """When EMBED_SERVER_API_KEY is set, protect non-health routes."""
    if EMBED_SERVER_API_KEY and not _is_public_path(request.url.path):
        provided = _extract_bearer(request)
        if provided is None or not secrets.compare_digest(provided, EMBED_SERVER_API_KEY):
            return JSONResponse(status_code=401, content={"detail": "unauthorized"})
    return await call_next(request)


class EmbedRequest(BaseModel):
    text: str


class EmbedBatchRequest(BaseModel):
    texts: list[str]


def normalize_text(text: str) -> str:
    text = text.strip()
    if not text:
        raise HTTPException(400, "text must not be empty")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(413, f"text must be {MAX_TEXT_CHARS} characters or fewer")
    return text


@app.get("/health")
@app.get("/healthz")
def health():
    m = get_model()
    return {"status": "ok", "dim": embedding_dim(m), "model": EMBEDDING_MODEL}


@app.post("/embed")
def embed_one(req: EmbedRequest):
    text = normalize_text(req.text)
    m = get_model()
    vec = m.encode([text], normalize_embeddings=True, show_progress_bar=False)[0]
    return {"embedding": vec.tolist(), "dim": len(vec)}


@app.post("/embed-query")
def embed_query(req: EmbedRequest):
    text = normalize_text(req.text)
    prefixed = BGE_QUERY_PREFIX + text
    m = get_model()
    vec = m.encode([prefixed], normalize_embeddings=True, show_progress_bar=False)[0]
    return {"embedding": vec.tolist(), "dim": len(vec)}


@app.post("/embed-batch")
def embed_batch(req: EmbedBatchRequest):
    if not req.texts:
        raise HTTPException(400, "texts must not be empty")
    if len(req.texts) > MAX_BATCH_SIZE:
        raise HTTPException(413, f"batch size must be {MAX_BATCH_SIZE} or fewer")
    texts = [normalize_text(t) for t in req.texts if t.strip()]
    if not texts:
        raise HTTPException(400, "all texts were empty")
    m = get_model()
    vecs = m.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return {"embeddings": vecs.tolist(), "count": len(vecs), "dim": vecs.shape[1]}


def main():
    parser = argparse.ArgumentParser(description="nav-site embed microservice")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port (default {DEFAULT_PORT})")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="bind address")
    args = parser.parse_args()

    import uvicorn

    port = int(os.environ.get("EMBED_PORT", args.port))
    auth_mode = "api-key (health public)" if EMBED_SERVER_API_KEY else "open"
    print(f"[embed-server] {EMBEDDING_MODEL} on {args.host}:{port} auth={auth_mode}")
    uvicorn.run(app, host=args.host, port=port, log_level="info", reload=False)


if __name__ == "__main__":
    main()
