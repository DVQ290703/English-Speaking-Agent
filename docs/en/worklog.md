# Worklog — English Speaking Agent

## Project Overview

**English Speaking Agent** is a real-time AI-powered English speaking practice application. It features:
- **Voice Agent**: Receives audio input from the user and returns an audio response alongside grammar evaluations and next-turn speaking suggestions.
- **Flashcards**: A flashcard system implementing the SM-2 spaced repetition algorithm, fully integrated as an agent tool.
- **Dashboard**: Displays conversation logs, pronunciation scores, and gamification elements (badges, streaks).

**Project Timeline:** 23/04/2026 – 16/05/2026

**Team Members:**
- Do The Anh (abcdefya) — Backend, CI/CD, DevOps, LLM pipeline
- Quyết (DVQ290703) — Frontend, Voice Agent UI, Gamification
- Hữu Huấn (a40405) — Prompts, Backend

---

## Technologies Used

### Backend
| Technology | Purpose |
|---|---|
| Python 3.12 | Primary language for the backend |
| FastAPI | REST API web framework |
| Pydantic v2 | Schema validation, structured LLM output |
| LangGraph | Stateful agent pipeline (respond → tool → guardrail) |
| Groq | LLM inference (Llama), STT (Whisper) |
| ElevenLabs | Text-to-Speech (TTS) with voice gender and US/UK accent toggles |
| Azure Cognitive Services | Pronunciation assessment (phoneme/syllable scoring) |
| PostgreSQL | Primary database (users, conversations, messages, grammar, flashcards, pronunciation scores) |
| Redis | Rate limiting (10 req/min/user), session caching |
| MinIO | S3-compatible object storage for audio files |

### Frontend
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool and dev server |
| TailwindCSS + Typography | Styling, modern clean layout, and beautiful Markdown rendering |
| framer-motion | Animations (ReasoningSteps timeline, smooth transitions) |
| TanStack Query | Server state management, data fetching, and caching |
| React Router DOM | Smooth routing for the Single Page Application (SPA) |
| Recharts | Dynamic charts visualizing pronunciation scores and speaking trends |
| TanStack Virtual | List virtualization to optimize long conversational chat histories |
| Web Audio API | Audio recorder, waveform visualizer, and VAD support |
| LocalStorage | Client-side caching of Dark Mode theme, language context (i18n), and card study preferences |

### DevOps & Infrastructure
| Technology | Purpose |
|---|---|
| Docker + Docker Compose | Local development environment |
| Kubernetes (GKE) | Production deployment |
| GitLab CI/CD | Pipeline: test → build (Kaniko) → deploy (kubectl) |
| GitHub Actions | Branch synchronization and workflow automation |
| Nginx | Frontend serving, API reverse proxy |
| Harbor Registry | Private registry for Docker images |

### Observability
| Technology | Purpose |
|---|---|
| Vector | Log aggregation and routing (DaemonSet on K8s) |
| Elasticsearch | Log storage with ILM and data streams |
| Kibana | Log visualization and analysis |
| Prometheus | Metrics collection (`llm_ttft_seconds`, request counters) |
| Grafana | Metrics dashboards (Voice Agent pipeline monitoring) |
| Rancher | Kubernetes cluster management |

---

## Frameworks & Libraries Used

### Python
- `fastapi` — REST API, middleware, and routing
- `pydantic` — Schema validation and Structured Output models (`AgentOutput`)
- `langgraph` — Agent graph (nodes: preflight → respond → tool → tts), `ToolNode`, and `AgentState`
- `groq` — LLM (chat completion, structured output) and STT (transcription)
- `elevenlabs` — TTS streaming
- `azure-cognitiveservices-speech` — Pronunciation assessment SDK
- `psycopg2` — PostgreSQL adapter
- `redis` — Rate limiter client
- `minio` — MinIO client (presigned URLs, object streaming)
- `prometheus-client` + `prometheus-fastapi-instrumentator` — Observability metrics
- `python-jose` — JWT generation and decoding
- `passlib` — Password hashing (bcrypt)
- `resend` — Transactional email delivery (password reset)
- `pytest` + `pytest-asyncio` + `fakeredis` — Test suite

### JavaScript / TypeScript
- `react` + `react-dom` — UI rendering
- `typescript` — Type safety
- `vite` — Build tool & HMR
- `tailwindcss` + `@tailwindcss/typography` — Utility-first styling & Markdown support
- `framer-motion` — UI animations
- `@tanstack/react-query` — Data fetching and cache invalidation
- `@radix-ui/react-...` — Headless accessible UI primitives (Dialog, Switch, Dropdown, etc.)
- `react-router-dom` — Client-side SPA routing
- `recharts` — Progress charts & trends
- `@tanstack/react-virtual` — List virtualization for optimized scrolling
- `i18next` + `react-i18next` — Internationalization (EN/VI toggles)

---

## Work Overview by Module

### 1. CI/CD & DevOps
- GitLab CI pipeline: test → Kaniko build → kubectl deploy on GKE
- Harbor registry: Docker images storage
- GitHub Actions: branch synchronization, multi-workflow triggers
- K8s manifests: backend, frontend, MinIO, Redis, Prometheus, Grafana, Vector DaemonSet, Ingress
- Docker Compose: full local stack with PostgreSQL, Redis, MinIO, VEK stack (Vector + Elasticsearch + Kibana), Prometheus, and Grafana
- Nginx: frontend serving, API reverse proxy, and dynamic backend host configuration

