from pathlib import Path

import pytest


class TestLoadGrammarInstruction:
    def test_returns_file_content_when_file_exists(self, tmp_path, monkeypatch):
        grammar_file = tmp_path / "grammar_instruction.md"
        grammar_file.write_text("grammar content here", encoding="utf-8")

        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_GRAMMAR_INSTRUCTION_PATH", grammar_file)
        # Clear cache so the monkeypatched path is used
        pb._CACHE["grammar_mtime"] = None
        pb._CACHE["grammar"] = None

        result = pb._load_grammar_instruction()

        assert result == "grammar content here"

    def test_returns_fallback_when_file_missing(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(
            pb, "_GRAMMAR_INSTRUCTION_PATH", tmp_path / "nonexistent.md"
        )
        pb._CACHE["grammar_mtime"] = None
        pb._CACHE["grammar"] = None

        result = pb._load_grammar_instruction()

        assert "RESPONSE FORMAT" in result

    def test_cache_hit_avoids_disk_read(self, tmp_path, monkeypatch):
        grammar_file = tmp_path / "grammar_instruction.md"
        grammar_file.write_text("cached content", encoding="utf-8")

        import app.prompts.prompt_builder as pb

        monkeypatch.setattr(pb, "_GRAMMAR_INSTRUCTION_PATH", grammar_file)
        mtime = grammar_file.stat().st_mtime
        pb._CACHE["grammar_mtime"] = mtime
        pb._CACHE["grammar"] = "cached content"

        read_calls = []

        original_read_text = Path.read_text

        def spy_read_text(self, *args, **kwargs):
            read_calls.append(self)
            return original_read_text(self, *args, **kwargs)

        monkeypatch.setattr(Path, "read_text", spy_read_text)
        result = pb._load_grammar_instruction()

        assert result == "cached content"
        assert read_calls == [], "disk read should not happen on cache hit"


class TestBuildSystemPromptGrammar:
    def test_grammar_block_appended_when_include_grammar_true(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        grammar_file = tmp_path / "grammar_instruction.md"
        grammar_file.write_text("GRAMMAR BLOCK", encoding="utf-8")
        monkeypatch.setattr(pb, "_GRAMMAR_INSTRUCTION_PATH", grammar_file)
        pb._CACHE["grammar_mtime"] = None
        pb._CACHE["grammar"] = None

        prompt = pb.build_system_prompt(include_grammar=True)

        assert "GRAMMAR BLOCK" in prompt

    def test_grammar_block_absent_when_include_grammar_false(self, tmp_path, monkeypatch):
        import app.prompts.prompt_builder as pb

        grammar_file = tmp_path / "grammar_instruction.md"
        grammar_file.write_text("GRAMMAR BLOCK", encoding="utf-8")
        monkeypatch.setattr(pb, "_GRAMMAR_INSTRUCTION_PATH", grammar_file)
        pb._CACHE["grammar_mtime"] = None
        pb._CACHE["grammar"] = None

        prompt = pb.build_system_prompt(include_grammar=False)

        assert "GRAMMAR BLOCK" not in prompt
