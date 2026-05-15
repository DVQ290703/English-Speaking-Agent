import os
import pytest

os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")

from pydantic import ValidationError


class TestGrammarErrorOutput:
    def test_valid_error(self):
        from app.agents.output_models import GrammarErrorOutput
        e = GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")
        assert e.cat == "vt"
        assert e.sev == 2
        assert e.eg is None

    def test_sev_below_range_raises(self):
        from app.agents.output_models import GrammarErrorOutput
        with pytest.raises(ValidationError):
            GrammarErrorOutput(cat="vt", sev=0, msg="x")

    def test_sev_above_range_raises(self):
        from app.agents.output_models import GrammarErrorOutput
        with pytest.raises(ValidationError):
            GrammarErrorOutput(cat="vt", sev=4, msg="x")

    def test_eg_field_optional(self):
        from app.agents.output_models import GrammarErrorOutput
        e = GrammarErrorOutput(cat="art", sev=1, msg="Missing article.", eg="Use 'the' here.")
        assert e.eg == "Use 'the' here."


class TestGrammarOutput:
    def test_valid_grammar(self):
        from app.agents.output_models import GrammarOutput, GrammarErrorOutput
        g = GrammarOutput(
            ann="I {go->went} to school.",
            err=[GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")],
            score=85,
        )
        assert g.score == 85
        assert len(g.err) == 1

    def test_score_below_range_raises(self):
        from app.agents.output_models import GrammarOutput
        with pytest.raises(ValidationError):
            GrammarOutput(ann="x", err=[], score=-1)

    def test_score_above_range_raises(self):
        from app.agents.output_models import GrammarOutput
        with pytest.raises(ValidationError):
            GrammarOutput(ann="x", err=[], score=101)

    def test_empty_errors_valid(self):
        from app.agents.output_models import GrammarOutput
        g = GrammarOutput(ann="Good sentence.", err=[], score=100)
        assert g.err == []


class TestAgentOutput:
    def test_minimal_valid(self):
        from app.agents.output_models import AgentOutput
        out = AgentOutput(response_text="Great job!")
        assert out.response_text == "Great job!"
        assert out.grammar is None
        assert out.suggestions == []

    def test_grammar_none_is_explicit(self):
        from app.agents.output_models import AgentOutput
        out = AgentOutput(response_text="Good.", grammar=None)
        assert out.grammar is None

    def test_suggestions_list(self):
        from app.agents.output_models import AgentOutput
        out = AgentOutput(
            response_text="Good.",
            suggestions=["Try this.", "Or this.", "Or that."],
        )
        assert len(out.suggestions) == 3

    def test_full_model(self):
        from app.agents.output_models import AgentOutput, GrammarOutput, GrammarErrorOutput
        out = AgentOutput(
            response_text="Nice try!",
            grammar=GrammarOutput(
                ann="I {go->went} to school.",
                err=[GrammarErrorOutput(cat="vt", sev=2, msg="Past tense required.")],
                score=85,
            ),
            suggestions=["I went to school yesterday.", "What did you study?", "I enjoyed school."],
        )
        assert out.grammar.score == 85
        assert out.grammar.err[0].cat == "vt"
