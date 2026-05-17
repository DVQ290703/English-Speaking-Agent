# Worklog — English Speaking Agent

## Tổng quan dự án

**English Speaking Agent** là một ứng dụng AI hỗ trợ luyện nói tiếng Anh theo thời gian thực, bao gồm:
- Voice Agent: nhận audio từ người dùng, trả về phản hồi âm thanh với đánh giá ngữ pháp và gợi ý câu nói tiếp theo.
- Flashcard: hệ thống thẻ từ với thuật toán spaced repetition (SM-2), tích hợp agent tool.
- Dashboard: hiển thị lịch sử hội thoại, điểm phát âm, gamification (badges, streak).

**Thời gian thực hiện:** 23/04/2026 – 16/05/2026

**Thành viên:**
- Do The Anh (abcdefya) — Backend, CI/CD, DevOps, LLM pipeline
- Quyết (DVQ290703) — Frontend, Voice Agent UI, Gamification
- Hữu Huấn (a40405) — Prompts, Backend

---

## Công nghệ đã dùng

### Backend
| Công nghệ | Mục đích |
|---|---|
| Python 3.12 | Ngôn ngữ chính cho backend |
| FastAPI | Web framework REST API |
| Pydantic v2 | Schema validation, Structured LLM output |
| LangGraph | Stateful agent pipeline (respond → tool → guardrail) |
| Groq | LLM inference (Llama), STT (Whisper) |
| ElevenLabs | Text-to-Speech (TTS) với voice gender và US/UK accent |
| Azure Cognitive Services | Pronunciation assessment (phoneme/syllable scoring) |
| PostgreSQL | Database chính (users, conversations, messages, grammar, flashcard, pronunciations) |
| Redis | Rate limiting (10 req/min/user), session caching |
| MinIO | Object storage (S3-compatible) cho audio files |

### Frontend
| Công nghệ | Mục đích |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool và dev server |
| TailwindCSS + Typography | Styling, giao diện hiện đại và hiển thị Markdown đẹp mắt |
| framer-motion | Animations (ReasoningSteps, transitions sinh động) |
| TanStack Query | Quản lý server state, fetching, caching dữ liệu |
| React Router DOM | Định tuyến mượt mà cho ứng dụng Single Page Application (SPA) |
| Recharts | Biểu đồ trực quan hóa xu hướng điểm phát âm và thống kê nói |
| TanStack Virtual | Tối ưu hóa render (virtualization) cho lịch sử chat cực dài |
| Web Audio API | Xử lý ghi âm, vẽ waveform trực quan hóa âm thanh, VAD |
| LocalStorage | Lưu trữ cấu hình giao diện Dark Mode, đa ngôn ngữ i18n, cài đặt học từ |

### DevOps & Infrastructure
| Công nghệ | Mục đích |
|---|---|
| Docker + Docker Compose | Local development environment |
| Kubernetes (GKE) | Production deployment |
| GitLab CI/CD | Pipeline test → build (Kaniko) → deploy (kubectl) |
| GitHub Actions | Branch sync, workflow automation |
| Nginx | Frontend serving, API reverse proxy |
| Harbor Registry | Docker Images storage |


### Observability
| Công nghệ | Mục đích |
|---|---|
| Vector | Log aggregation và routing (DaemonSet trên K8s) |
| Elasticsearch | Log storage với ILM và data streams |
| Kibana | Log visualization |
| Prometheus | Metrics collection (`llm_ttft_seconds`, request counters) |
| Grafana | Metrics dashboards (Voice Agent pipeline) |
| Rancher | Cluster management |


---

## Framework / Library sử dụng

### Python
- `fastapi` — REST API, middleware, routing
- `pydantic` — Schema validation, Structured Output models (`AgentOutput`)
- `langgraph` — Agent graph (nodes: preflight → respond → tool → tts), `ToolNode`, `AgentState`
- `groq` — LLM (chat completion, structured output), STT (transcription)
- `elevenlabs` — TTS streaming
- `azure-cognitiveservices-speech` — Pronunciation assessment SDK
- `psycopg2` — PostgreSQL adapter
- `redis` — Rate limiter
- `minio` — MinIO client (presigned URLs, object streaming)
- `prometheus-client` + `prometheus-fastapi-instrumentator` — Metrics
- `python-jose` — JWT creation/decoding
- `passlib` — Password hashing (bcrypt)
- `resend` — Email delivery (password reset)
- `pytest` + `pytest-asyncio` + `fakeredis` — Test suite

### JavaScript / TypeScript
- `react` + `react-dom` — UI rendering
- `typescript` — Type safety
- `vite` — Build & HMR
- `tailwindcss` + `@tailwindcss/typography` — Utility-first styling và hỗ trợ Markdown
- `framer-motion` — UI animations
- `@tanstack/react-query` — Data fetching, cache invalidation
- `@radix-ui/react-...` — Headless UI components (Dialog, Switch, Dropdown,...)
- `react-router-dom` — SPA Routing
- `recharts` — Biểu đồ thống kê học tập
- `@tanstack/react-virtual` — List virtualization tối ưu hiệu năng
- `i18next` + `react-i18next` — Internationalization (Đa ngôn ngữ EN/VI)

---

## Tổng quan công việc theo module

