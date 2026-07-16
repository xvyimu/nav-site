#!/usr/bin/env python3
"""
Tests for backfill-embeddings.py generate_embedding_text() function.

This test does NOT load sentence-transformers; it extracts the function
as a pure string transformation test.
"""

import os, sys, json
import importlib.util
import pytest

# Add scripts dir to path so the import works
_SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, _SCRIPTS_DIR)

# Set dummy env vars so backfill module can import without RuntimeError
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY_PROD"] = "test-key"

# Import via importlib because the file is named backfill-embeddings.py (hyphen)
_backfill_path = os.path.join(_SCRIPTS_DIR, "backfill-embeddings.py")
_spec = importlib.util.spec_from_file_location("backfill_embeddings", _backfill_path)
backfill = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(backfill)
generate_embedding_text = backfill.generate_embedding_text


class FakeEmbedder:
    def __init__(self, dim):
        self.dim = dim

    def encode(self, texts):
        return [[0.1] * self.dim for _ in texts]


class TestGenerateEmbeddingText:
    """Unit tests for the embedding text generation function."""

    def test_title_description_and_category(self):
        text = generate_embedding_text({
            "title": "React",
            "description": "A JavaScript library for building user interfaces",
            "nav_categories": {"name": "前端框架"},
        })
        assert text == "React A JavaScript library for building user interfaces [前端框架]"

    def test_title_only_no_description(self):
        text = generate_embedding_text({
            "title": "Vue.js",
            "description": None,
            "nav_categories": {"name": "前端框架"},
        })
        assert text == "Vue.js [前端框架]"

    def test_title_only_no_category(self):
        text = generate_embedding_text({
            "title": "Python",
            "description": "Popular programming language",
            "nav_categories": None,
        })
        assert text == "Python Popular programming language"

    def test_empty_description_and_no_category(self):
        text = generate_embedding_text({
            "title": "Go",
            "description": "",
            "nav_categories": None,
        })
        assert text == "Go"

    def test_category_is_empty_dict(self):
        text = generate_embedding_text({
            "title": "Rust",
            "description": "Systems programming",
            "nav_categories": {},
        })
        assert text == "Rust Systems programming"

    def test_category_missing_name_key(self):
        text = generate_embedding_text({
            "title": "Deno",
            "description": "Runtime",
            "nav_categories": {"slug": "runtime"},
        })
        assert text == "Deno Runtime"

    def test_title_is_empty(self):
        text = generate_embedding_text({
            "title": "",
            "description": "desc",
            "nav_categories": {"name": "cat"},
        })
        assert text == " desc [cat]"

    def test_all_fields_maximal(self):
        """Maximal case: long title, long description, category."""
        text = generate_embedding_text({
            "title": "A very long title for a programming tool that does many things",
            "description": "This tool helps developers write better code faster with AI assistance",
            "nav_categories": {"name": "开发工具"},
        })
        assert "[开发工具]" in text
        assert text.startswith("A very long title")

    def test_backward_compatible_no_category_field(self):
        """Old records without nav_categories field should still work."""
        text = generate_embedding_text({
            "title": "Test",
            "description": "desc",
        })
        assert text == "Test desc"

    def test_nav_categories_is_string_not_dict(self):
        """Edge case: nav_categories is not a dict (should be safe)."""
        text = generate_embedding_text({
            "title": "Test",
            "description": "desc",
            "nav_categories": "oops",
        })
        assert text == "Test desc"


class TestBackfillProviderConfig:
    """Provider and RPC selection for production backfills."""

    def test_embed_server_env_maps_to_local_512_backfill(self):
        assert backfill.resolve_provider("embed-server") == "local"
        assert backfill.resolve_expected_dim("local", None) == 512
        assert backfill.resolve_backfill_rpc("local", None) == "batch_update_embeddings"

    def test_cloudflare_provider_uses_1024_v2_defaults(self):
        assert backfill.resolve_provider(" cloudflare ") == "cloudflare"
        assert backfill.resolve_expected_dim("cloudflare", None) == 1024
        assert backfill.resolve_backfill_rpc("cloudflare", None) == "batch_update_embeddings_v2"

    def test_cloudflare_rest_result_shape_is_supported(self):
        vector = [0.1] * 1024
        embeddings = backfill.extract_cloudflare_embeddings(
            {"result": {"data": [vector], "shape": [1, 1024]}, "success": True},
            expected_count=1,
        )
        assert embeddings == [vector]

    def test_batch_write_uses_selected_rpc_name(self, monkeypatch):
        calls = []
        def fake_rpc(name, params):
            calls.append((name, params))
            return 1

        monkeypatch.setattr(backfill, "_rpc", fake_rpc)

        count = backfill.batch_write_embeddings(
            [
                {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "title": "React",
                    "description": "UI library",
                    "nav_categories": {"name": "Frontend"},
                }
            ],
            FakeEmbedder(1024),
            dry_run=False,
            rpc_name="batch_update_embeddings_v2",
            expected_dim=1024,
        )

        assert count == 1
        assert calls[0][0] == "batch_update_embeddings_v2"
        assert len(calls[0][1]["embeddings"][0]["embedding"]) == 1024

    def test_batch_write_rejects_partial_rpc_updates(self, monkeypatch):
        monkeypatch.setattr(backfill, "_rpc", lambda _name, _params: 0)

        with pytest.raises(RuntimeError, match="updated 0 rows, expected 1"):
            backfill.batch_write_embeddings(
                [{
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "title": "React",
                    "description": "UI library",
                    "nav_categories": {"name": "Frontend"},
                }],
                FakeEmbedder(512),
                dry_run=False,
                expected_dim=512,
            )


class TestBackfillResilience:
    def test_fetch_link_page_uses_stable_id_cursor(self, monkeypatch):
        paths = []
        monkeypatch.setattr(
            backfill,
            "_rest",
            lambda path: paths.append(path) or [{"id": "b", "title": "B"}],
        )

        rows = backfill.fetch_link_page(after_id="a", page_size=25)

        assert rows == [{"id": "b", "title": "B"}]
        assert "order=id.asc" in paths[0]
        assert "id=gt.a" in paths[0]
        assert "limit=25" in paths[0]

    def test_checkpoint_round_trip_and_contract_validation(self, tmp_path):
        checkpoint = tmp_path / "backfill-checkpoint.json"
        state = {
            "provider": "cloudflare",
            "rpc": "batch_update_embeddings_v2",
            "dim": 1024,
            "last_id": "550e8400-e29b-41d4-a716-446655440000",
            "processed": 25,
        }

        backfill.save_checkpoint(str(checkpoint), state)

        assert backfill.load_checkpoint(
            str(checkpoint), "cloudflare", "batch_update_embeddings_v2", 1024
        )["last_id"] == state["last_id"]
        with pytest.raises(RuntimeError, match="does not match"):
            backfill.load_checkpoint(
                str(checkpoint), "local", "batch_update_embeddings", 512
            )

    def test_retry_with_backoff_recovers_transient_failure(self):
        attempts = []
        sleeps = []

        def operation():
            attempts.append(1)
            if len(attempts) < 3:
                raise RuntimeError("temporary")
            return "ok"

        result = backfill.run_with_retries(
            operation,
            max_retries=2,
            sleep=lambda seconds: sleeps.append(seconds),
        )

        assert result == "ok"
        assert len(attempts) == 3
        assert sleeps == [1.0, 2.0]
