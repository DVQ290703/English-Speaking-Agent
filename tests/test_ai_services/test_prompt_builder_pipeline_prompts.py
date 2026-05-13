import importlib

import pytest


class TestToolCallCap:
    def test_default_value_is_5(self, monkeypatch):
        monkeypatch.delenv("TOOL_CALL_CAP", raising=False)
        import app.core.settings as s
        importlib.reload(s)
        assert s.TOOL_CALL_CAP == 5

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("TOOL_CALL_CAP", "3")
        import app.core.settings as s
        importlib.reload(s)
        assert s.TOOL_CALL_CAP == 3


class TestLoadPreflightPrompt:
    def test_returns_file_content_when_file_exists(self, tmp_path, monkeypatch):
        f = tmp_path / "preflight_prompt.md"
        f.write_text("preflight content", encoding="utf-8")
        import app.prompts.prompt_builder as pb
        monkeypatch.setattr(pb, "_PREFLIGHT_PROMPT_PATH", f)
        pb._CACHE["preflight_mtime"] = None
        pb._CACHE["preflight"] = None
        assert pb.load_preflight_prompt() == "preflight content"

    def test_returns_fallback_when_file_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb
        monkeypatch.setattr(pb, "_PREFLIGHT_PROMPT_PATH", tmp_path / "nonexistent.md")
        pb._CACHE["preflight_mtime"] = None
        pb._CACHE["preflight"] = None
        result = pb.load_preflight_prompt()
        assert "SAFETY" in result
        assert "TOOL" in result

    def test_cache_hit(self, tmp_path, monkeypatch):
        f = tmp_path / "preflight_prompt.md"
        f.write_text("cached", encoding="utf-8")
        import app.prompts.prompt_builder as pb
        monkeypatch.setattr(pb, "_PREFLIGHT_PROMPT_PATH", f)
        pb._CACHE["preflight_mtime"] = f.stat().st_mtime
        pb._CACHE["preflight"] = "cached"
        assert pb.load_preflight_prompt() == "cached"
