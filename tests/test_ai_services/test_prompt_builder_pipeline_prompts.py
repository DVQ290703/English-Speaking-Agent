import importlib

import pytest


def _write_sections_file(tmp_path, **sections):
    parts = []
    for name, content in sections.items():
        parts.append(f"<!-- BEGIN: {name} -->\n{content}\n<!-- END: {name} -->")
    f = tmp_path / "system_prompt.md"
    f.write_text("\n\n".join(parts), encoding="utf-8")
    return f


def _reset_cache(pb) -> None:
    pb._CACHE["mtime"] = None
    pb._CACHE["sections"] = None


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
    def test_returns_section_content(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(tmp_path, preflight_prompt="preflight content")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        assert pb.load_preflight_prompt() == "preflight content"

    def test_returns_fallback_when_file_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", tmp_path / "nonexistent.md")
        _reset_cache(pb)

        result = pb.load_preflight_prompt()
        assert "SAFETY" in result
        assert "TOOL" in result

    def test_returns_fallback_when_section_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(tmp_path, system_prompt="only base")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        result = pb.load_preflight_prompt()
        assert "SAFETY" in result


class TestLoadBlockedResponse:
    def test_returns_section_content(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(tmp_path, blocked_response="blocked content")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        assert pb.load_blocked_response() == "blocked content"

    def test_returns_fallback_when_file_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", tmp_path / "nonexistent.md")
        _reset_cache(pb)

        result = pb.load_blocked_response()
        assert result == pb._BLOCKED_RESPONSE_FALLBACK

    def test_returns_fallback_when_section_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(tmp_path, system_prompt="only base")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        result = pb.load_blocked_response()
        assert result == pb._BLOCKED_RESPONSE_FALLBACK
