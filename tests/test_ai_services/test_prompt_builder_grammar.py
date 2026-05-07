from pathlib import Path

import pytest


def _write_sections_file(tmp_path, **sections) -> Path:
    parts = []
    for name, content in sections.items():
        parts.append(f"<!-- BEGIN: {name} -->\n{content}\n<!-- END: {name} -->")
    f = tmp_path / "system_prompt.md"
    f.write_text("\n\n".join(parts), encoding="utf-8")
    return f


def _reset_cache(pb) -> None:
    pb._CACHE["mtime"] = None
    pb._CACHE["sections"] = None


class TestLoadSections:
    def test_parses_all_sections(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base content",
            grammar_instruction="grammar content",
            suggestions_instruction="suggestions content",
            preflight_prompt="preflight content",
            blocked_response="blocked content",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        sections = pb._load_sections()
        assert sections["system_prompt"] == "base content"
        assert sections["grammar_instruction"] == "grammar content"
        assert sections["suggestions_instruction"] == "suggestions content"
        assert sections["preflight_prompt"] == "preflight content"
        assert sections["blocked_response"] == "blocked content"

    def test_strips_section_content(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = tmp_path / "system_prompt.md"
        f.write_text(
            "<!-- BEGIN: system_prompt -->\n\n  trimmed  \n\n<!-- END: system_prompt -->",
            encoding="utf-8",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        assert pb._load_sections()["system_prompt"] == "trimmed"

    def test_cache_hit_avoids_disk_read(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(tmp_path, system_prompt="cached")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        pb._CACHE["mtime"] = f.stat().st_mtime
        pb._CACHE["sections"] = {"system_prompt": "cached"}

        read_calls: list = []
        original = Path.read_text

        def spy(self, *args, **kwargs):
            read_calls.append(self)
            return original(self, *args, **kwargs)

        monkeypatch.setattr(Path, "read_text", spy)
        result = pb._load_sections()
        assert result["system_prompt"] == "cached"
        assert read_calls == [], "disk read should not happen on cache hit"

    def test_cache_miss_on_stale_mtime(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(tmp_path, system_prompt="new content")
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        pb._CACHE["mtime"] = 0.0
        pb._CACHE["sections"] = {"system_prompt": "old content"}

        result = pb._load_sections()
        assert result["system_prompt"] == "new content"

    def test_returns_fallbacks_when_file_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", tmp_path / "nonexistent.md")
        _reset_cache(pb)

        sections = pb._load_sections()
        assert "SAFETY" in sections["preflight_prompt"]
        assert "RESPONSE FORMAT" in sections["grammar_instruction"]
        assert sections["system_prompt"] == pb._BASE_FALLBACK
        assert sections["blocked_response"] == pb._BLOCKED_RESPONSE_FALLBACK


class TestBuildSystemPromptGrammar:
    def test_grammar_block_appended_when_include_grammar_true(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path, system_prompt="base", grammar_instruction="GRAMMAR BLOCK"
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True)
        assert "GRAMMAR BLOCK" in prompt

    def test_grammar_block_absent_when_include_grammar_false(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path, system_prompt="base", grammar_instruction="GRAMMAR BLOCK"
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=False)
        assert "GRAMMAR BLOCK" not in prompt

    def test_suggestions_block_appended_with_grammar(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True)

        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" in prompt

    def test_suggestions_block_absent_when_disabled(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True, include_suggestions=False)

        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" not in prompt

    def test_grammar_and_suggestions_absent_when_use_structured_output(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True, use_structured_output=True)
        assert "GRAMMAR BLOCK" not in prompt
        assert "SUGGESTIONS BLOCK" not in prompt

    def test_structured_output_false_preserves_existing_behaviour(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        f = _write_sections_file(
            tmp_path,
            system_prompt="base",
            grammar_instruction="GRAMMAR BLOCK",
            suggestions_instruction="SUGGESTIONS BLOCK",
        )
        monkeypatch.setattr(pb, "_SYSTEM_PROMPT_PATH", f)
        _reset_cache(pb)

        prompt = pb.build_system_prompt(include_grammar=True, use_structured_output=False)
        assert "GRAMMAR BLOCK" in prompt
        assert "SUGGESTIONS BLOCK" in prompt
