import importlib
from pathlib import Path
import types


def _write_sections_text(**sections):
    parts = []
    for name, content in sections.items():
        parts.append(f"<!-- BEGIN: {name} -->\n{content}\n<!-- END: {name} -->")
    return "\n\n".join(parts)


def _reset_cache(pb) -> None:
    pb._CACHE["mtime"] = None
    pb._CACHE["sections"] = None


def _fake_prompt_file(monkeypatch, pb, content: str, mtime: float = 123.0):
    fake_path = Path(r"D:\virtual\system_prompt.md")
    monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", fake_path)

    original_stat = Path.stat
    original_read_text = Path.read_text

    def fake_stat(self):
        if self == fake_path:
            return types.SimpleNamespace(st_mtime=mtime)
        return original_stat(self)

    def fake_read_text(self, encoding=None):
        if self == fake_path:
            return content
        return original_read_text(self, encoding=encoding)

    monkeypatch.setattr(Path, "stat", fake_stat)
    monkeypatch.setattr(Path, "read_text", fake_read_text)


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
    def test_returns_section_content(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = _write_sections_text(preflight_prompt="preflight content")
        _fake_prompt_file(monkeypatch, pb, content)
        _reset_cache(pb)

        assert pb.load_preflight_prompt() == "preflight content"

    def test_returns_fallback_when_file_missing(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        fake_missing = Path(r"D:\virtual\nonexistent.md")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", fake_missing)
        _reset_cache(pb)
        monkeypatch.setattr(Path, "stat", lambda _self: (_ for _ in ()).throw(OSError("missing")))

        result = pb.load_preflight_prompt()
        assert "SAFETY" in result
        assert "TOOL" in result

    def test_returns_fallback_when_section_missing(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = _write_sections_text(system_prompt="only base")
        _fake_prompt_file(monkeypatch, pb, content)
        _reset_cache(pb)

        result = pb.load_preflight_prompt()
        assert "SAFETY" in result


class TestLoadBlockedResponse:
    def test_returns_section_content(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = _write_sections_text(blocked_response="blocked content")
        _fake_prompt_file(monkeypatch, pb, content)
        _reset_cache(pb)

        assert pb.load_blocked_response() == "blocked content"

    def test_returns_fallback_when_file_missing(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        fake_missing = Path(r"D:\virtual\nonexistent.md")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", fake_missing)
        _reset_cache(pb)
        monkeypatch.setattr(Path, "stat", lambda _self: (_ for _ in ()).throw(OSError("missing")))

        result = pb.load_blocked_response()
        assert result == pb._BLOCKED_RESPONSE_FALLBACK

    def test_returns_fallback_when_section_missing(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = _write_sections_text(system_prompt="only base")
        _fake_prompt_file(monkeypatch, pb, content)
        _reset_cache(pb)

        result = pb.load_blocked_response()
        assert result == pb._BLOCKED_RESPONSE_FALLBACK
