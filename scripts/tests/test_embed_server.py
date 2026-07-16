#!/usr/bin/env python3
"""
Tests for embed server: /embed (unchanged) and /embed-query (with BGE prefix).

Uses FastAPI TestClient with SentenceTransformer patched to avoid loading the model.
"""

import os, sys, json
import importlib.util
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

_SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, _SCRIPTS_DIR)

# Patch SentenceTransformer BEFORE the embed server module is loaded.
# This prevents any real model download or CUDA allocation.


class _FakeEmbedResult:
    """Mimics a numpy array row returned by .encode()[i] — supports .tolist()."""
    def __init__(self, data):
        self._data = data
    def tolist(self):
        return self._data
    def __len__(self):
        return len(self._data)
    def __iter__(self):
        return iter(self._data)


class _FakeEmbedArray:
    """Mimics a 2D numpy array returned by .encode() — supports indexing + .tolist()."""
    def __init__(self, data_2d):
        self._data = data_2d
        n = len(data_2d)
        d = len(data_2d[0]) if data_2d and isinstance(data_2d[0], list) else 0
        self.shape = (n, d)
    def tolist(self):
        return self._data
    def __getitem__(self, idx):
        return _FakeEmbedResult(self._data[idx])
    def __len__(self):
        return len(self._data)


_single = _FakeEmbedArray([[0.1] * 512])
_batch = _FakeEmbedArray([[0.1] * 512, [0.2] * 512])

_fake_model = MagicMock()
_fake_model.get_sentence_embedding_dimension.return_value = 512
_fake_model.encode.return_value = _single


def _fake_sentence_transformer(model_name, **kwargs):
    return _fake_model


st_patcher = patch("sentence_transformers.SentenceTransformer", _fake_sentence_transformer)
st_patcher.start()

# Now it's safe to import/exec the embed server module
_embed_path = os.path.join(_SCRIPTS_DIR, "embed-server.py")
_spec = importlib.util.spec_from_file_location("embed_server", _embed_path)
embed_server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(embed_server)

BGE_QUERY_PREFIX = embed_server.BGE_QUERY_PREFIX
client = TestClient(embed_server.app)


class TestEmbedEndpoint:
    """POST /embed - unchanged, no prefix added."""

    def test_embed_returns_embedding(self):
        _fake_model.reset_mock()
        _fake_model.encode.return_value = _single
        resp = client.post("/embed", json={"text": "hello world"})
        assert resp.status_code == 200
        data = resp.json()
        assert "embedding" in data
        assert "dim" in data
        assert data["dim"] == 512
        assert len(data["embedding"]) == 512
        # Verify encode was called WITHOUT the prefix
        call_text = _fake_model.encode.call_args[0][0][0]
        assert BGE_QUERY_PREFIX not in call_text
        assert call_text == "hello world"

    def test_embed_rejects_empty_text(self):
        resp = client.post("/embed", json={"text": ""})
        assert resp.status_code == 400

    def test_embed_rejects_oversized_text(self):
        resp = client.post("/embed", json={"text": "x" * 2001})
        assert resp.status_code == 413


class TestEmbedQueryEndpoint:
    """POST /embed-query - prepends BGE query prefix."""

    def test_embed_query_prepends_prefix(self):
        _fake_model.reset_mock()
        _fake_model.encode.return_value = _single
        resp = client.post("/embed-query", json={"text": "react component library"})
        assert resp.status_code == 200
        data = resp.json()
        assert "embedding" in data
        assert data["dim"] == 512
        # Verify encode was called WITH the prefix
        call_text = _fake_model.encode.call_args[0][0][0]
        assert call_text.startswith(BGE_QUERY_PREFIX)
        assert "react component library" in call_text

    def test_embed_query_prefix_constant_is_chinese(self):
        """The prefix must be Chinese for bge-small-zh-v1.5."""
        assert "为这个句子生成表示以用于检索相关文章：" in BGE_QUERY_PREFIX

    def test_embed_query_rejects_empty_text(self):
        resp = client.post("/embed-query", json={"text": ""})
        assert resp.status_code == 400


class TestHealthEndpoint:
    def test_uses_lifespan_instead_of_deprecated_startup_handlers(self):
        assert embed_server.app.router.on_startup == []

    def test_health_returns_model_info(self):
        _fake_model.reset_mock()
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["dim"] == 512


class TestEmbedBatchEndpoint:
    def test_embed_batch_works(self):
        _fake_model.reset_mock()
        _fake_model.encode.return_value = _batch
        resp = client.post("/embed-batch", json={"texts": ["hello", "world"]})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 2
        assert len(data["embeddings"]) == 2

    def test_embed_batch_rejects_empty(self):
        resp = client.post("/embed-batch", json={"texts": []})
        assert resp.status_code == 400

    def test_embed_batch_rejects_oversized(self):
        resp = client.post("/embed-batch", json={"texts": ["x"] * 33})
        assert resp.status_code == 413


# Cleanup
st_patcher.stop()