### 2. Authentication & Security
- JWT-based auth (login, register, token refresh)
- OAuth 2.0: Google, Microsoft, Facebook (authorization code flow + state verification)
- Password reset: Resend API, 5-minute token expiry, `password_reset_tokens` table
- Input guardrails: length validation, injection detection, topic filtering, Redis-based rate limiting
- Output guardrails: content filtering (toxicity/PII), format validator (URL stripping)
- HITL (Human-in-the-Loop) queue and admin review API

### 3. LLM Pipeline (LangGraph)
- `VoiceAgentPipeline`: graph nodes — preflight → respond → tool (conditional) → tts
- **Preflight classifier**: LLM-based classification (SAFE / UNSAFE / NEEDS_TOOL / SCOPE) with conversation history context
- **Respond node**: single LLM call with grammar + suggestions embedded (XML-tag format)
- **Structured output**: Pydantic `AgentOutput` model, `structured_client` (Groq JSON mode)
- **ToolNode**: 7 flashcard tools with LangGraph tool loop (capped at 3 iterations), `handle_tool_errors=True`
- `AgentState`: messages, grammar_raw, suggestions, tool_intent, voice_accent, guardrail_blocked
- `RunnableConfig` injection: injects `user_id` via config instead of system prompt

### 4. Grammar Assessment
- Compact XML-tag format: `<grammar>...</grammar>` block inline in LLM responses
- `split_combined_output` and `parse_annotated_grammar`: splits response text and grammar block
- `grammar_feedback` table: stores per-turn grammar data
- API: `GET /api/grammar/{message_id}` returns full grammar details; `ChatResponse` includes `grammar_detail` inline

### 5. Pronunciation Assessment
- `AzureAssessmentService`: syllable/phoneme level scoring via Azure Speech SDK
- Results stored in DB with `user_id`, `message_id`, and detailed metrics
- API: `POST /api/pronunciation/assess`

### 6. Flashcards
- DB schema: `decks`, `cards`, `media_files`, `card_reviews`
- SM-2 spaced repetition algorithm implementation
- 7 LangGraph agent tools: `create_deck`, `list_decks`, `create_card`, `search_cards`, `get_due_cards`, `update_card`, `submit_card_review`
- Full REST API supporting multipart media uploads
- MinIO presigned URLs for media hosting

### 7. Topics & Conversations
- 10 categories × 64 topics with stable UUIDs
- Conversation soft-delete, 5-session limit per topic, session naming
- API: `GET /api/topics/categories`, `GET /conversations/for-topic`, `DELETE /conversations/{id}`
- Frontend: hierarchical `ConversationSidebar`, auto-resumes latest session

### 8. Next Speaking Suggestions
- `<suggestions>` XML-tag in LLM response
- Parser, DB schema (`suggestions` column on messages), API propagation
- Frontend: `MessageBubble` displays clickable suggestions

### 9. Prompt Management
- Consolidated 4 prompt files into 1 `system_prompt.md` with section-based parsing
- Tiered behavioral decision model (4 tiers: crisis, jailbreak, minimal input, context-aware coaching)
- K8s ConfigMap: 1 file instead of 4 volume mounts
- `build_system_prompt()`: `include_grammar`, `use_structured_output` flags

### 10. Voice Recorder & Audio
- `useVoiceRecorder` hook: state machine (idle → recording → review → sending)
- AnalyserNode waveform: 150 bars, real-time amplitude, playback fill + click-to-seek
- Audio post-processing: silence trim, noise gate, WAV encoding (`trimGateEncode`)
- `/api/chat/transcribe`: STT endpoint (Groq Whisper)
- `/api/audio/{key}`: audio proxy with cache headers (1h) and MinIO streaming

### 11. Voice Accent
- US/UK accent selector with SVG flag icons in Audio Settings
- `voice_accent` field propagated through the entire pipeline: `AgentState` → `tts_node` → `_synthesize_audio_bytes` → `/chat/respond`

### 12. Observability
- **Telemetry**: `contextvars`-based span context (trace_id, session_id, msg_id)
- **Logging**: `get_logger` factory, `LoggingMiddleware` (request/response), UUID masking filter, Python file logger
- **VEK**: Vector parses log prefixes → Elasticsearch data streams by category, visualized via Kibana
- **Prometheus**: `llm_ttft_seconds` histogram, `prometheus-fastapi-instrumentator` integration, `/metrics` endpoint
- **Grafana**: provisioned dashboard for the Voice Agent pipeline
- **Rancher**: Kubernetes cluster management

### 13. Frontend (UI)
- Voice Agent: chat interface, audio playback, grammar feedback panel, and reasoning steps timeline
- Dashboard: score trend chart, badges, streak counter, session history, and topic category selector
- Flashcard UI: deck list, card study sessions, and review interfaces
- Auth: Login, Register, OAuth buttons, OAuthCallbackPage, forgot/reset password flows
- i18n: EN/VI translations, `LanguageContext`, and `LanguageToggle`
- Dark mode: `useDarkMode` hook and Tailwind dark variants
- Mobile responsiveness: bottom navigation and drawer (PR from Quyết)
- VAD (Voice Activity Detection): AudioWorklet, quality gating, and backend-fallback STT
