#!/usr/bin/env python3
"""
嵌入微服务 — 为 nav-site 提供实时 embedding 生成

用于新增/更新链接时自动生成 pgvector 向量，无需每次重新加载模型。

端点：
  GET  /health          → {"status": "ok", "dim": 512, "model": "BAAI/bge-small-zh-v1.5"}
  POST /embed           → {"embedding": [0.0123, ...], "dim": 512}
  POST /embed-batch     → {"embeddings": [[0.0123, ...], ...], "count": N}

用法：
  python scripts/embed-server.py            # 默认 127.0.0.1:8003
  python scripts/embed-server.py --port 8003
"""

import os, sys, time, argparse
from sentence_transformers import SentenceTransformer
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="nav-site embed service", version="1.0.0")

# ── 配置 ──
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
DEFAULT_PORT = int(os.environ.get("EMBED_PORT", "8003"))
MAX_TEXT_CHARS = int(os.environ.get("EMBED_MAX_TEXT_CHARS", "2000"))
MAX_BATCH_SIZE = int(os.environ.get("EMBED_MAX_BATCH_SIZE", "32"))

# ── 模型（懒加载） ──
model: SentenceTransformer | None = None
_model_loaded = False


def get_model() -> SentenceTransformer:
    global model, _model_loaded
    if not _model_loaded:
        print(f"loading model {EMBEDDING_MODEL}...", end=" ", flush=True)
        t0 = time.time()
        model = SentenceTransformer(EMBEDDING_MODEL, trust_remote_code=False)
        print(f"{time.time() - t0:.1f}s (dim={model.get_embedding_dimension()})")
        _model_loaded = True
    assert model is not None
    return model


# ── Schema ──


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


# ── 端点 ──


@app.get("/health")
def health():
    m = get_model()
    return {"status": "ok", "dim": m.get_embedding_dimension(), "model": EMBEDDING_MODEL}


@app.post("/embed")
def embed_one(req: EmbedRequest):
    text = normalize_text(req.text)
    m = get_model()
    vec = m.encode([text], normalize_embeddings=True, show_progress_bar=False)[0]
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


# ── 入口 ──


def main():
    parser = argparse.ArgumentParser(description="nav-site embed microservice")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port (default {DEFAULT_PORT})")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="bind address")
    args = parser.parse_args()

    import uvicorn
    port = int(os.environ.get("EMBED_PORT", args.port))
    print(f"[embed-server] {EMBEDDING_MODEL} on {args.host}:{port}")
    uvicorn.run(app, host=args.host, port=port, log_level="info", reload=False)


if __name__ == "__main__":
    main()
