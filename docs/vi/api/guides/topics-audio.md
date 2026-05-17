# Hướng Dẫn Chủ Đề & Âm Thanh (Topics & Audio Guide)

---

## GET /api/topics/get_categories_topics

Trả về toàn bộ các danh mục chủ đề đang hoạt động (active categories) cùng với các chủ đề luyện tập đang hoạt động bên trong (active topics), được sắp xếp theo thứ tự hiển thị `sort_order`.

Không yêu cầu xác thực người dùng.

```bash
curl http://localhost:8000/api/topics/get_categories_topics
```

**Phản hồi mã 200 (OK):**
```json
[
  {
    "code": "daily_life",
    "title": "Daily Life",
    "sort_order": 1,
    "topics": [
      {
        "code": "hometown",
        "title": "Hometown",
        "description": "Talk about where you grew up.",
        "difficulty_level": "beginner",
        "sort_order": 1
      },
      {
        "code": "daily_routine",
        "title": "Daily Routine",
        "description": "Describe your typical day.",
        "difficulty_level": "beginner",
        "sort_order": 2
      }
    ]
  }
]
```

**Các mức độ khó (Difficulty levels):** `beginner` (sơ cấp), `intermediate` (trung cấp), `advanced` (cao cấp).

Sử dụng giá trị của khóa `code` trong topic (ví dụ: `"hometown"`) để truyền vào trường `topic` khi bạn gọi API trò chuyện `POST /api/chat/respond`.

---

## GET /api/audio/{storage_key}

Phát trực tuyến (stream) một tệp âm thanh được lưu trữ từ hệ thống MinIO. Thường dùng để phát lại các phản hồi giọng nói của trợ lý AI được tạo từ ElevenLabs TTS.

**Yêu cầu bắt buộc phải xác thực (Bearer JWT token).** Giá trị `storage_key` được lấy từ trường `assistant_audio_url` trong phản hồi của API `/api/chat/respond` (bằng cách lược bỏ tiền tố `/api/audio/`).

```bash
curl http://localhost:8000/api/audio/tts/conv-id/msg-id.mp3 \
  -H "Authorization: Bearer <token>" \
  --output response_audio.mp3
```

**Phản hồi:** Trả về luồng âm thanh dạng nhị phân với header `Content-Type: audio/mpeg` (hoặc loại MIME thực tế được lưu trữ trong MinIO).

**Bộ nhớ đệm (Cache):** Phản hồi đính kèm header `Cache-Control: private, max-age=3600` (hiệu lực trong 1 giờ). Trình duyệt của người dùng sẽ lưu trữ tệp âm thanh này và phát lại trực tiếp mà không cần tải lại từ server trong vòng 1 giờ.

**Các lỗi thường gặp:**
- `404` — tệp âm thanh không tìm thấy trong MinIO (có thể đã bị xóa hoặc key bị sai)
- `401` — thiếu mã JWT token hoặc token không hợp lệ
