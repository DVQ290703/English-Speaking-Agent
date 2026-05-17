# AI LinguAI - Đặc tả Sản phẩm & Kỹ thuật

## 1. Thông tin tổng quan

### 1.1 Tên dự án
- AI LinguAI (A20-App-014)

### 1.2 Mục tiêu sản phẩm
- Xây dựng trợ lý luyện nói tiếng Anh theo thời gian thực, tập trung vào 3 giá trị chính:
- Phản hồi nhanh (low-latency loop giữa người học và AI)
- Phản hồi có thể hành động ngay (actionable feedback)
- Theo dõi tiến bộ theo phiên học và theo thời gian

### 1.3 Đối tượng người dùng
- Người học tiếng Anh ở mức A2-C1
- Nhóm luyện IELTS Speaking (Part 1/2/3)
- Người đi làm cần luyện hội thoại thực tế (daily, business, interview)

### 1.4 Giá trị cốt lõi
- Nói -> được phản hồi tức thì -> biết sai ở đâu -> sửa được ngay -> duy trì thói quen luyện

---

## 2. Bài toán và pain points

Bài toán nhóm em giải quyết là khoảng trống giữa “học lý thuyết” và “luyện nói thực tế”: người học thiếu môi trường giao tiếp an toàn để luyện thường xuyên, ngại giao tiếp với người khác, và không có feedback đủ chính xác để cải thiện nhanh. Dự án AI LinguAI được xây dựng để lấp khoảng trống đó bằng trải nghiệm luyện nói theo tình huống thực tế, phản hồi chi tiết về ngữ pháp và phát âm, đồng thời gợi ý câu nói tiếp theo để duy trì hội thoại và tăng hiệu quả học.

### 2.1 User pain points
- Thiếu nhịp luyện nói đều đặn và khó duy trì kỷ luật luyện tập dài hạn.
- Ngại giao tiếp trực tiếp vì sợ sai, sợ bị đánh giá, thiếu tự tin khi phản xạ.
- Không xác định được nguyên nhân gốc của lỗi (ngữ pháp, phát âm, hay độ trôi chảy).
- Thiếu dữ liệu đo tiến bộ theo phiên học nên khó biết mình có đang cải thiện thật hay không.
- Trải nghiệm học bị rời rạc khi phải dùng nhiều công cụ khác nhau cho từng nhu cầu.

### 2.2 Product pain points
- Cân bằng giữa tốc độ phản hồi và độ sâu feedback.
- Dễ rơi vào “chat bot chung chung”, thiếu tính huấn luyện (coaching) theo ngữ cảnh học.
- Khó thiết kế trải nghiệm vừa cho người mới (ít ma sát) vừa cho người học nâng cao (nhiều phân tích).
- Khó duy trì nhất quán giữa nhiều mode: text chat, voice chat, pronunciation assessment, flashcard.
- Rủi ro quá tải nhận thức: nhiều thông tin lỗi/phân tích khiến người dùng nản.

### 2.3 Technical pain points
- Tích hợp đa dịch vụ AI (Groq STT/LLM, ElevenLabs TTS, Azure Pronunciation) với độ ổn định khác nhau.
- Kiểm soát lỗi từ LLM/tool call (malformed output, loop tool, rate-limit, timeout).
- Đồng bộ dữ liệu hội thoại + media audio + đánh giá phát âm trong một pipeline gần realtime.
- Quản trị media storage (MinIO), streaming audio bảo mật, cache hợp lý.
- Tránh nợ kỹ thuật ở guardrails/bảo mật khi hệ thống mở rộng lưu lượng.
- Quan sát hệ thống phân tán (metrics/logs/traces) đủ sâu để debug production.

---

## 3. Phạm vi sản phẩm

