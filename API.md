# API Documentation

Tài liệu này mô tả API hiện tại của dự án AI Speaking Coach, cách xác thực, cách lưu dữ liệu học tập, và cách dùng các endpoint chính.

## 1. Tổng quan

Backend là một FastAPI service. Khi chạy local, bạn có:

- API gốc: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI spec: `http://127.0.0.1:8000/openapi.json`

API phục vụ luồng học nói IELTS:

- đăng ký, đăng nhập, đăng xuất
- xem topics
- tạo và quản lý practice session
- chat text/audio
- xem lịch sử, evaluation, và audio

## 2. Chạy backend

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload
```

Biến môi trường quan trọng:

- `API_BASE_URL`: base URL để test hoặc gọi API từ script
- `DATABASE_PATH`: file SQLite chính
- `UPLOAD_DIR`: nơi lưu file audio người dùng tải lên
- `DEFAULT_MODEL`, `DEFAULT_VOICE`: giá trị mặc định cho cấu hình người dùng

## 3. Xác thực

Các endpoint trừ `/health`, `/topics`, `/auth/register`, `/auth/login` đều cần bearer token.

Header:

```http
Authorization: Bearer <access_token>
```

Token được tạo sau khi đăng ký hoặc đăng nhập.

## 4. Dữ liệu lưu trữ

Dự án hiện lưu 3 nhóm dữ liệu chính:

- `practice_sessions`: gom nhiều lượt làm bài vào một buổi học
- `messages`: lưu từng lượt chat, transcript, audio path, attempt number, duration, word count, pause count
- `message_evaluations`: lưu điểm chi tiết và feedback của từng lượt

Điều này đủ cho MVP để:

- xem lại lịch sử học
- biết mỗi lượt thuộc buổi học nào
- theo dõi số lần làm theo topic
- phân tích tiến bộ sâu hơn theo thời lượng, số từ, khoảng ngắt, và điểm chi tiết

## 5. Danh sách endpoint

| Method | Path | Auth | Mục đích |
| --- | --- | --- | --- |
| `GET` | `/health` | Không | Kiểm tra service sống |
| `POST` | `/auth/register` | Không | Tạo user và cấp token |
| `POST` | `/auth/login` | Không | Đăng nhập và cấp token |
| `GET` | `/auth/me` | Có | Lấy thông tin user hiện tại |
| `POST` | `/auth/logout` | Có | Hủy token hiện tại |
| `GET` | `/topics` | Không | Lấy danh sách topics |
| `GET` | `/topics/{topic_id}` | Không | Lấy chi tiết một topic |
| `GET` | `/config` | Có | Lấy model/voice hiện tại |
| `POST` | `/config/model` | Có | Cập nhật model |
| `POST` | `/config/voice` | Có | Cập nhật voice |
| `POST` | `/practice-sessions` | Có | Tạo practice session |
| `GET` | `/practice-sessions` | Có | Lấy danh sách session |
| `GET` | `/practice-sessions/{session_id}` | Có | Lấy chi tiết session |
| `POST` | `/practice-sessions/{session_id}/close` | Có | Đóng session |
| `POST` | `/chat/text` | Có | Tạo lượt chat bằng text |
| `POST` | `/chat/audio` | Có | Tạo lượt chat bằng audio |
| `GET` | `/messages` | Có | Lấy lịch sử message |
| `GET` | `/messages/{message_id}` | Có | Lấy chi tiết một message |
| `GET` | `/evaluation/{message_id}` | Có | Lấy kết quả chấm điểm |
| `GET` | `/audio/{message_id}` | Có | Tải audio user/agent |

Ghi chú:

- `/history` đã được bỏ để API gọn hơn.
- `/messages` là endpoint chính để xem lịch sử.
- `practice_session_id` có thể dùng để lọc lịch sử theo buổi học.

## 6. Chi tiết từng endpoint

### 6.1 `GET /health`

Kiểm tra service đã chạy chưa.

Response:

```json
{
  "status": "ok",
  "service": "ai-speaking-coach-api",
  "log_level": "INFO"
}
```

### 6.2 `POST /auth/register`

Tạo user mới, tạo preferences mặc định, và cấp token.

Request:

```json
{
  "username": "smoke_user",
  "password": "SmokeTest123!",
  "display_name": "Smoke User"
}
```

Ràng buộc:

- `username`: 3-64 ký tự
- `password`: 8-128 ký tự
- `display_name`: 1-128 ký tự

Response:

```json
{
  "access_token": "token-value",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "smoke_user",
    "display_name": "Smoke User"
  }
}
```

Lỗi thường gặp:

- `409`: username đã tồn tại

### 6.3 `POST /auth/login`

Đăng nhập bằng username/password và cấp token mới.

Request:

```json
{
  "username": "demo_student",
  "password": "Demo@1234"
}
```

Response giống `/auth/register`.

Lỗi thường gặp:

- `401`: username hoặc password không đúng

### 6.4 `GET /auth/me`

Lấy user hiện tại từ bearer token.

Response:

```json
{
  "id": 1,
  "username": "demo_student",
  "display_name": "Demo Student"
}
```

### 6.5 `POST /auth/logout`

Xóa token hiện tại khỏi `user_sessions`.

Response:

```json
{
  "status": "ok"
}
```

### 6.6 `GET /topics`

Lấy danh sách topics dùng cho IELTS speaking.

Mỗi topic có:

- `id`
- `slug`
- `title`
- `description`
- `system_prompt`

Ví dụ:

```json
[
  {
    "id": 1,
    "slug": "part-1-self-introduction",
    "title": "IELTS Part 1 - Self Introduction",
    "description": "Warm-up questions about your background and daily life.",
    "system_prompt": "You are an IELTS speaking examiner..."
  }
]
```

### 6.7 `GET /topics/{topic_id}`

Lấy chi tiết một topic theo `topic_id`.

Response giống một item của `/topics`.

Lỗi thường gặp:

- `404`: topic không tồn tại

### 6.8 `GET /config`

Lấy cấu hình hiện tại của user.

Response:

```json
{
  "model_name": "gpt-4o-mini",
  "voice_name": "nova"
}
```

### 6.9 `POST /config/model`

Cập nhật model cho user hiện tại.

Request:

```json
{
  "value": "gpt-4o-mini"
}
```

Response:

```json
{
  "model_name": "gpt-4o-mini",
  "voice_name": "nova"
}
```

### 6.10 `POST /config/voice`

Cập nhật voice cho user hiện tại.

Request:

```json
{
  "value": "nova"
}
```

Response:

```json
{
  "model_name": "gpt-4o-mini",
  "voice_name": "nova"
}
```

### 6.11 `POST /practice-sessions`

Tạo một buổi học mới.

Request:

```json
{
  "title": "Smoke practice session",
  "topic_id": 1,
  "notes": "Created from smoke test."
}
```

Field:

- `title`: tùy chọn
- `topic_id`: tùy chọn, giúp gắn session với topic chính
- `notes`: tùy chọn

Response:

```json
{
  "id": 10,
  "user_id": 1,
  "topic_id": 1,
  "title": "Smoke practice session",
  "notes": "Created from smoke test.",
  "status": "active",
  "started_at": "2026-04-14T12:00:00+00:00",
  "ended_at": null,
  "created_at": "2026-04-14T12:00:00+00:00",
  "updated_at": "2026-04-14T12:00:00+00:00",
  "message_count": 0,
  "last_message_at": null
}
```

### 6.12 `GET /practice-sessions`

Lấy danh sách session của user hiện tại.

Response:

```json
{
  "items": [
    {
      "id": 10,
      "user_id": 1,
      "topic_id": 1,
      "title": "Smoke practice session",
      "notes": "Created from smoke test.",
      "status": "active",
      "started_at": "2026-04-14T12:00:00+00:00",
      "ended_at": null,
      "created_at": "2026-04-14T12:00:00+00:00",
      "updated_at": "2026-04-14T12:01:00+00:00",
      "message_count": 2,
      "last_message_at": "2026-04-14T12:01:00+00:00"
    }
  ]
}
```

### 6.13 `GET /practice-sessions/{session_id}`

Lấy chi tiết một session và toàn bộ message trong session đó.

Response:

```json
{
  "practice_session": {
    "id": 10,
    "user_id": 1,
    "topic_id": 1,
    "title": "Smoke practice session",
    "notes": "Created from smoke test.",
    "status": "active",
    "started_at": "2026-04-14T12:00:00+00:00",
    "ended_at": null,
    "created_at": "2026-04-14T12:00:00+00:00",
    "updated_at": "2026-04-14T12:01:00+00:00",
    "message_count": 2,
    "last_message_at": "2026-04-14T12:01:00+00:00"
  },
  "items": [
    {
      "id": 12,
      "practice_session_id": 10,
      "attempt_no": 2,
      "input_mode": "audio",
      "role": "user",
      "user_input_text": "...",
      "transcript_text": "...",
      "content_text": "...",
      "duration_seconds": 1,
      "word_count": 11,
      "pause_count": 0,
      "evaluation": {
        "message_id": 12,
        "grammar_score": 82,
        "vocabulary_score": 76,
        "fluency_score": 74,
        "coherence_score": 79,
        "lexical_resource_score": 75,
        "pronunciation_score": 88,
        "rubric_version": "v2.0"
      }
    }
  ]
}
```

### 6.14 `POST /practice-sessions/{session_id}/close`

Đóng session hiện tại.

Response:

```json
{
  "id": 10,
  "user_id": 1,
  "topic_id": 1,
  "title": "Smoke practice session",
  "notes": "Created from smoke test.",
  "status": "completed",
  "started_at": "2026-04-14T12:00:00+00:00",
  "ended_at": "2026-04-14T12:10:00+00:00",
  "created_at": "2026-04-14T12:00:00+00:00",
  "updated_at": "2026-04-14T12:10:00+00:00",
  "message_count": 2,
  "last_message_at": "2026-04-14T12:09:30+00:00"
}
```

### 6.15 `POST /chat/text`

Tạo một lượt luyện nói bằng text.

Request:

```json
{
  "topic_id": 1,
  "text": "I usually study English in the evening because it helps me relax.",
  "model_name": "gpt-4o-mini",
  "voice_name": "nova",
  "practice_session_id": 10
}
```

Ghi chú:

- `model_name` và `voice_name` là tùy chọn
- nếu bỏ trống, API dùng cấu hình hiện tại của user
- `practice_session_id` là tùy chọn
- nếu không truyền `practice_session_id`, backend sẽ tạo session mới hoặc dùng session đang mở phù hợp với cùng topic

Response rút gọn:

```json
{
  "status": "ok",
  "message": {
    "id": 12,
    "practice_session_id": 10,
    "attempt_no": 2,
    "input_mode": "text",
    "user_input_text": "I usually study English in the evening because it helps me relax.",
    "transcript_text": "I usually study English in the evening because it helps me relax.",
    "duration_seconds": 23,
    "word_count": 12,
    "pause_count": 0,
    "evaluation": {
      "message_id": 12,
      "transcript": "I usually study English in the evening because it helps me relax.",
      "grammar_score": 84,
      "vocabulary_score": 78,
      "fluency_score": 76,
      "coherence_score": 79,
      "lexical_resource_score": 77,
      "pronunciation_score": null,
      "corrected_text": "I usually study English in the evening because it helps me relax.",
      "feedback": ["..."],
      "rubric_version": "v2.0",
      "summary": "...",
      "is_mock": true,
      "created_at": "2026-04-14T12:00:00+00:00"
    }
  },
  "evaluation": {
    "message_id": 12,
    "transcript": "I usually study English in the evening because it helps me relax.",
    "grammar_score": 84,
    "vocabulary_score": 78,
    "fluency_score": 76,
    "coherence_score": 79,
    "lexical_resource_score": 77,
    "pronunciation_score": null,
    "corrected_text": "I usually study English in the evening because it helps me relax.",
    "feedback": ["..."],
    "rubric_version": "v2.0",
    "summary": "...",
    "is_mock": true,
    "created_at": "2026-04-14T12:00:00+00:00"
  },
  "transcript": "I usually study English in the evening because it helps me relax."
}
```

### 6.16 `POST /chat/audio`

Tạo một lượt luyện nói bằng audio upload.

Content type: `multipart/form-data`

Fields:

- `topic_id`: bắt buộc
- `audio_file`: bắt buộc
- `model_name`: tùy chọn
- `voice_name`: tùy chọn
- `practice_session_id`: tùy chọn

Ví dụ `curl`:

```bash
curl -X POST "http://127.0.0.1:8000/chat/audio" \
  -H "Authorization: Bearer <token>" \
  -F "topic_id=1" \
  -F "practice_session_id=10" \
  -F "model_name=gpt-4o-mini" \
  -F "voice_name=nova" \
  -F "audio_file=@sample.wav;type=audio/wav"
