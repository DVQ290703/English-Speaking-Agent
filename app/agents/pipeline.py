import json

from groq import BadRequestError, RateLimitError
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from app.agents.tools.flashcard_tools import FLASHCARD_TOOLS
from app.core.logger import logger
from app.core.telemetry import span_context
from app.core.settings import TOOL_CALL_CAP as _TOOL_CALL_CAP
from app.prompts.prompt_builder import load_blocked_response, load_preflight_prompt
from app.services.elevenlabs_tts import ElevenLabsTTS
from app.services.groq_llm import GroqLLMService
from app.agents.state import AgentState

def _sanitize_tool_messages(messages: list) -> list:
    """Ensure all ToolMessages have non-empty string content.

    Groq rejects requests where a tool-role message has content that is either
    None, an empty string, or an empty list.  LangGraph's ToolNode may produce
    ToolMessage(content=[]) when a tool returns an empty Python list, which
    triggers a 400 Bad Request from Groq.
    """
    result = []
    for msg in messages:
        if isinstance(msg, ToolMessage):
            content = msg.content
            if not content:  # None, "", or []
                content = "[]"
            elif not isinstance(content, str):
                content = json.dumps(content)
            if content is not msg.content:
                msg = ToolMessage(content=content, tool_call_id=msg.tool_call_id, name=msg.name)
        result.append(msg)
    return result


def _route_after_preflight(state: AgentState) -> str:
    if state.get("guardrail_blocked"):
        logger.info("route_after_preflight decision=blocked")
        return "end"
    logger.debug("route_after_preflight decision=respond")
    return "respond"


def _route_after_respond(state: AgentState) -> str:
    last = state["messages"][-1] if state.get("messages") else None
    if last and getattr(last, "tool_calls", None):
        iterations = state.get("_tool_call_iterations", 0)
        if iterations >= _TOOL_CALL_CAP:
            # Loop back to respond WITHOUT going through tools — _respond_node
            # will detect the cap and invoke the plain client (no tools bound)
            # to force a text reply instead of silently routing to TTS with
            # an empty response_text.
            logger.warning(
                "respond_node tool_call_loop_cap_reached iterations=%d — forcing final plain response",
                _TOOL_CALL_CAP,
            )
            return "respond"
        logger.debug("route_after_respond decision=tools iterations=%d", iterations)
        return "tools"
    if state.get("_tool_call_iterations", 0) > 0:
        logger.debug("route_after_respond decision=end tool_used=True skipping_tts")
        return "end"
    logger.debug("route_after_respond decision=tts no_tool_calls=True")
    return "tts"


