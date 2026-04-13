# Weekly Journal

Ghi lại hành trình xây dựng sản phẩm mỗi tuần — những gì đã làm, học được gì, AI giúp như thế nào.

---

## Tuần 1 — 02/04/2026

**Thành viên:** Đỗ Thế Anh(2A202600040), Đỗ Văn Quyết(2A202600042), Bùi Hữu Huấn(2A202600353)

### Đã làm

- Phân tích problem space của IELTS Speaking (user band 5.0–6.5)
- Xây dựng Product Spec hoàn chỉnh (vision, user, flow, UX)
- Thiết kế kiến trúc hệ thống tổng thể (Frontend, Backend, AI pipeline)
- Define rõ 2 luồng xử lý:
  - Text → grammar scoring
  - Audio → STT → full scoring
- Thiết kế database schema (topics, messages, evaluations)
- Quyết định tech stack:
  - FastAPI (backend)
  - Streamlit (UI MVP)
  - Whisper API (STT)
- Setup project structure chuẩn (theo template production-ready)
- Thống nhất Python 3.10 + uv
- Tạo repo và chuẩn bị môi trường phát triển

### Khó nhất tuần này

- Phân tách rõ ràng logic giữa text vs audio pipeline (tránh over-engineering)
- Xác định scope MVP: bỏ bớt feature nhưng vẫn giữ core value
- Chọn STT solution phù hợp giữa Azure vs Whisper (trade-off giữa cost và quality)

### AI tool đã dùng

| Tool    | Dùng để làm gì                              | Kết quả                                     |
| ------- | ------------------------------------------- | ------------------------------------------- |
| ChatGPT | Thiết kế product spec + system architecture | Có được tài liệu đầy đủ để dev bắt đầu ngay |
| Cursor  | Hỗ trợ viết và chỉnh sửa markdown           | Tăng tốc độ viết tài liệu                   |

### Học được

- Phải tách rõ pipeline ngay từ đầu (text vs audio) để tránh refactor sau này
- MVP không phải là “ít tính năng”, mà là “đúng tính năng cốt lõi”
- Quyết định tech stack nên dựa vào speed triển khai hơn là tối ưu hoàn hảo

### Nếu làm lại, sẽ làm khác

- Define API contract sớm hơn (tuần này mới chỉ dừng ở high-level)
- Viết rõ data schema ngay từ đầu thay vì refine nhiều lần

### Kế hoạch tuần tới

- Thiết kế chi tiết API (request/response schema)
- Implement FastAPI skeleton
- Setup Streamlit UI cơ bản
- Test flow end-to-end: text → API → response

---

## Tuần 2 — 06/04/2026

**Thành viên:** Đỗ Thế Anh(2A202600040), Đỗ Văn Quyết(2A202600042), Bùi Hữu Huấn(2A202600353)

### Đã làm

- Refine lại toàn bộ Product Spec (từ high-level → detailed, có thể dev được)
- Chuẩn hóa lại system architecture:
  - Phân tách rõ frontend / backend / AI services
  - Xác định rõ vai trò từng layer
- Thiết kế chi tiết API contract (ở mức design, chưa implement):
  - /chat/text vs /chat/audio (tách riêng để giảm complexity)
  - /evaluation/{id}, /audio/{id}
- Define rõ response structure cho LLM output:
  - grammar_score
  - vocabulary_score
  - pronunciation_score
  - corrected_text
  - feedback
- Thiết kế lại data model chi tiết hơn:
  - topics (system_prompt rất quan trọng)
  - messages (text + audio)
  - message_evaluations (scoring + feedback)
- Quyết định storage strategy:
  - Audio không lưu DB → lưu cloud (S3/Azure Blob)
- Phân tích sâu AI pipeline:
  - Text mode ≠ Audio mode (2 pipeline khác nhau)
  - STT không chỉ convert mà phải giữ hesitation (um, ah)
- So sánh và ra quyết định về speech tech:
  - Azure vs Whisper → chọn Whisper cho MVP
- Align lại toàn bộ với roadmap + Gates (đảm bảo tuần 3 có thể build agent)

### Khó nhất tuần này

- Chuẩn hóa "boundary" giữa các component:
  - API làm gì, LLM làm gì, UI làm gì
  → nếu không rõ sẽ dẫn đến logic bị leak giữa các layer

- Thiết kế response của LLM:
  - Nếu không cố định format → UI sẽ rất khó render
  - Nếu quá cứng → mất flexibility của AI

- Quyết định mức độ "intelligence" của hệ thống:
  - Bao nhiêu phần dùng rule-based?
  - Bao nhiêu phần dùng LLM?

### AI tool đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| ChatGPT | Refine spec, thiết kế API, define data flow | Tạo được bản spec đủ chi tiết để dev mà không bị mơ hồ |
| Cursor | Hỗ trợ chỉnh sửa markdown + structure tài liệu | Giữ tài liệu clean và dễ đọc |

### Học được

- Spec tốt giúp giảm 50–70% effort coding sau này
- Tách rõ "data contract" (input/output) quan trọng hơn viết code sớm
- AI system không nên thiết kế kiểu "để model tự xử lý hết"
  → cần định nghĩa rõ responsibility từng layer
- Với AI product, latency và UX phải được nghĩ từ phase design, không phải sau khi build

### Nếu làm lại, sẽ làm khác

- Viết JSON schema cụ thể cho response ngay từ đầu (có thể dùng Pydantic)
- Thiết kế luôn prompt structure song song với API (hiện tại mới dừng ở system level)
- Vẽ sequence diagram sớm hơn để tránh hiểu sai flow

### Kế hoạch tuần tới

- Implement FastAPI skeleton từ spec đã define
- Build pipeline cơ bản:
  - text → LLM → output
  - audio → STT → LLM
- Bắt đầu xây dựng core agent (LangGraph)
- Chuẩn bị đạt Gate 3: Core agent chạy được

---