### 3.1 In-scope (đã có trong source)
- Xác thực tài khoản: đăng ký, đăng nhập, đổi mật khẩu, quên mật khẩu, OAuth callback.
- Luyện hội thoại AI theo chủ đề (text/audio input).
- STT qua Groq Whisper, TTS qua ElevenLabs.
- Chấm phát âm chuyên sâu qua Azure Pronunciation Assessment.
- Lưu lịch sử hội thoại, lưu audio người dùng và audio AI.
- Phân tích grammar, suggestions, hiển thị chi tiết message-level.
- Dashboard thống kê phiên học và xu hướng điểm.
- Flashcard deck/card/review (SM-2), media cho flashcard.
- Guardrails input/output + audit logging hook.

### 3.2 Out-of-scope hiện tại
- Adaptive learning path cá nhân hóa sâu bằng mô hình riêng.
- Hệ thống thi thử IELTS full-test có proctoring.
- Social/community, nhóm học, leaderboard toàn nền tảng.
- Billing/subscription thương mại hoàn chỉnh.

---

## 4. Kiến trúc tổng thể hệ thống

### 4.1 Thành phần chính
- Frontend: React + Vite + TypeScript + Tailwind, route-based app cho chat/dashboard/flashcard.
- Backend API: FastAPI, REST endpoints dưới `/api`.
- Database: PostgreSQL (schema chuẩn hóa cho auth, conversation, pronunciation, flashcard).
- Cache/Rate limit: Redis.
- Object storage: MinIO (audio message, flashcard media).
- AI services:
- Groq STT (transcription)
- Groq LLM (response + tool flow + grammar structure)
- ElevenLabs TTS (voice phản hồi AI)
- Azure Speech (pronunciation scoring)
- Observability stack:
- Prometheus + Grafana (metrics)
- Vector + Elasticsearch + Kibana (log pipeline)

### 4.2 Backend module map
- `app/main.py`: bootstrap app, middleware, security headers, metrics endpoint `/metrics`.
- `app/api/*`: auth, chat, assess, conversations, topics, flashcards, audio proxy, oauth.
- `app/agents/*`: pipeline LangGraph, tool steps, output model, flashcard tools.
- `app/core/*`: settings, db pool, security, storage, telemetry, logging.
- `app/services/*`: Groq STT/LLM, ElevenLabs, Azure assessment, grammar parser, email service.
- `app/guardrails/*`: input validator/rate-limit/injection/topic filter + output redaction.

### 4.3 Frontend module map
- `frontend/src/pages/VoiceAgent.tsx`: trang hội thoại chính (chat + recording + feedback panel).
- `frontend/src/pages/DashboardPage.jsx`: thống kê, trend score, quick actions.
- `frontend/src/pages/Flashcard*`: deck/card/study flows.
- `frontend/src/auth/*`: auth context, guards, token session.
- `frontend/src/hooks/*`: audio capture, send chat, session persistence, topics fetch.
- `frontend/src/components/voice-agent/*`: message bubble, panels, sidebar, recorder UI.

---

## 5. Luồng hoạt động chính

### 5.1 Luồng chat text/audio
1. Client gửi `POST /api/chat/respond` kèm text hoặc audio.
2. Nếu audio mà chưa có text: backend gọi STT để lấy transcript.
3. Input đi qua input guardrails (length, injection, topic block, rate-limit).
4. Backend resolve conversation (tạo mới hoặc dùng conversation hiện tại, kiểm tra ownership).
5. Gọi pipeline LangGraph:
- Preflight: safety + tool intent
- Respond: structured output hoặc tool path (flashcard tools)
- TTS: tạo audio phản hồi
6. Output đi qua output guardrails (PII redaction).
7. Persist DB: turns, messages, audio_assets, grammar_feedback.
8. Trả về response text + audio (inline nếu nhỏ, hoặc URL proxy `/api/audio/{key}`).

### 5.2 Luồng pronunciation assessment
1. Client gửi `POST /api/assess` với audio + optional reference_text.
2. Backend validate audio type/size, validate language (`en-US`, `en-GB`).
3. Gọi Azure assessment (scripted/unscripted).
4. Parse và lưu nhiều cấp dữ liệu: assessment -> words -> syllables -> phonemes.
5. Trả điểm tổng và chi tiết lỗi phát âm cho UI.

