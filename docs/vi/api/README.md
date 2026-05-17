# Tài Liệu Tham Khảo API

**URL cơ sở (Base URL):** `http://localhost:8000` (môi trường local) · Được cấu hình qua biến môi trường `APP_BASE_URL` trên production.

**Đặc tả OpenAPI:** [`openapi.yaml`](./openapi.yaml) — có thể import vào Postman, Insomnia, hoặc xem trực quan tại đường dẫn `/docs` khi ứng dụng đang chạy ở local.

---

## Xác Thực (Authentication)

Tất cả các endpoint ngoại trừ `GET /health` đều yêu cầu một mã Bearer JWT token.

**Để lấy token:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "YourPassword1!"}'
```

**Phản hồi (Response):**
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

**Sử dụng token trong các yêu cầu:**
```
Authorization: Bearer <jwt>
```

**Chi tiết về token:** Thuật toán HS256, thời gian hết hạn là 1 giờ. Các claims gồm: `sub` (UUID người dùng), `email`, `iat`, `nbf`, `exp`.

---

## Chính Sách Mật Khẩu (Password Policy)

Mật khẩu phải **dài ít nhất 12 ký tự** và bao gồm:
- Ít nhất một chữ cái in hoa (A–Z)
- Ít nhất một chữ cái thường (a–z)
- Ít nhất một chữ số (0–9)
- Ít nhất một ký tự đặc biệt (ví dụ: `!@#$%`)

---

## Các Loại Nội Dung (Content Types)

| Các Endpoint | Content-Type |
|---|---|
| Hầu hết các endpoint | `application/json` |
| `POST /api/chat/respond` | `multipart/form-data` |
| `POST /api/assess` | `multipart/form-data` |
| `GET /api/audio/{key}` | Phản hồi dạng nhị phân (audio stream) |

---

## Cấu Trúc Lỗi Chuẩn (Standard Error Shape)

```json
{ "detail": "Thông điệp lỗi dễ hiểu cho người dùng" }
```

Lỗi xác thực dữ liệu đầu vào (HTTP 422):
```json
{
  "detail": [
    { "loc": ["body", "email"], "msg": "field required", "type": "value_error.missing" }
  ]
}
```

## Các Mã Trạng Thái HTTP (HTTP Status Codes)

| Mã lỗi | Ý nghĩa |
|---|---|
| 200 | Thành công (Success) |
| 201 | Đã tạo mới thành công (Created) |
| 204 | Thành công nhưng không trả về nội dung (No content) |
| 400 | Yêu cầu không hợp lệ / Xác thực thất bại (Bad request) |
| 401 | Thiếu hoặc JWT không hợp lệ (Unauthorized) |
| 403 | Đã xác thực nhưng không có quyền truy cập tài nguyên này (Forbidden) |
| 404 | Không tìm thấy tài nguyên (Not found) |
| 413 | Dung lượng yêu cầu quá lớn (Payload too large) |
| 422 | Thực thể không thể xử lý (Lỗi validate dữ liệu từ Pydantic) |
| 429 | Vượt quá giới hạn lượt gọi cho phép (Rate limit exceeded) |
| 500 | Lỗi máy chủ nội bộ (Internal server error) |

---

## Giới Hạn Lượt Gọi (Rate Limiting)

Việc giới hạn lượt gọi được thực thi trên từng người dùng trong middleware guardrail đầu vào. Các giới hạn được cấu hình thông qua các biến môi trường. Vượt quá giới hạn cho phép sẽ trả về mã HTTP 429.

---

## Các Nhóm Endpoint

| Nhãn (Tag) | Tiền tố đường dẫn | Tài liệu hướng dẫn |
|---|---|---|
| Auth | `/api/auth` | [authentication.md](./guides/authentication.md) |
| Chat | `/api/chat` | [chat.md](./guides/chat.md) |
| Conversations | `/api/conversations` | [conversations.md](./guides/conversations.md) |
| Assessment | `/api/assess` | [pronunciation.md](./guides/pronunciation.md) |
| Grammar | `/api/grammar` | [pronunciation.md](./guides/pronunciation.md) |
| Flashcards | `/api/flashcards` | [flashcards.md](./guides/flashcards.md) |
| Topics | `/api/topics` | [topics-audio.md](./guides/topics-audio.md) |
| Audio | `/api/audio` | [topics-audio.md](./guides/topics-audio.md) |
| OAuth | `/api/auth/oauth` | [authentication.md](./guides/authentication.md) |
| Health | `/health` | Không yêu cầu xác thực |

> **Agent pipeline & các dịch vụ:** Xem [`docs/agent/`](../agent/README.md) để biết chi tiết về pipeline LangGraph, Groq LLM/STT, ElevenLabs TTS, và tài liệu Azure Speech.
