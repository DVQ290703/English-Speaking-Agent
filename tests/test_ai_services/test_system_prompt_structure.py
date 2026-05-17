# tests/test_ai_services/test_system_prompt_structure.py
"""
Structural tests for app/prompts/system_prompt.md.
Reads the file directly — no LLM calls.
"""
import re
from pathlib import Path

import pytest

PROMPT_PATH = Path(__file__).parent.parent.parent / "app" / "prompts" / "system_prompt.md"


def _read_section(name: str) -> str:
    text = PROMPT_PATH.read_text(encoding="utf-8")
    m = re.search(
        rf"<!--\s*BEGIN:\s*{re.escape(name)}\s*-->(.*?)<!--\s*END:\s*{re.escape(name)}\s*-->",
        text,
        re.DOTALL,
    )
    assert m, f"Section '{name}' not found in system_prompt.md"
    return m.group(1)


def _tier3_section(sp: str) -> str:
    lower = sp.lower()
    idx = lower.find("tier 3")
    assert idx != -1, "Tier 3 section not found in system_prompt"
    return sp[idx:]


@pytest.fixture(scope="module")
def sp() -> str:
    return _read_section("system_prompt")


class TestPersonaAnchor:
    def test_identifies_as_english_speaking_coach(self, sp):
        assert "English-speaking coach" in sp or "English speaking coach" in sp

    def test_banned_phrase_absent_from_prompt(self, sp):
        assert "Let's keep going" not in sp

    def test_persona_explicitly_bans_lets_keep_going(self, sp):
        lower = sp.lower()
        assert "never" in lower
        assert "let's keep going" in lower or "lets keep going" in lower

    def test_persona_bans_lets_keep_practicing_variant(self, sp):
        lower = sp.lower()
        assert "let's keep practicing" in lower or "lets keep practicing" in lower or "any variant" in lower


class TestRefusalFormat:
    def test_refusal_format_section_present(self, sp):
        assert "Refusal Format" in sp

    def test_refusal_format_template_has_no_lets_keep_going(self, sp):
        m = re.search(r"Refusal Format.*?(<response>.*?</response>)", sp, re.DOTALL | re.IGNORECASE)
        assert m, "Refusal Format section must contain a <response> template block"
        assert "Let's keep going" not in m.group(1)

    def test_refusal_format_ends_with_coaching_invitation(self, sp):
        m = re.search(r"Refusal Format.*?(<response>.*?</response>)", sp, re.DOTALL | re.IGNORECASE)
        assert m, "Refusal Format section must contain a <response> template block"
        template = m.group(1)
        lower = template.lower()
        assert "coaching" in lower or "invitation" in lower or "redirect" in lower


class TestTier0Crisis:
    def test_tier_0_crisis_trigger_described(self, sp):
        lower = sp.lower()
        assert "crisis" in lower or "self-harm" in lower or "self harm" in lower

    def test_tier_0_empathy_only_rule(self, sp):
        lower = sp.lower()
        assert "empathy" in lower

    def test_tier_0_no_coaching_no_question(self, sp):
        lower = sp.lower()
        assert "no coaching" in lower or "no follow-up" in lower or "no follow up" in lower

    def test_tier_0_word_limit_is_100(self, sp):
        assert "100" in sp

    def test_tier_0_100_words_near_crisis_context(self, sp):
        idx_crisis = sp.lower().find("crisis")
        idx_100 = sp.find("100")
        assert idx_crisis != -1 and idx_100 != -1
        assert abs(idx_crisis - idx_100) < 600

    def test_tier_0_suggestions_are_supportive(self, sp):
        lower = sp.lower()
        assert "supportive" in lower or "support" in lower


class TestTier1Jailbreak:
    def test_tier_1_jailbreak_trigger_described(self, sp):
        lower = sp.lower()
        assert "jailbreak" in lower or "injection" in lower or "prompt injection" in lower

    def test_tier_1_silent_redirect_rule(self, sp):
        lower = sp.lower()
        assert "silent" in lower or "do not acknowledge" in lower or "no acknowledgment" in lower

    def test_tier_1_no_explanation_rule(self, sp):
        lower = sp.lower()
        assert "no apolog" in lower or "do not explain" in lower or "no explanation" in lower


class TestTier2MinimalInput:
    def test_tier_2_empty_minimal_trigger_described(self, sp):
        lower = sp.lower()
        assert "empty" in lower or "minimal" in lower or "blank" in lower

    def test_tier_2_warm_recovery_behavior(self, sp):
        lower = sp.lower()
        assert "warm" in lower or "recovery" in lower or "retry" in lower

    def test_tier_2_no_grammar_errors(self, sp):
        lower = sp.lower()
        assert "no grammar" in lower or "do not annotate" in lower or "no grammar error" in lower


class TestTier3ContextAwareCoaching:
    def test_tier_3_context_aware_label(self, sp):
        lower = sp.lower()
        assert "context-aware" in lower or "context aware" in lower or "tier 3" in lower

    def test_tier_3_one_error_rule(self, sp):
        tier3 = _tier3_section(sp)
        lower = tier3.lower()
        assert re.search(r"(one|1).{0,30}error", lower), "Tier 3 must state the one-error rule"

    def test_tier_3_one_follow_up_question_rule(self, sp):
        tier3 = _tier3_section(sp)
        lower = tier3.lower()
        assert re.search(r"(one|1).{0,30}(follow.up question|question)", lower), "Tier 3 must state the one-question rule"

    def test_tier_3_no_consecutive_same_start(self, sp):
        lower = sp.lower()
        assert "consecutive" in lower

    def test_tier_3_hard_rule_bans_lets_keep_going(self, sp):
        lower = sp.lower()
        # The phrase must be mentioned in a prohibition context (with "never" nearby)
        m = re.search(r"never.{0,100}let.s keep going", lower, re.DOTALL)
        assert m, "Tier 3 hard rules must explicitly ban 'Let's keep going' with 'never'"

    def test_tier_3_situation_table_has_emotional_distress(self, sp):
        lower = sp.lower()
        assert "emotional distress" in lower or "frustration" in lower or "shame" in lower

    def test_tier_3_situation_table_has_pronunciation(self, sp):
        lower = sp.lower()
        assert "pronunciation" in lower

    def test_tier_3_situation_table_has_roleplay(self, sp):
        lower = sp.lower()
        assert "roleplay" in lower or "role play" in lower or "role-play" in lower

    def test_tier_3_situation_table_has_pii(self, sp):
        lower = sp.lower()
        assert "pii" in lower or "sensitive data" in lower or "personal" in lower

    def test_tier_3_situation_table_has_self_correction(self, sp):
        lower = sp.lower()
        assert "self-correction" in lower or "self correction" in lower or "self-repair" in lower


class TestWordLimits:
    def test_75_word_limit_still_stated(self, sp):
        assert "75" in sp

    def test_100_word_exception_for_tier_0(self, sp):
        assert "100" in sp
        lower = sp.lower()
        assert "exception" in lower or "tier 0" in lower or "crisis" in lower
