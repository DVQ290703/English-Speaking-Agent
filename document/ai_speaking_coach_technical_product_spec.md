# 📘 AI Speaking Coach – Unified Product & Technical Specification

---

# 1. 📌 Project Overview

## 1.1 Project Name
**AI Speaking Coach – IELTS Speaking Assistant**

## 1.2 Vision
Giúp người học đạt khả năng nói **trôi chảy, tự nhiên, chính xác** thông qua feedback AI thời gian thực.

## 1.3 Mission
- Phân tích lỗi ngay lập tức
- Feedback rõ ràng, actionable
- Giúp cải thiện mỗi ngày không cần giáo viên 1-1

## 1.4 Core Value
> Feedback loop nhanh + rõ + actionable

---

# 2. 🎯 Target Users

## Primary Users
- IELTS Speaking band 5.0 – 6.5

## Pain Reality
- Thiếu phản xạ
- Không biết sai ở đâu
- Ngại nói

---

# 3. 🧠 Problem Definition

## Core Loop
> Nói sai → Không ai sửa → Ngại nói → Không tiến bộ

## Pain Points
- Không có môi trường luyện chuẩn
- Không có feedback chi tiết
- Không đo lường tiến bộ

---

# 4. 💡 Solution Overview

## Product Concept
- Record / Chat
- Phân tích lỗi real-time
- Gợi ý câu tốt hơn
- Nghe lại giọng chuẩn

---

# 5. 🧠 User Flow (Final)

1. Chọn topic (IELTS Part 1/2/3)
2. Input:
   - Text → chỉ chấm grammar
   - Audio → full scoring
3. AI xử lý
4. Hiển thị chat + score từng câu
5. Click message → xem analysis
6. Nghe lại audio (user + agent)
7. Lưu lịch sử

---

# 6. 🎨 UI/UX (Streamlit MVP)

## Layout
- Left: Analysis panel
- Center: Chat
- Bottom: Input (text + record)

## Key Features
- Chat history
- Score badge per message
- Click → show breakdown
- Replay audio (user + AI)

## UX Principles
- < 7s feedback
- Highlight lỗi rõ ràng
- 1 screen, low friction

---

# 7. 🏗️ MVP Scope

## In Scope
- Text + Audio input
- STT (Whisper)
- Grammar/Vocab/Fluency scoring
- TTS
- Chat UI
- Lưu history

## Out of Scope
- Gamification
- Social
- Deep personalization

---

# 8. 🧠 AI Pipeline

## Text Mode
Text → LLM → Grammar scoring

## Audio Mode
Audio → STT → Text → LLM → Analysis → TTS

## Output Structure
- transcript
- grammar_score
- vocabulary_score
- pronunciation_score
- corrected_text
- feedback

---

# 9. 🎤 Speech Tech Decision

| Option | Ưu | Nhược |
|------|----|------|
| Azure | Pronunciation tốt | Cost |
| Whisper local | Free | Cần GPU |
| Whisper API | Dễ dùng | Không có pronunciation |

## Decision
- MVP: Whisper API
- Phase sau: Azure scoring

---

# 10. 🧩 Backend (FastAPI)

## Endpoints

### /chat/text
- Input: text
- Output: grammar_score

### /chat/audio
- Input: audio
- Output: full analysis

### /config/model
- chọn model

### /config/voice
- chọn giọng

### /audio/{id}
- trả audio agent

### /evaluation/{id}
- trả phân tích

---

# 11. 🗄️ Database Design

## topics
- id
- slug
- title
- description
- system_prompt
- created_at

## practice_sessions
- id
- user_id
- topic_id
- title
- notes
- status
- started_at
- ended_at
- created_at
- updated_at

## messages
- id
- user_id
- topic_id
- practice_session_id
- role
- input_mode
- attempt_no
- user_input_text
- transcript_text
- user_audio_path
- duration_seconds
- word_count
- pause_count
- content_text
- audio_path
- agent_reply_text
- agent_audio_path
- model_name
- voice_name
- created_at

## message_evaluations
- message_id
- transcript
- grammar_score
- vocabulary_score
- fluency_score
- coherence_score
- lexical_resource_score
- pronunciation_score
- corrected_text
- feedback_json
- rubric_version
- summary
- is_mock
- created_at

### Ý nghĩa dữ liệu

- `practice_sessions` gom nhiều lượt vào cùng một buổi học
- `attempt_no` cho biết thứ tự làm bài theo `user + topic`
- `duration_seconds`, `word_count`, `pause_count` dùng để phân tích tiến bộ
- `rubric_version` giúp đổi thang chấm mà không làm vỡ dữ liệu cũ
- breakdown điểm chi tiết hỗ trợ theo dõi kỹ năng thay vì chỉ nhìn tổng quan

---

# 12. ☁️ Storage

- Audio user upload được lưu local disk trong `data/uploads/<user_id>/<topic_slug>/`
- Audio agent sinh ra được lưu local disk trong `data/generated_audio/`
- Đây là storage nội bộ cho MVP, chưa phải cloud storage

---

# 13. 🔄 Data Flow

1. Input user
2. Audio → upload → STT
3. LLM analysis
4. Save DB
5. Generate agent response
6. TTS
7. Return UI

---

# 14. 🧪 Testing Strategy

- Test lỗi người Việt
- Test hesitation (um, ah)
- Response < 7s

---

# 15. 📊 Success Metrics

## Product
- DAU
- Retention

## Learning
- WPM ↑
- Grammar errors ↓
- Vocabulary ↑

---

# 16. ⚠️ Risks

## AI sai
→ Hybrid rule + LLM

## Latency
→ async + streaming

## Drop user
→ UX đơn giản

---

# 17. 🚀 Roadmap

## Phase 1
- MVP core

## Phase 2
- Progress tracking

## Phase 3
- Conversation AI

## Phase 4
- Full test

---

# 18. 🏗️ Tech Stack

- Python 3.10
- uv (package manager)
- FastAPI
- Streamlit
- LangGraph

---

# 19. 📌 Conclusion

System tập trung vào:
- Feedback nhanh
- Phân tích rõ
- Improve liên tục

→ Optimize cho IELTS Speaking outcome

