# Hướng Dẫn Hội Thoại (Conversations Guide)

Một cuộc hội thoại (conversation) là một phiên luyện tập giữa người dùng và AI về một chủ đề cụ thể. Các cuộc hội thoại lưu trữ lịch sử tin nhắn và theo dõi siêu dữ liệu của phiên học đó.

---

## Vòng Đời (Lifecycle)

```
được tạo (qua POST /api/chat/respond) → đang hoạt động (active) → đã hoàn thành | bị bỏ dở
                                                                               ↓
                                                                     xóa mềm (đặt deleted_at)
```

- **Tối đa 5 cuộc hội thoại đang hoạt động trên mỗi chủ đề cho mỗi người dùng.** Số thứ tự phiên học (`session_number`) sẽ tính tổng số phiên học từng được tạo từ trước đến nay (bao gồm cả các phiên đã xóa).
- Các cuộc hội thoại được xóa mềm (soft-deleted) — chúng sẽ bị lọc bỏ khỏi danh sách phản hồi nhưng thông tin vẫn được lưu trữ nguyên vẹn trong cơ sở dữ liệu.

---

## Danh Sách Các Cuộc Hội Thoại (List Conversations)

```bash
curl http://localhost:8000/api/conversations \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "conversations": [
    {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "title": null,
      "status": "active",
      "started_at": "2026-05-16T10:00:00Z",
      "ended_at": null,
      "topic_id": "abc...",
      "topic_code": "hometown",
      "cleared_at": null
    }
  ]
}
```

---

## Lấy Danh Sách Cuộc Hội Thoại Theo Chủ Đề (Get Conversations for a Topic)

Trả về tối đa 5 cuộc hội thoại của một chủ đề cụ thể, kèm theo số thứ tự phiên học.

```bash
curl "http://localhost:8000/api/conversations/for-topic?topic_code=hometown" \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "topic_code": "hometown",
  "topic_title": "Hometown",
  "conversations": [
    {
      "id": "3fa85f64-...",
      "title": null,
      "status": "active",
      "session_number": 3,
      "started_at": "2026-05-16T10:00:00Z",
      "updated_at": "2026-05-16T10:05:00Z"
    }
  ],
  "total": 3,
  "limit_reached": false
}
```

---

## Lấy Thông Tin Thống Kê (Get Statistics)

```bash
curl http://localhost:8000/api/conversations/stats \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "sessions": [
    {
      "id": "3fa85f64-...",
      "topic": "Hometown",
      "topic_code": "hometown",
      "started_at": "2026-05-16T10:00:00Z",
      "duration_ms": 720000,
      "avg_score": 78.5,
      "user_message_count": 18,
      "scores": {
        "pronunciation": 77.5,
        "fluency": 78.0,
        "accuracy": 85.0
      }
    }
  ]
}
```

---

## Lấy Tin Nhắn Kèm Điểm Phát Âm (Get Messages with Pronunciation Scores)

```bash
curl http://localhost:8000/api/conversations/3fa85f64-.../messages-with-scores \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "conversation_id": "3fa85f64-...",
  "messages": [
    {
      "id": "...",
      "role": "user",
      "input_mode": "audio",
      "text_content": "I grew up in a small coastal town.",
      "created_at": "2026-05-16T10:01:00Z",
      "suggestions": [],
      "audio_url": "/api/audio/user_input/...",
      "assistant_audio_url": null,
      "score": {
        "overall_score": 82.5,
        "accuracy_score": 85.0,
        "fluency_score": 78.0,
        "completeness_score": 90.0,
        "prosody_score": 77.5,
        "words": []
      }
    }
  ]
}
```

---

## Cập Nhật Cuộc Hội Thoại (Update Conversation)

Đánh dấu một cuộc hội thoại là đã kết thúc bằng cách thiết lập thời điểm `ended_at = NOW()`. Không yêu cầu dữ liệu gửi lên trong phần thân (body) của request.

```bash
curl -X PATCH http://localhost:8000/api/conversations/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 204** (Thành công nhưng không có nội dung trả về). Hành động này kích hoạt việc tính toán khoảng thời gian (duration) luyện tập để phục vụ cho các thống kê trên dashboard.

---

## Xóa Lịch Sử Tin Nhắn (Clear Message History)

Ẩn lịch sử tin nhắn hiển thị tính từ thời điểm hiện tại trở đi (thiết lập trường `cleared_at`). Các tin nhắn cũ sẽ không bị xóa thực sự — chúng chỉ không xuất hiện trong ngữ cảnh LLM trong các lượt trò chuyện tương lai hoặc trong phản hồi của endpoint lấy tin nhắn kèm điểm.

```bash
curl -X POST http://localhost:8000/api/conversations/3fa85f64-.../clear \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 204** (Thành công nhưng không có nội dung trả về).

---

## Xóa Cuộc Hội Thoại (Delete Conversation)

Thực hiện xóa mềm cuộc hội thoại (thiết lập trường `deleted_at`). Cuộc hội thoại đã xóa sẽ không còn bị tính vào giới hạn tối đa 5 cuộc hội thoại đang hoạt động trên mỗi chủ đề.

```bash
curl -X DELETE http://localhost:8000/api/conversations/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 204** (Thành công nhưng không có nội dung trả về).
