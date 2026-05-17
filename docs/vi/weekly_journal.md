# Weekly Journal — English Speaking Agent

## Tuần 1 (23/04/2026 – 28/04/2026)

### Mục tiêu
- Xây dựng hạ tầng ban đầu: CI/CD pipeline, K8s manifests, Docker build.
- Tích hợp Azure Cognitive Services cho chức năng đánh giá phát âm.
- Scaffolding frontend cơ bản (React + TypeScript).
- Thiết lập hệ thống Guardrails (bộ lọc đầu vào / đầu ra).

### Kết quả đạt được
- Triển khai GitLab CI/CD pipeline (test → build → deploy) với Kaniko và kubectl trên GKE.
- Thêm K8s manifests cho backend, frontend, MinIO, GKE Ingress, và GCP Managed Certificate.
- Hoàn thành `AzureAssessmentService` — đánh giá phát âm từng âm tiết (syllable/phoneme) qua Azure Speech SDK.
- Tích hợp endpoint `/api/pronunciation/assess` vào backend FastAPI.
- Scaffold frontend với layout Voice Agent, Dashboard, Login/Register.
- Hoàn thành hệ thống Guardrails đầu vào: `InputValidator`, `InjectionDetector`, `TopicFilter`, `RateLimiter` (Redis, 10 req/min).
- Hoàn thành Guardrails đầu ra: `ContentFilter`, `FormatValidator`, `OutputGuardrails`.
- Thêm `HITLRouter` và HITL review API (`/api/admin/hitl`) với admin key auth.
- Thêm `AuditLogger` (structured JSON + tùy chọn ghi DB).
- Kết nối voice gender selector với ElevenLabs TTS (Hữu Huấn).

### Khó khăn & Cách giải quyết
- **CI/CD trigger sai branch**: Sửa `.gitlab-ci.yml` để chạy đúng trên branch `main`.
- **Azure resource leak**: Phải đảm bảo `recognizer` và `speech_config` được xóa đúng cách sau mỗi lần nhận diện để tránh memory leak.
- **Guardrail phức tạp**: Chia nhỏ thành từng module độc lập, viết test TDD cho từng component.

---

## Tuần 2 (28/04/2026 – 04/05/2026)

### Mục tiêu
- Hoàn thiện tính năng đánh giá ngữ pháp (Grammar Assessment) tích hợp vào pipeline LLM.
- Xây dựng hệ thống Topic/Category (10 chủ đề × 64 topic) phục vụ lựa chọn chủ đề hội thoại.
- Thêm tính năng Flashcard (decks, cards, spaced repetition SM-2).
- Cải thiện frontend: conversation sidebar, session history, gamification.

### Kết quả đạt được
- Tích hợp grammar assessment pipeline: `grammar_parser`, `grammar_feedback` table, API endpoint `GET /api/grammar/{message_id}`.
- Grammar summary được trả inline trong `ChatResponse`.
- Thiết kế lại database schema: thêm `categories`, `triggers`, `CHECK constraints`, index cho soft-delete.
- Seed 10 categories và 64 topics với stable UUIDs.
- Endpoint `GET /api/topics/categories` trả về danh sách chủ đề có phân cấp.
- Hoàn thành Flashcard module: DB schema (decks, cards, media, reviews), SM-2 algorithm, REST API đầy đủ, LangGraph agent tools.
- Frontend: `ConversationSidebar` phân cấp theo topic, server-side history loading, TanStack Query + IndexedDB caching.
- Gamification: badges, streak computation, `ScoreTrendChart`, `BadgesCard` (Quyết).
- Soft-delete conversations, session limit 5 per topic, auto-generated session title.

### Khó khăn & Cách giải quyết
- **Grammar JSON parsing từ LLM**: LLM đôi khi trả về format sai → dùng XML-tag markers thay vì JSON thuần để parse an toàn hơn.
- **Merge conflicts giữa các branch**: Team sử dụng merge workflow có naming rõ ràng (TheAnh, Quyet, HuuHuan), giải quyết conflict thủ công từng file.
- **Flashcard tool LLM hallucination**: LLM truyền string `ielts_deck` thay vì UUID thực → thêm `_is_valid_uuid()` validator và `ToolNode(handle_tool_errors=True)`.

---

## Tuần 3 (04/05/2026 – 11/05/2026)

### Mục tiêu
- Xây dựng hệ thống Observability (logs, metrics, tracing).
- Hoàn thiện Voice Recorder với waveform visualization.
- Tối ưu hóa LLM: giảm số lần gọi API, giảm latency.
- Thêm Reasoning Steps UI để hiển thị các bước suy luận của agent.