```

API sẽ:

- lưu file vào `data/uploads/<user_id>/<topic_slug>/`
- chạy scoring audio
- tạo message và evaluation tương tự endpoint text

### 6.17 `GET /messages`

Lấy danh sách message của user hiện tại.

Query param tùy chọn:

- `practice_session_id`: lọc theo session

Response:

```json
{
  "items": [
    {
      "id": 12,
      "practice_session_id": 10,
      "attempt_no": 2,
      "input_mode": "audio",
      "role": "user",
      "user_input_text": "...",
      "transcript_text": "...",
      "content_text": "...",
      "duration_seconds": 1,
      "word_count": 11,
      "pause_count": 0,
      "evaluation": {
        "message_id": 12,
        "grammar_score": 82,
        "vocabulary_score": 76,
        "fluency_score": 74,
        "coherence_score": 79,
        "lexical_resource_score": 75,
        "pronunciation_score": 88,
        "rubric_version": "v2.0"
      }
    }
  ]
}
```

### 6.18 `GET /messages/{message_id}`

Lấy chi tiết một message theo `message_id`.

Response:

```json
{
  "message": { },
  "evaluation": { }
}
```

Lỗi thường gặp:

- `404`: message không tồn tại hoặc không thuộc user hiện tại

### 6.19 `GET /evaluation/{message_id}`

Lấy riêng kết quả chấm điểm của một message.

Response:

```json
{
  "message_id": 12,
  "transcript": "...",
  "grammar_score": 82,
  "vocabulary_score": 76,
  "fluency_score": 74,
  "coherence_score": 79,
  "lexical_resource_score": 75,
  "pronunciation_score": 88,
  "corrected_text": "...",
  "feedback": ["..."],
  "rubric_version": "v2.0",
  "summary": "...",
  "is_mock": true,
  "created_at": "2026-04-14T12:00:00+00:00"
}
```

### 6.20 `GET /audio/{message_id}`

Tải audio của message dưới dạng file `audio/wav`.

Query param:

- `kind=user` lấy audio người dùng
- `kind=agent` lấy audio phản hồi của hệ thống, mặc định

Ví dụ:

```bash
curl -L \
  -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8000/audio/12?kind=user" \
  --output user.wav
