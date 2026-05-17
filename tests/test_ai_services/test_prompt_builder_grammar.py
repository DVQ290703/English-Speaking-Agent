from pathlib import Path
import types


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


class TestLoadSections:
    def test_parses_all_sections(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = "\n\n".join(
            [
                "<!-- BEGIN: system_prompt -->\nbase content\n<!-- END: system_prompt -->",
                "<!-- BEGIN: grammar_instruction -->\ngrammar content\n<!-- END: grammar_instruction -->",
                "<!-- BEGIN: suggestions_instruction -->\nsuggestions content\n<!-- END: suggestions_instruction -->",
                "<!-- BEGIN: preflight_prompt -->\npreflight content\n<!-- END: preflight_prompt -->",
                "<!-- BEGIN: blocked_response -->\nblocked content\n<!-- END: blocked_response -->",
            ]
        )
        _fake_prompt_file(monkeypatch, pb, content)
        _reset_cache(pb)

        sections = pb._load_sections()
        assert sections["system_prompt"] == "base content"
        assert sections["grammar_instruction"] == "grammar content"
        assert sections["suggestions_instruction"] == "suggestions content"
        assert sections["preflight_prompt"] == "preflight content"
        assert sections["blocked_response"] == "blocked content"

    def test_strips_section_content(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = "<!-- BEGIN: system_prompt -->\n\n  trimmed  \n\n<!-- END: system_prompt -->"
        _fake_prompt_file(monkeypatch, pb, content)
        _reset_cache(pb)

        assert pb._load_sections()["system_prompt"] == "trimmed"

    def test_cache_hit_avoids_disk_read(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        fake_path = Path(r"D:\virtual\system_prompt.md")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", fake_path)
        pb._CACHE["mtime"] = 999.0
        pb._CACHE["sections"] = {"system_prompt": "cached"}

        monkeypatch.setattr(Path, "stat", lambda self: types.SimpleNamespace(st_mtime=999.0))

        read_calls = {"count": 0}
        original_read_text = Path.read_text

        def spy_read_text(self, encoding=None):
            read_calls["count"] += 1
            return original_read_text(self, encoding=encoding)

        monkeypatch.setattr(Path, "read_text", spy_read_text)
        result = pb._load_sections()
        assert result["system_prompt"] == "cached"
        assert read_calls["count"] == 0

    def test_cache_miss_on_stale_mtime(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        content = "<!-- BEGIN: system_prompt -->\nnew content\n<!-- END: system_prompt -->"
        _fake_prompt_file(monkeypatch, pb, content, mtime=200.0)
        pb._CACHE["mtime"] = 100.0
        pb._CACHE["sections"] = {"system_prompt": "old content"}

        result = pb._load_sections()
        assert result["system_prompt"] == "new content"

    def test_returns_fallbacks_when_file_missing(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        fake_missing = Path(r"D:\virtual\nonexistent.md")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", fake_missing)
        _reset_cache(pb)

        def fake_stat(_self):
            raise OSError("missing")

        monkeypatch.setattr(Path, "stat", fake_stat)
        sections = pb._load_sections()
        assert "SAFETY" in sections["preflight_prompt"]
        assert "RESPONSE FORMAT" in sections["grammar_instruction"]
        assert sections["system_prompt"] == pb._BASE_FALLBACK
        assert sections["blocked_response"] == pb._BLOCKED_RESPONSE_FALLBACK


class TestBuildSystemPromptGrammar:
    def test_grammar_block_appended_when_include_grammar_true(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_load_base_prompt", lambda: "base")
        monkeypatch.setattr(pb, "_load_grammar_instruction", lambda: "GRAMMAR BLOCK")
        monkeypatch.setattr(pb, "_load_suggestions_instruction", lambda: "SUGGESTIONS BLOCK")
        monkeypatch.setattr(pb, "_load_topics", lambda: {})
        prompt = pb.build_system_prompt(include_grammar=True)
        assert "GRAMMAR BLOCK" in prompt

    def test_grammar_block_absent_when_include_grammar_false(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_load_base_prompt", lambda: "base")
        monkeypatch.setattr(pb, "_load_grammar_instruction", lambda: "GRAMMAR BLOCK")
        monkeypatch.setattr(pb, "_load_suggestions_instruction", lambda: "SUGGESTIONS BLOCK")
        monkeypatch.setattr(pb, "_load_topics", lambda: {})
        prompt = pb.build_system_prompt(include_grammar=False)
        assert "GRAMMAR BLOCK" not in prompt

    def test_suggestions_block_appended_with_grammar(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_load_base_prompt", lambda: "base")
        monkeypatch.setattr(pb, "_load_grammar_instruction", lambda: "GRAMMAR BLOCK")
        monkeypatch.setattr(pb, "_load_suggestions_instruction", lambda: "SUGGESTIONS BLOCK")
        monkeypatch.setattr(pb, "_load_topics", lambda: {})
        prompt = pb.build_system_prompt(include_grammar=True)
        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" in prompt

    def test_suggestions_block_absent_when_disabled(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_load_base_prompt", lambda: "base")
        monkeypatch.setattr(pb, "_load_grammar_instruction", lambda: "GRAMMAR BLOCK")
        monkeypatch.setattr(pb, "_load_suggestions_instruction", lambda: "SUGGESTIONS BLOCK")
        monkeypatch.setattr(pb, "_load_topics", lambda: {})
        prompt = pb.build_system_prompt(include_grammar=True, include_suggestions=False)
        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" not in prompt

    def test_grammar_and_suggestions_absent_when_use_structured_output(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_load_base_prompt", lambda: "base")
        monkeypatch.setattr(pb, "_load_grammar_instruction", lambda: "GRAMMAR BLOCK")
        monkeypatch.setattr(pb, "_load_suggestions_instruction", lambda: "SUGGESTIONS BLOCK")
        monkeypatch.setattr(pb, "_load_structured_output_instruction", lambda: "STRUCTURED BLOCK")
        monkeypatch.setattr(pb, "_load_topics", lambda: {})
        prompt = pb.build_system_prompt(include_grammar=True, use_structured_output=True)
        assert "GRAMMAR BLOCK" not in prompt
        assert "SUGGESTIONS BLOCK" not in prompt
        assert "STRUCTURED BLOCK" in prompt

    def test_structured_output_false_preserves_existing_behaviour(self, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_load_base_prompt", lambda: "base")
        monkeypatch.setattr(pb, "_load_grammar_instruction", lambda: "GRAMMAR BLOCK")
        monkeypatch.setattr(pb, "_load_suggestions_instruction", lambda: "SUGGESTIONS BLOCK")
        monkeypatch.setattr(pb, "_load_topics", lambda: {})
        prompt = pb.build_system_prompt(include_grammar=True, use_structured_output=False)
        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" in prompt