### Kết quả đạt được
- **VEK Stack** (Vector + Elasticsearch + Kibana) tích hợp vào docker-compose: log routing theo category (audit/app), ILM, index templates, data views.
- **Prometheus + Grafana**: metrics endpoint `/metrics`, `llm_ttft_seconds` histogram, LangGraph pipeline dashboard.
- **Telemetry module**: structured tracing qua `contextvars`, UUID masking filter, `LoggingMiddleware`, component loggers.
- **Vector DaemonSet** trên K8s với RBAC, ConfigMap, Elasticsearch sink.
- Voice Recorder hoàn chỉnh: `useVoiceRecorder` hook với state machine, AnalyserNode waveform (150 bars), silence trim + noise gate, WAV encoder, click-to-seek playback.
- Grammar format đổi sang compact XML-tag (`<grammar>` block), single LLM call thay vì 2 calls → giảm latency đáng kể.
- Reasoning Steps: `ReasoningSteps` component, `ToolCallStep`, `extract_tool_steps`, `framer-motion` animations.
- AI guardrail node: thay thế `TopicFilter` và `InjectionDetector` bằng LLM-based preflight classifier.
- `create_deck` flashcard tool; flashcard UI `FlashcardPage` với decks/cards/reviews/stats.
- Audio transcription endpoint; audio served qua `/api/audio/{key}` proxy với cache headers.
- Server-side LLM history (cleared_at fence, soft-fence endpoint).
- Grammar inline trong `ChatResponse` (không cần gọi thêm endpoint riêng).

### Khó khăn & Cách giải quyết
- **Vector trên K8s**: ES cert SANs không bao gồm public IP → disable TLS verification. ES private AWS IP không reach được từ GKE → dùng public IP.
- **Vector data_dir persistence**: Không persist → duplicate indexing sau restart → thêm volume mount.
- **LLM tool_use_failed crash**: Bắt lỗi trong `ToolNode`, fallback sang plain client khi tool cap bị vượt.

---

## Tuần 4 (11/05/2026 – 15/05/2026)

### Mục tiêu
- Triển khai OAuth login (Google, Microsoft, Facebook).
- Thêm tính năng đặt lại mật khẩu qua email.
- Nâng cấp hệ thống prompt: consolidate, ConfigMap-managed, context-aware coaching model.
- Cải thiện deployment: dynamic nginx backend host, production env config.
- Thêm voice accent selector (US/UK).

### Kết quả đạt được
- **OAuth**: `oauth_accounts` table, login/callback endpoints, `build_auth_url`, `exchange_code_for_identity`, `find_or_create_user`, frontend `OAuthButtons` và `OAuthCallbackPage`.
- **Password Reset**: `password_reset_tokens` table, Resend API email delivery, 5-minute token expiry, frontend forgot/reset password flows.
- **Voice Accent**: US/UK toggle với SVG flag icons, `voice_accent` field qua toàn bộ pipeline (state → tts_node → API → UI).
- **Prompt consolidation**: Gộp 4 prompt files vào 1 `system_prompt.md` với section-based parsing, 1 ConfigMap thay vì 4.
- **Context-aware coaching model**: Tiered system prompt (4 tiers: crisis, jailbreak, minimal input, context-aware coaching), 31 structural tests.
- **Preflight classifier**: Thay guardrail ban đầu bằng LLM-based preflight (SAFE/UNSAFE/NEEDS_TOOL), kèm conversation history để phân loại chính xác câu ngắn/mơ hồ.
- Monitoring: Grafana và Vector configurations cập nhật cho K8s, health check filtering.
- Frontend mobile-responsive layout với bottom navigation và drawer (Quyết).
- JWT fix: 60s leeway cho clock skew giữa containers.
- `user_id` injection qua `RunnableConfig` (thay vì system prompt) → LLM schema sạch hơn.

### Khó khăn & Cách giải quyết
- **OAuth clock skew**: JWT decode lỗi do container clock khác nhau → thêm `leeway=60`.
- **Stale OAuth account links**: Xử lý trường hợp email đã tồn tại nhưng có stale oauth link.
- **Password reset email delivery**: Chuyển từ SMTP sang Resend API để đảm bảo deliverability trên production.
- **Preflight ngữ cảnh**: Câu trả lời ngắn như "ielts part 1" bị classify sai khi không có history → truyền 4 dòng history cuối vào preflight LLM.

---

## Tuần 5 (15/05/2026 – Hiện tại)

### Mục tiêu
- Thêm tính năng "Next Speaking Suggestions" — gợi ý câu nói tiếp theo cho người dùng.
- Chuyển sang Structured Output (Pydantic) cho LLM response để tăng độ tin cậy parsing.

### Kết quả đạt được
- **Next Speaking Suggestions**: `suggestions` prompt contract, parser (`<suggestions>` XML tag), schema DB, backend storage, API propagation, frontend MessageBubble hiển thị suggestions.
- **Structured Output**: `AgentOutput` Pydantic models, `structured_client` (Groq JSON mode), adapter `grammar_data_from_structured_output`, `use_structured_output` flag trong `build_system_prompt`.
- Preflight response format cập nhật với dimension `scope`.
- Fix regex suggestions tag để handle thêm attributes.

### Khó khăn & Cách giải quyết
- **Structured output reliability**: Groq JSON mode đôi khi fail với complex nested schema → fallback về XML-tag parsing cho grammar block.
- **Suggestions parsing**: Regex ban đầu không handle attributes trong tag → cập nhật regex pattern.