```

Lỗi thường gặp:

- `400`: `kind` không hợp lệ
- `404`: message không tồn tại, không có file audio, hoặc file trên disk đã bị xóa

## 7. Các model dữ liệu chính

### PracticeSession

- `id`
- `user_id`
- `topic_id`
- `title`
- `notes`
- `status`
- `started_at`
- `ended_at`
- `created_at`
- `updated_at`
- `message_count`
- `last_message_at`

### Message

- `id`
- `practice_session_id`
- `attempt_no`
- `input_mode`
- `user_input_text`
- `transcript_text`
- `user_audio_path`
- `duration_seconds`
- `word_count`
- `pause_count`
- `agent_reply_text`
- `agent_audio_path`
- `model_name`
- `voice_name`
- `created_at`

### Evaluation

- `message_id`
- `transcript`
- `grammar_score`
- `vocabulary_score`
- `fluency_score`
- `coherence_score`
- `lexical_resource_score`
- `pronunciation_score`
- `corrected_text`
- `feedback`
- `rubric_version`
- `summary`
- `is_mock`
- `created_at`

## 8. Ghi chú vận hành

- `POST /chat/audio` lưu file ra disk, không chỉ lưu metadata
- `GET /audio/{message_id}` đọc lại file từ đường dẫn đã lưu
- `/messages` trả dữ liệu của user đang đăng nhập
- `/practice-sessions/{session_id}` là cách tốt nhất để xem toàn bộ một buổi học

## 9. Ví dụ nhanh end-to-end

### Đăng ký và lấy token

```bash
curl -X POST "http://127.0.0.1:8000/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"smoke_user","password":"SmokeTest123!","display_name":"Smoke User"}'
```

### Gọi topics

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8000/topics"
```

### Tạo practice session

```bash
curl -X POST "http://127.0.0.1:8000/practice-sessions" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Session 1","topic_id":1,"notes":"Warm-up"}'
```

### Chat text

```bash
curl -X POST "http://127.0.0.1:8000/chat/text" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"topic_id":1,"text":"I usually study English in the evening.","practice_session_id":10}'
```

### Xem lịch sử theo session

```bash
curl -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8000/messages?practice_session_id=10"
```

## 10. Kết luận

API hiện tại đã đủ tốt cho MVP và có thêm các phần chuyên nghiệp hơn cho bản sau:

- practice sessions để gom nhiều lượt học
- attempt number theo topic
- rubric version cho chấm điểm
- breakdown score chi tiết hơn
- duration, word count, pause count để phân tích tiến bộ

Nếu muốn, bước tiếp theo có thể là tạo thêm bản tiếng Anh ngắn gọn cho đội kỹ thuật hoặc thêm Postman collection.