### 1. CI/CD & DevOps
- GitLab CI pipeline: test → Kaniko build → kubectl deploy trên GKE
- Harbor registry: Docker images storage
- GitHub Actions: sync branches, multi-workflow
- K8s manifests: backend, frontend, MinIO, Redis, Prometheus, Grafana, Vector DaemonSet, Ingress
- Docker Compose: full local stack với PostgreSQL, Redis, MinIO, VEK stack (Vector + Elasticsearch + Kibana), Prometheus, Grafana
- Nginx: frontend serving, API reverse proxy, dynamic backend host configuration

### 2. Authentication & Security
- JWT-based auth (login, register, token refresh)
- OAuth 2.0: Google, Microsoft, Facebook (authorization code flow + state verification)
- Password reset: Resend API, 5-minute token expiry, `password_reset_tokens` table
- Input guardrails: length validation, injection detection, topic filtering, Redis rate limiting
- Output guardrails: content filter (toxicity/PII), format validator (URL stripping)
- HITL (Human-in-the-Loop) queue và admin review API

### 3. LLM Pipeline (LangGraph)
- `VoiceAgentPipeline`: graph nodes — preflight → respond → tool (conditional) → tts
- **Preflight classifier**: LLM-based classification (SAFE / UNSAFE / NEEDS_TOOL / SCOPE) với conversation history context
- **Respond node**: single LLM call với grammar + suggestions embedded (XML-tag format)
- **Structured output**: Pydantic `AgentOutput` model, `structured_client` (Groq JSON mode)
- **ToolNode**: 7 flashcard tools với LangGraph tool loop (cap 3 iterations), `handle_tool_errors=True`
- `AgentState`: messages, grammar_raw, suggestions, tool_intent, voice_accent, guardrail_blocked
- `RunnableConfig` injection: user_id truyền qua config thay vì system prompt

### 4. Grammar Assessment
- Compact XML-tag format: `<grammar>...</grammar>` block inline trong LLM response
- `split_combined_output` và `parse_annotated_grammar`: tách response text và grammar block
- `grammar_feedback` table: lưu per-turn grammar data
- API: `GET /api/grammar/{message_id}` trả full grammar detail, `ChatResponse` bao gồm `grammar_detail` inline

### 5. Pronunciation Assessment
- `AzureAssessmentService`: đánh giá từng âm tiết/phoneme qua Azure Speech SDK
- Kết quả lưu vào DB với `user_id`, `message_id`, các metrics
- API: `POST /api/pronunciation/assess`

### 6. Flashcard
- DB schema: `decks`, `cards`, `media_files`, `card_reviews`
- SM-2 spaced repetition algorithm
- 7 LangGraph agent tools: `create_deck`, `list_decks`, `create_card`, `search_cards`, `get_due_cards`, `update_card`, `submit_card_review`
- REST API đầy đủ với multipart media upload
- MinIO presigned URLs cho media

### 7. Topics & Conversations
- 10 categories × 64 topics với stable UUIDs
- Conversation soft-delete, 5-session limit per topic, session naming
- API: `GET /api/topics/categories`, `GET /conversations/for-topic`, `DELETE /conversations/{id}`
- Frontend: hierarchical `ConversationSidebar`, auto-resume latest session

### 8. Next Speaking Suggestions
- `<suggestions>` XML-tag trong LLM response
- Parser, DB schema (`suggestions` column on messages), API propagation
- Frontend: `MessageBubble` hiển thị clickable suggestions

### 9. Prompt Management
- Consolidate 4 prompt files → 1 `system_prompt.md` với section-based parsing
- Tiered behavioral decision model (4 tiers: crisis, jailbreak, minimal input, context-aware coaching)
- K8s ConfigMap: 1 file thay vì 4 volume mounts
- `build_system_prompt()`: `include_grammar`, `use_structured_output` flags

### 10. Voice Recorder & Audio
- `useVoiceRecorder` hook: state machine (idle → recording → review → sending)
- AnalyserNode waveform: 150 bars, real-time amplitude, playback fill + click-to-seek
- Audio post-processing: silence trim, noise gate, WAV encode (`trimGateEncode`)
- `/api/chat/transcribe`: STT endpoint (Groq Whisper)
- `/api/audio/{key}`: audio proxy với cache headers (1h), MinIO streaming

### 11. Voice Accent
- US/UK accent selector với SVG flag icons trong Audio Settings
- `voice_accent` field qua toàn bộ pipeline: `AgentState` → `tts_node` → `_synthesize_audio_bytes` → `/chat/respond`

### 12. Observability
- **Telemetry**: `contextvars`-based span context (trace_id, session_id, msg_id)
- **Logging**: `get_logger` factory, `LoggingMiddleware` (request/response), UUID masking filter, Python file field
- **VEK**: Vector parse log prefix → Elasticsearch data streams theo category, hiện thị trực quan qua kibana
- **Prometheus**: `llm_ttft_seconds` histogram, `prometheus-fastapi-instrumentator`, `/metrics`
- **Grafana**: provisioned dashboard cho Voice Agent pipeline
- **Rancher**: Quản lý cụm k8s

### 13. Frontend (UI)
- Voice Agent: chat interface, audio playback, grammar feedback panel, reasoning steps timeline
- Dashboard: score trend chart, badges, streak, session history, topic category selector
- Flashcard UI: deck list, card study session, review
- Auth: Login, Register, OAuth buttons, OAuthCallbackPage, Forgot/Reset Password
- i18n: EN/VI translations, `LanguageContext`, `LanguageToggle`
- Dark mode: `useDarkMode`, Tailwind dark variants
- Mobile responsive: bottom navigation, drawer (PR từ Quyết)
- VAD (Voice Activity Detection): AudioWorklet, quality gating, backend-fallback STT