class VoiceAgentPipeline:
    """Coordinate the LLM and text-to-speech steps for one voice chat turn."""

    def __init__(self, llm_service: GroqLLMService, tts_service: ElevenLabsTTS):
        self.llm_service = llm_service
        self.tts_service = tts_service
        self.app = self._build_graph()

    def _preflight_node(self, state: AgentState) -> AgentState:
        """Single LLM call that classifies safety AND tool intent together.

        Replaces the former separate guardrail + intent-classifier calls,
        keeping per-turn LLM calls at 2 (preflight + respond) instead of 3.

        Failure modes:
        - Safety fails OPEN  → treat as SAFE so legitimate messages are never blocked.
        - Tool fails CLOSED  → treat as NO_TOOL so spurious tool calls are suppressed.
        """
        user_input = state["user_input"]
        logger.debug("preflight_node start input_length=%d", len(user_input))

        blocked = False
        tool_intent = False
        try:
            messages: list = [SystemMessage(content=load_preflight_prompt())]
            for line in state.get("history", [])[-4:]:
                if line.startswith("User:"):
                    messages.append(HumanMessage(content=line[5:].strip()))
                elif line.startswith("Assistant:"):
                    messages.append(AIMessage(content=line[10:].strip()))
            messages.append(HumanMessage(content=user_input))
            result: AIMessage = self.llm_service.client.invoke(messages)
            lines: dict[str, str] = {}
            for raw_line in (result.content or "").strip().splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                if ":" in line:
                    key, value = line.split(":", 1)
                    normalized_key = key.strip().upper()
                    normalized_value = value.strip().upper()
                    if normalized_key in {"SAFE", "UNSAFE"}:
                        lines["SAFETY"] = normalized_key
                    else:
                        lines[normalized_key] = normalized_value
                elif line.upper().startswith(("SAFE", "UNSAFE")):
                    lines["SAFETY"] = line.upper()
            blocked = lines.get("SAFETY", "SAFE").startswith("UNSAFE")
            tool_intent = lines.get("TOOL", "NO_TOOL").startswith("NEEDS_TOOL")
            logger.debug("preflight_node safety=%s tool=%s", lines.get("SAFETY"), lines.get("TOOL"))
        except Exception as exc:
            logger.warning("preflight_node llm_error — failing open/closed: %s", exc)

        if blocked:
            logger.info("preflight_node blocked input_length=%d", len(user_input))
            return {
                **state,
                "guardrail_blocked": True,
                "tool_intent": False,
                "response_text": load_blocked_response(),
                "audio_bytes": b"",
                "suggestions": [],
            }

        logger.debug("preflight_node safe tool_intent=%s", tool_intent)
        return {**state, "guardrail_blocked": False, "tool_intent": tool_intent}

    def _respond_node(self, state: AgentState) -> AgentState:
        """Generate the assistant response, invoking tools if the LLM requests them."""
        iterations = state.get("_tool_call_iterations", 3)
        logger.debug("respond_node start input_length=%d tool_iterations=%d", len(state["user_input"]), iterations)

        from app.prompts.prompt_builder import build_system_prompt
        from app.services.groq_llm import SYSTEM_PROMPT

        # Compute routing flags before building prompt so we know which mode to use
        cap_reached = iterations >= _TOOL_CALL_CAP
        intent_requires_tool = state.get("tool_intent", False) or iterations > 0
        use_tools = not cap_reached and bool(state.get("user_id")) and intent_requires_tool

        dynamic_prompt = build_system_prompt(
            category=state.get("category"),
            topic=state.get("topic"),
            include_grammar=True,
            use_structured_output=not use_tools,
        )
        if dynamic_prompt:
            logger.info("respond_node system_prompt=dynamic chars=%d", len(dynamic_prompt))
            base_prompt = dynamic_prompt
        else:
            logger.info("respond_node system_prompt=fallback SYSTEM_PROMPT (build_system_prompt returned empty)")
            base_prompt = SYSTEM_PROMPT
        if state.get("tool_intent") and not iterations:
            base_prompt += (
                "\n\n[TOOL CONTEXT] The user's current message continues an ongoing flashcard "
                "workflow. Use the conversation history to determine the correct flashcard tool "
                "and arguments — do not ask for clarification, infer from context and call the tool now."
            )

        messages_to_send: list = [SystemMessage(content=base_prompt)]

        for line in state.get("history", [])[-8:]:
            if line.startswith("User:"):
                messages_to_send.append(HumanMessage(content=line[5:].strip()))
            elif line.startswith("Assistant:"):
                messages_to_send.append(AIMessage(content=line[10:].strip()))

        messages_to_send.append(HumanMessage(content=state["user_input"]))

        if state.get("messages"):
            messages_to_send.extend(_sanitize_tool_messages(state["messages"]))

        if state.get("user_id") and not intent_requires_tool:
            logger.debug("respond_node tool_gated_off preflight=NO_TOOL")
        logger.debug(
            "respond_node invoking_llm client=%s messages=%d cap_reached=%s intent_requires_tool=%s",
            "tool_client" if use_tools else "structured",
            len(messages_to_send),
            cap_reached,
            intent_requires_tool,
        )

        raw_output: str | None = None
        response_text: str = ""
        grammar_raw: str | None = None
        suggestions: list[str] = []

        if use_tools:
            with span_context("llm.respond", kind="llm") as span:
                try:
                    ai_msg: AIMessage = self.llm_service.tool_client.invoke(messages_to_send)
                except RateLimitError as exc:
                    span.fail(str(exc))
                    logger.warning("respond_node rate_limited iteration=%d: %s", iterations, exc)
                    return {
                        **state,
                        "response_text": "I'm a bit overwhelmed right now. Please try again in a moment.",
                        "messages": [],
                        "_tool_call_iterations": iterations,
                        "grammar_raw": None,
                        "suggestions": [],
                    }
                except BadRequestError as exc:
                    span.fail(str(exc))
                    logger.warning(
                        "respond_node tool_use_failed — model emitted malformed tool call, retrying with plain client: %s",
                        exc,
                    )
                    ai_msg = self.llm_service.client.invoke(messages_to_send)
                usage = getattr(ai_msg, "usage_metadata", {}) or {}
                span.set(
                    model=self.llm_service.model_name,
                    prompt_tokens=usage.get("input_tokens", 0),
                    completion_tokens=usage.get("output_tokens", 0),
                    total_tokens=usage.get("total_tokens", 0),
                )

            logger.debug(
                "respond_node llm_response has_tool_calls=%s content_length=%d",
                bool(ai_msg.tool_calls),
                len(ai_msg.content or ""),
            )

            if ai_msg.tool_calls:
                tool_names = [tc["name"] for tc in ai_msg.tool_calls]
                tool_args = [{tc["name"]: tc.get("args", {})} for tc in ai_msg.tool_calls]
                logger.info(
                    "respond_node tool_calls_detected count=%d tools=%s args=%s iteration=%d",
                    len(ai_msg.tool_calls),
                    tool_names,
                    tool_args,
                    iterations + 1,
                )
                return {
                    **state,
                    "messages": [ai_msg],
                    "_tool_call_iterations": iterations + 1,
                    "response_text": state.get("response_text", ""),
                }

            # LLM chose not to use a tool — XML parse fallback
            from app.services.grammar_parser import split_combined_output_with_suggestions
            raw_output = ai_msg.content or ""
            response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(raw_output)

        else:
            # Structured output path — AgentOutput returned directly, never has .tool_calls
            from app.agents.output_models import AgentOutput
            from app.services.grammar_parser import grammar_data_from_structured_output

            with span_context("llm.respond", kind="llm") as span:
                try:
                    agent_out: AgentOutput = self.llm_service.structured_client.invoke(messages_to_send)
                    span.set(model=self.llm_service.model_name)
                except RateLimitError as exc:
                    span.fail(str(exc))
                    logger.warning("respond_node rate_limited iteration=%d: %s", iterations, exc)
                    return {
                        **state,
                        "response_text": "I'm a bit overwhelmed right now. Please try again in a moment.",
                        "messages": [],
                        "_tool_call_iterations": iterations,
                        "grammar_raw": None,
                        "suggestions": [],
                    }
                except Exception as exc:
                    span.fail(str(exc))
                    logger.warning(
                        "respond_node structured_output_failed — falling back to XML parse: %s", exc
                    )
                    from app.services.grammar_parser import split_combined_output_with_suggestions
                    # Rebuild messages with XML-formatted prompt so the model returns
                    # grammar/suggestions even on the fallback path.
                    fallback_prompt = build_system_prompt(
                        category=state.get("category"),
                        topic=state.get("topic"),
                        include_grammar=True,
                        use_structured_output=False,
                    ) or base_prompt
                    fallback_messages = [SystemMessage(content=fallback_prompt)] + messages_to_send[1:]
                    try:
                        fallback_msg: AIMessage = self.llm_service.client.invoke(fallback_messages)
                        raw_output = fallback_msg.content or ""
                    except Exception as fallback_exc:
                        logger.error("respond_node fallback_also_failed: %s", fallback_exc)
                        raw_output = ""
                    response_text, grammar_raw, suggestions = split_combined_output_with_suggestions(
                        raw_output
                    )
                else:
                    response_text = agent_out.response_text
                    _, grammar_raw = grammar_data_from_structured_output(
                        agent_out.grammar, state["user_input"]
                    )
                    suggestions = agent_out.suggestions[:3]

            logger.debug(
                "respond_node structured_response response_preview=%r grammar_present=%s",
                response_text[:120] if response_text else "",
                grammar_raw is not None,
            )

        history = state.get("history", []) + [
            f"User: {state['user_input']}",
            f"Assistant: {response_text}",
        ]
        return {
            **state,
            "response_text": response_text,
            "raw_output": raw_output,
            "history": history,
            "grammar_raw": grammar_raw,
            "suggestions": suggestions,
            "messages": [],
            "_tool_call_iterations": iterations,
        }

    def _tts_node(self, state: AgentState) -> AgentState:
        """Convert the generated reply into speech and store the raw bytes in state."""
        logger.debug("tts_node start text_length=%d", len(state["response_text"]))
        audio_bytes = self.tts_service.convert_text_to_speech(
            state["response_text"],
            voice_gender=state.get("voice_gender"),
            voice_accent=state.get("voice_accent"),
        )
        logger.debug("tts_node done audio_bytes=%d", len(audio_bytes))
        return {**state, "audio_bytes": audio_bytes}

    def _build_graph(self):
        tool_node = ToolNode(FLASHCARD_TOOLS, handle_tool_errors=True)
        graph = StateGraph(AgentState)
        graph.add_node("preflight", self._preflight_node)
        graph.add_node("respond", self._respond_node)
        graph.add_node("tools", tool_node)
        graph.add_node("tts", self._tts_node)
        graph.set_entry_point("preflight")
        graph.add_conditional_edges("preflight", _route_after_preflight, {"respond": "respond", "end": END})
        graph.add_conditional_edges("respond", _route_after_respond, {"tools": "tools", "tts": "tts", "respond": "respond", "end": END})
        graph.add_edge("tools", "respond")
        graph.add_edge("tts", END)
        logger.debug("pipeline graph built nodes=[preflight, respond, tools, tts]")
        return graph.compile()

    def run(
        self,
        user_input: str,
        history: list[str] | None = None,
        voice_gender: str | None = None,
        voice_accent: str | None = None,
        category: str | None = None,
        topic: str | None = None,
        user_id: str | None = None,
    ) -> AgentState:
        """Execute the pipeline for a single user message and return the final state."""
        initial_state: AgentState = {
            "user_input": user_input,
            "response_text": "",
            "audio_bytes": b"",
            "history": history or [],
            "voice_gender": voice_gender,
            "voice_accent": voice_accent,
            "grammar_raw": None,
            "suggestions": [],
            "category": category,
            "topic": topic,
            "user_id": user_id,
            "messages": [],
            "_tool_call_iterations": 0,
            "guardrail_blocked": False,
            "tool_intent": False,
        }
        invoke_config: dict = {}
        if user_id:
            invoke_config["configurable"] = {"user_id": user_id}
            invoke_config["metadata"] = {"user_id": user_id}
        return self.app.invoke(initial_state, config=invoke_config)
