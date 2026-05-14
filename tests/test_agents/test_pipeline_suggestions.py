import os
import sys
import types
from unittest.mock import MagicMock

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password-strong-2026")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

_lc_groq = types.ModuleType("langchain_groq")
_lc_groq.ChatGroq = MagicMock  # type: ignore[attr-defined]
sys.modules.setdefault("langchain_groq", _lc_groq)


def test_pipeline_parses_suggestions_from_final_llm_response():
    from langchain_core.messages import AIMessage
    from app.agents.output_models import AgentOutput, GrammarOutput
    from app.agents.pipeline import VoiceAgentPipeline

    llm_mock = MagicMock()
    llm_mock.model_name = "test-model"
    # preflight via client.invoke
    llm_mock.client.invoke.return_value = AIMessage(content="SAFETY: SAFE\nTOOL: NO_TOOL")
    # respond node uses structured_client.invoke on non-tool path
    llm_mock.structured_client.invoke.return_value = AgentOutput(
        response_text="Nice answer.",
        grammar=GrammarOutput(ann="I like hiking.", err=[], score=100),
        suggestions=[
            "I usually hike on weekends.",
            "What trails do you recommend?",
            "In my experience, hiking helps me clear my head.",
        ],
    )
    llm_mock.tool_client.invoke.side_effect = AssertionError("tool client should not be used")

    tts_mock = MagicMock()
    tts_mock.convert_text_to_speech.return_value = b"audio"

    pipeline = VoiceAgentPipeline(llm_service=llm_mock, tts_service=tts_mock)
    result = pipeline.run(user_input="I like hiking.")

    assert result["response_text"] == "Nice answer."
    assert result["grammar_raw"] == '{"ann":"I like hiking.","err":[],"score":100}'
    assert result["suggestions"] == [
        "I usually hike on weekends.",
        "What trails do you recommend?",
        "In my experience, hiking helps me clear my head.",
    ]
    tts_mock.convert_text_to_speech.assert_called_once_with(
        "Nice answer.",
        voice_gender=None,
        voice_accent=None,
    )
