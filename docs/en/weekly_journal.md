# Weekly Journal — English Speaking Agent

## Week 1 (23/04/2026 – 28/04/2026)

### Objectives
- Build initial infrastructure: CI/CD pipeline, K8s manifests, Docker build.
- Integrate Azure Cognitive Services for pronunciation assessment functionality.
- Scaffold basic frontend (React + TypeScript).
- Establish the Guardrails system (input / output filters).

### Key Achievements
- Implemented GitLab CI/CD pipeline (test → build → deploy) using Kaniko and kubectl on GKE.
- Added K8s manifests for backend, frontend, MinIO, GKE Ingress, and GCP Managed Certificate.
- Completed `AzureAssessmentService` — syllable/phoneme level pronunciation scoring via Azure Speech SDK.
- Integrated `/api/pronunciation/assess` endpoint into the FastAPI backend.
- Scaffolded frontend with layout for Voice Agent, Dashboard, and Login/Register.
- Completed input guardrails: `InputValidator`, `InjectionDetector`, `TopicFilter`, `RateLimiter` (Redis, 10 req/min).
- Completed output guardrails: `ContentFilter`, `FormatValidator`, `OutputGuardrails`.
- Added `HITLRouter` and HITL review API (`/api/admin/hitl`) with admin key auth.
- Added `AuditLogger` (structured JSON + optional database logging).
- Connected voice gender selector with ElevenLabs TTS (Hữu Huấn).

### Challenges & Resolutions
- **CI/CD triggered on wrong branch**: Fixed `.gitlab-ci.yml` to trigger correctly on the `main` branch.
- **Azure resource leaks**: Ensured that the `recognizer` and `speech_config` are properly cleaned up after each recognition to avoid memory leaks.
- **Complex Guardrails**: Broke them down into independent modules and wrote TDD tests for each component.

---

## Week 2 (28/04/2026 – 04/05/2026)

### Objectives
- Complete the Grammar Assessment feature and integrate it into the LLM pipeline.
- Build the Topic/Category system (10 categories × 64 topics) for conversational topic selection.
- Add Flashcard feature (decks, cards, spaced repetition SM-2).
- Improve frontend: conversation sidebar, session history, gamification.

### Key Achievements
- Integrated the grammar assessment pipeline: `grammar_parser`, `grammar_feedback` table, API endpoint `GET /api/grammar/{message_id}`.
- Grammar summary is returned inline in `ChatResponse`.
- Redesigned database schema: added `categories`, `triggers`, `CHECK constraints`, and indexes for soft-delete.
- Seeded 10 categories and 64 topics with stable UUIDs.
- Created `/api/topics/categories` endpoint returning hierarchical topic list.
- Completed Flashcard module: DB schema (decks, cards, media, reviews), SM-2 algorithm, full REST API, and LangGraph agent tools.
- Frontend: hierarchical `ConversationSidebar` by topic, server-side history loading, TanStack Query + IndexedDB caching.
- Gamification: badges, streak computation, `ScoreTrendChart`, `BadgesCard` (Quyết).
- Soft-delete conversations, session limit of 5 per topic, and auto-generated session titles.

### Challenges & Resolutions
- **Grammar JSON parsing from LLM**: The LLM occasionally returned invalid formats → used XML-tag markers instead of pure JSON to parse more safely.
- **Merge conflicts between branches**: The team utilized a clear merge workflow with explicit branch naming (TheAnh, Quyet, HuuHuan) and manually resolved conflicts file-by-file.
- **Flashcard tool LLM hallucination**: LLM passed a string `ielts_deck` instead of the actual UUID → added `_is_valid_uuid()` validator and enabled `ToolNode(handle_tool_errors=True)`.

---

## Week 3 (04/05/2026 – 11/05/2026)

### Objectives
- Build the Observability system (logs, metrics, tracing).
- Finalize Voice Recorder with waveform visualization.
- Optimize LLM: reduce the number of API calls, reduce latency.
- Add Reasoning Steps UI to display the agent's reasoning steps.

