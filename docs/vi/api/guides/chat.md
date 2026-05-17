# Hướng Dẫn Hội Thoại (Chat Guide)

Endpoint chat là phần cốt lõi của ứng dụng. Nó tiếp nhận văn bản hoặc tệp âm thanh từ người dùng, chạy qua pipeline agent LangGraph, và trả về phản hồi của AI kèm theo âm thanh giọng nói TTS (tùy chọn).

---

## POST /api/chat/respond

**Loại Nội Dung (Content-Type):** `multipart/form-data`

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `text` | string | Không* | Văn bản đầu vào của người dùng (tối đa 4,000 ký tự) |
| `audio_file` | file | Không* | Âm thanh giọng nói của người dùng (mp3/wav/ogg/webm/m4a, tối đa 25 MB) |
| `category` | string | Không | Mã danh mục của chủ đề hội thoại (tối đa 80 ký tự) |
| `topic` | string | Không | Mã chủ đề hội thoại (tối đa 120 ký tự) |
| `voice_gender` | string | Không | Giới tính giọng nói TTS: `male` hoặc `female` |
| `voice_accent` | string | Không | Giọng vùng miền TTS: `british` hoặc `american` |
| `conversation_id` | string | Không | UUID của một cuộc hội thoại sẵn có để tiếp tục trò chuyện |

\* Bắt buộc phải cung cấp một trong hai trường: `text` hoặc `audio_file`, không cung cấp đồng thời cả hai.

**Giới hạn hội thoại:** Một người dùng chỉ được phép mở tối đa **5 cuộc hội thoại đang hoạt động trên mỗi chủ đề**. Cố gắng tạo cuộc hội thoại thứ 6 sẽ trả về lỗi HTTP 400.

### Ví dụ — Đầu vào là Văn bản

```bash
curl -X POST http://localhost:8000/api/chat/respond \
  -H "Authorization: Bearer <token>" \
  -F "text=Tell me about your hometown." \
  -F "topic=hometown" \
  -F "voice_gender=female" \
  -F "voice_accent=british"
```

### Ví dụ — Đầu vào là Âm thanh

```bash
curl -X POST http://localhost:8000/api/chat/respond \
  -H "Authorization: Bearer <token>" \
  -F "audio_file=@recording.webm" \
  -F "topic=hometown" \
  -F "conversation_id=3fa85f64-5717-4562-b3fc-2c963f66afa6"
```

### Phản hồi mã 200 (OK)

```json
{
  "user_input": "I grew up in a small coastal town.",
  "response_text": "That's interesting! Tell me more about the local food there.",
  "audio_base64": "",
  "audio_mime": "audio/mime",
  "user_audio_url": null,
  "assistant_audio_url": "http://localhost:8000/api/audio/tts/abc123.mp3",
  "conversation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "user_message_id": "7ab12c34-...",
  "grammar_summary": {
    "error_count": 0,
    "has_errors": false,
    "flagged_spans": []
  },
  "grammar_detail": null,
  "tool_steps": [],
  "suggestions": ["Tell me about the weather there.", "What do you miss most?"]
}
```

**Cách phân phối âm thanh:** Nếu tệp âm thanh TTS được tạo ra có kích thước dưới 512 KB, nó sẽ được trả về trực tiếp (inline) trong trường `audio_base64` (mã hóa dưới dạng base64) và trường `assistant_audio_url` nhận giá trị `null`. Ngược lại, trường `assistant_audio_url` sẽ chứa một đường dẫn phát trực tuyến thông qua `GET /api/audio/{key}` và trường `audio_base64` sẽ là một chuỗi rỗng.

### Pipeline LangGraph

Mỗi lượt gọi tới `/respond` sẽ chạy tuần tự qua các node sau:

1. **Preflight** — Cuộc gọi LLM đơn: kiểm tra tính an toàn + phát hiện ý định sử dụng tool (người dùng có muốn tương tác với flashcard không?)
2. **Respond** — Cuộc gọi LLM chính có ràng buộc các công cụ (flashcard tools, grammar tools)
3. **Tools** (tùy chọn) — Thực thi các cuộc gọi công cụ (tạo deck, học thẻ, v.v.) nếu LLM yêu cầu
4. **TTS** — Chuyển phản hồi văn bản thành âm thanh qua ElevenLabs

Pipeline có giới hạn tối đa 5 lượt lặp gọi tool để ngăn chặn các vòng lặp vô hạn.

### Hệ Thống Bảo Vệ (Guardrails)

- **Đầu vào (Input):** Phát hiện prompt injection, giới hạn tần suất gửi yêu cầu cho mỗi người dùng, kiểm tra hợp lệ dữ liệu, kiểm soát độ dài ký tự tối đa
- **Đầu ra (Output):** Che giấu các thông tin cá nhân nhạy cảm (PII) qua regex (số điện thoại, email, số an sinh xã hội, số thẻ tín dụng)
- Việc vi phạm Guardrails sẽ trả về lỗi HTTP 400 (đầu vào không hợp lệ / phát hiện prompt injection) hoặc HTTP 429 (vượt quá giới hạn lượt gọi cho phép)

---

## POST /api/chat/transcribe

Endpoint chuyên nhận diện giọng nói (STT) gọn nhẹ. Không gọi LLM, không sinh âm thanh TTS. Chỉ trả về văn bản nhận diện được.

**Loại Nội Dung (Content-Type):** `multipart/form-data`

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `audio_file` | file | Có | File âm thanh để nhận diện (mp3/wav/ogg/webm/m4a, tối đa 25 MB) |

```bash
curl -X POST http://localhost:8000/api/chat/transcribe \
  -H "Authorization: Bearer <token>" \
  -F "audio_file=@recording.webm"
```

**Phản hồi mã 200 (OK):**
```json
{ "text": "I grew up in a small coastal town." }
```