### 5.3 Luồng flashcard
1. Người dùng tạo deck/card, upload media (ảnh/audio).
2. Review card theo rating (`again|hard|good|easy`).
3. Backend áp dụng SM-2 để cập nhật interval, due_date, ease_factor.
4. Dashboard/Flashcard page hiển thị due cards và retention.

---

## 6. Tính năng chính

### 6.1 Coaching hội thoại AI
- Hội thoại theo topic/category.
- Hỗ trợ text input và audio input.
- Gợi ý follow-up/suggestions từ AI.
- Phát audio phản hồi AI theo accent/gender.

### 6.2 Grammar feedback
- Parse grammar lỗi theo span (original/corrected/start/end).
- Trả summary + detail theo message.
- Đồng bộ lại từ DB khi mở lại conversation.

### 6.3 Pronunciation scoring
- Điểm thành phần: overall, accuracy, fluency, completeness, prosody.
- Chi tiết theo word/syllable/phoneme.
- Hỗ trợ replay audio và xem lỗi tại từng message.

### 6.4 Conversation lifecycle
- Tạo session theo topic.
- Giới hạn tối đa 5 conversation active/topic/user.
- Clear history logic bằng `cleared_at` (không xóa vật lý).
- Soft delete conversation (`deleted_at`) để giải phóng quota session.

### 6.5 Dashboard tiến bộ
- Tổng phiên, điểm trung bình, thời lượng, streak.
- Trend score quy đổi dạng IELTS band.
- Radar view theo dimension pronunciation/fluency/accuracy.

### 6.6 Flashcard learning loop
- Deck/card CRUD.
- Attach media front/back.
- Search card theo keyword/tag.
- Review scheduling bằng SM-2.

---

## 7. Dữ liệu và mô hình lưu trữ

### 7.1 Bảng dữ liệu trọng tâm
- `users`, `oauth_accounts`, `auth_sessions`, `password_reset_tokens`.
- `categories`, `topics`, `user_topic_preferences`.
- `conversations`, `turns`, `messages`.
- `audio_assets`.
- `pronunciation_assessments`, `pronunciation_word_details`, `pronunciation_syllable_details`, `pronunciation_phoneme_details`.
- `grammar_feedback`.
- `flashcard_decks`, `flashcards`, `flashcard_media`, `flashcard_reviews`.

### 7.2 Nguyên tắc dữ liệu
- UUID cho ID chính, phục vụ scale/distributed systems.
- Soft-delete ở tầng conversation/card/deck để tránh mất dữ liệu học.
- Tách bảng chi tiết phát âm để truy vấn analytics theo nhiều cấp độ.
- Audio lưu object storage; DB chỉ lưu metadata/storage key.

---

## 8. Guardrails, an toàn và bảo mật

### 8.1 Input guardrails
- Giới hạn độ dài input.
- Rate limit theo user (Redis).
- Chặn injection pattern và topic blocklist.

### 8.2 Output guardrails
- Redact thông tin nhạy cảm trước khi trả client.
- Áp dụng với cả response text và suggestions.

### 8.3 Security controls
- JWT auth (HS256), bắt buộc secret mạnh.
- Password policy mạnh (>=12 ký tự, đủ loại ký tự).
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, ...).
- Audio proxy có auth để tránh lộ link object trực tiếp.

---

## 9. Edge cases và hành vi mong đợi

### 9.1 Chat/AI pipeline
- Audio rỗng hoặc vượt 25MB -> trả `400/413` rõ lý do.
- STT thất bại -> fallback text an toàn, không crash request.
- LLM rate-limit hoặc tool malformed -> fallback coaching response.
- Tool loop vượt `TOOL_CALL_CAP` -> ép plain response, tránh lặp vô hạn.
- TTS lỗi -> vẫn trả text; audio có thể rỗng.

### 9.2 Conversation state
- `conversation_id` không thuộc user -> `404`.
- Topic unknown -> vẫn tạo conversation generic, title mặc định.
- Vượt 5 session/topic -> `409 Conversation limit reached`.