### Key Achievements
- **VEK Stack** (Vector + Elasticsearch + Kibana) integrated into docker-compose: log routing by category (audit/app), ILM, index templates, and data views.
- **Prometheus + Grafana**: metrics endpoint `/metrics`, `llm_ttft_seconds` histogram, and LangGraph pipeline dashboard.
- **Telemetry module**: structured tracing via `contextvars`, UUID masking filter, `LoggingMiddleware`, and component loggers.
- **Vector DaemonSet** on K8s with RBAC, ConfigMap, and Elasticsearch sink.
- Complete Voice Recorder: `useVoiceRecorder` hook with state machine, AnalyserNode waveform (150 bars), silence trim + noise gate, WAV encoder, and click-to-seek playback.
- Changed grammar format to compact XML-tag (`<grammar>` block), reducing LLM calls to a single call → significantly reduced latency.
- Reasoning Steps: `ReasoningSteps` component, `ToolCallStep`, `extract_tool_steps` utility, and `framer-motion` animations.
- AI guardrail node: replaced `TopicFilter` and `InjectionDetector` with an LLM-based preflight classifier.
- `create_deck` flashcard tool; flashcard UI `FlashcardPage` with decks/cards/reviews/stats.
- Audio transcription endpoint; audio served via `/api/audio/{key}` proxy with cache headers.
- Server-side LLM history (cleared_at fence, soft-fence endpoint).
- Inline grammar in `ChatResponse` (eliminating the need for separate endpoint calls).

### Challenges & Resolutions
- **Vector on K8s**: ES cert SANs did not include the public IP → disabled TLS verification. ES private AWS IP was unreachable from GKE → routed via public IP.
- **Vector data_dir persistence**: No persistence → caused duplicate indexing after container restarts → added volume mount.
- **LLM tool_use_failed crashes**: Caught errors in `ToolNode`, falling back to plain client when tool capacities are exceeded.

---

## Week 4 (11/05/2026 – 15/05/2026)

### Objectives
- Deploy OAuth login (Google, Microsoft, Facebook).
- Add password reset feature via email.
- Upgrade prompt system: consolidate, ConfigMap-managed, and context-aware coaching model.
- Improve deployment: dynamic nginx backend host, production env config.
- Add voice accent selector (US/UK).

### Key Achievements
- **OAuth**: `oauth_accounts` table, login/callback endpoints, `build_auth_url`, `exchange_code_for_identity`, `find_or_create_user`, frontend `OAuthButtons` and `OAuthCallbackPage`.
- **Password Reset**: `password_reset_tokens` table, Resend API email delivery, 5-minute token expiry, frontend forgot/reset password flows.
- **Voice Accent**: US/UK toggle with SVG flag icons, `voice_accent` field integrated throughout the pipeline (state → tts_node → API → UI).
- **Prompt consolidation**: Consolidated 4 prompt files into 1 `system_prompt.md` with section-based parsing, utilizing 1 ConfigMap instead of 4.
- **Context-aware coaching model**: Tiered system prompt (4 tiers: crisis, jailbreak, minimal input, context-aware coaching), verified with 31 structural tests.
- **Preflight classifier**: Replaced the original guardrails with an LLM-based preflight (SAFE/UNSAFE/NEEDS_TOOL), passing conversation history to accurately classify short or ambiguous inputs.
- Monitoring: Grafana and Vector configurations updated for K8s, added health check filtering.
- Frontend mobile-responsive layout with bottom navigation and drawer (Quyết).
- JWT fix: added a 60-second leeway for clock skew between containers.
- `user_id` injection via `RunnableConfig` (instead of system prompt) → cleaner LLM schema.

### Challenges & Resolutions
- **OAuth clock skew**: JWT decoding failed due to mismatched container clocks → added `leeway=60`.
- **Stale OAuth account links**: Resolved edge case where an email already existed but was linked to stale OAuth records.
- **Password reset email delivery**: Migrated from SMTP to Resend API to ensure high deliverability on production.
- **Contextual Preflight**: Short inputs like "ielts part 1" were misclassified when history was missing → passed the last 4 lines of conversation history to the preflight LLM.

---

## Week 5 (15/05/2026 – Present)

### Objectives
- Add "Next Speaking Suggestions" — suggest next things for the user to say.
- Migrate to Structured Output (Pydantic) for LLM responses to increase parsing reliability.

### Key Achievements
- **Next Speaking Suggestions**: `suggestions` prompt contract, parser (`<suggestions>` XML tag), DB schema, backend storage, API propagation, and frontend `MessageBubble` suggestion display.
- **Structured Output**: `AgentOutput` Pydantic models, `structured_client` (Groq JSON mode), `grammar_data_from_structured_output` adapter, and `use_structured_output` flag in `build_system_prompt`.
- Preflight response format updated with `scope` dimension.
- Fixed regex suggestions tag to support additional attributes.

### Challenges & Resolutions
- **Structured output reliability**: Groq JSON mode occasionally failed with complex nested schemas → fallback to XML-tag parsing for the grammar block.
- **Suggestions parsing**: The initial regex did not support attributes inside the XML tag → updated regex pattern.