### 9.3 Pronunciation
- Azure key/region thiếu -> `503 service unavailable`.
- Language ngoài `en-US/en-GB` -> `400`.
- Azure trả schema bất thường -> `502`.

### 9.4 Flashcard
- Multipart media arrays không cùng length -> `422`.
- MIME type sai hoặc file >10MB -> `415/413`.
- Card/deck không thuộc user -> `404`.

### 9.5 Frontend UX
- Session restore từ URL/sessionStorage.
- Chống race condition khi connect/disconnect nhanh.
- Auto-load conversation gần nhất theo topic.
- Ngăn toast/typing state bị sai khi replay audio.

---

## 10. Yêu cầu kỹ thuật (Functional + Non-functional)

### 10.1 Functional requirements
- FR-01: Hệ thống phải hỗ trợ chat text và audio trong cùng endpoint.
- FR-02: Hệ thống phải lưu đầy đủ hội thoại theo turn/message.
- FR-03: Hệ thống phải trả grammar feedback cho user message.
- FR-04: Hệ thống phải chấm phát âm và trả chi tiết word/phoneme.
- FR-05: Hệ thống phải hỗ trợ flashcard learning cycle với lịch ôn.

### 10.2 Non-functional requirements
- NFR-01: Khả dụng dịch vụ ở mức cao cho các endpoint chính (`/chat/respond`, `/assess`).
- NFR-02: Tính chịu lỗi: có fallback khi STT/LLM/TTS provider lỗi.
- NFR-03: Bảo mật: JWT, password policy, security headers, guardrails.
- NFR-04: Quan sát: metrics `/metrics`, logs cấu trúc, trace_id trên response headers.
- NFR-05: Mở rộng: kiến trúc tách lớp service/storage phù hợp scale ngang backend.

---

## 11. Triển khai và vận hành

### 11.1 Local stack (Docker Compose)
- Backend, Frontend, Postgres, Redis, MinIO
- PgAdmin
- Observability stack: Prometheus, Grafana, Elasticsearch, Kibana, Vector

### 11.2 Môi trường cloud/infrastructure
- Repo có cấu hình Terraform cho AWS và GCP.
- Có manifests K8s trong `deployments/` cho backend/frontend/monitoring.

---

## 12. Rủi ro và hướng giảm thiểu

### 12.1 Rủi ro sản phẩm
- Người dùng mới bị ngợp vì nhiều thông số kỹ thuật.
- Giảm thiểu: progressive disclosure, ưu tiên insight ngắn gọn trước.

### 12.2 Rủi ro kỹ thuật
- Phụ thuộc nhiều provider bên ngoài (Groq, ElevenLabs, Azure).
- Giảm thiểu: fallback cục bộ, circuit breaker/retry hợp lý, theo dõi error budget.

### 12.3 Rủi ro vận hành
- Log/audio tăng nhanh, chi phí lưu trữ tăng.
- Giảm thiểu: retention policy, lifecycle cleanup, monitoring capacity.

---

## 13. Định hướng nâng cấp

### 13.1 Product roadmap gợi ý
- Cá nhân hóa lộ trình luyện theo điểm yếu từng người.
- Session goals và bài tập follow-up tự động.
- Bổ sung mock test mode theo format IELTS đầy đủ.

### 13.2 Technical roadmap gợi ý
- Tách job nền cho tác vụ nặng (assessment post-processing).
- Thêm contract tests cho schema output của LLM.
- Hoàn thiện event pipeline để tracking learning analytics theo real-time.

---

## 14. Kết luận

Bản hiện tại của dự án đã có nền tảng kỹ thuật khá đầy đủ cho một AI LinguAI thực chiến: từ hội thoại realtime, pronunciation scoring, flashcard luyện tập tới observability triển khai production. Trọng tâm giai đoạn tiếp theo là nâng mức cá nhân hóa học tập, tối ưu trải nghiệm theo từng trình độ người học và gia cố độ tin cậy khi scale lưu lượng thật.
