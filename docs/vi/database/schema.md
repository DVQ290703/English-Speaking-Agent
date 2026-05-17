# Đặc Tả Schema (Schema Reference)

Đặc tả chi tiết cấp độ cột cho toàn bộ 22 bảng trong tệp tin `db_schema/schema.sql`.

---

## users

Bảng chứa tài khoản người dùng chính. Hỗ trợ cả người dùng đăng nhập bằng email/mật khẩu và người dùng chỉ đăng nhập bằng OAuth (trường `password_hash` có thể nhận giá trị `NULL`). Email sử dụng kiểu dữ liệu `CITEXT` để so khớp không phân biệt chữ hoa/chữ thường. Tài khoản đăng nhập qua số điện thoại của Facebook có thể có trường email là `NULL`.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| email | CITEXT | YES | — | Địa chỉ email duy nhất; nhận giá trị NULL đối với tài khoản OAuth chỉ dùng số điện thoại |
| password_hash | TEXT | YES | — | Mã băm Bcrypt; nhận giá trị NULL đối với người dùng chỉ đăng nhập bằng OAuth |
| display_name | VARCHAR(100) | YES | — | Tên hiển thị công khai |
| avatar_url | TEXT | YES | — | Đường dẫn ảnh đại diện |
| english_level | TEXT | YES | — | Trình độ tiếng Anh tự báo cáo theo chuẩn CEFR |
| is_active | BOOLEAN | NO | TRUE | Cờ xóa mềm (Soft-delete) |
| email_verified | BOOLEAN | NO | FALSE | Đánh dấu email đã được xác minh hay chưa |
| email_verified_at | TIMESTAMPTZ | YES | — | Thời điểm email được xác minh thành công |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các ràng buộc (Constraints):** `UNIQUE (email)`, `CHECK (english_level IN ('A1','A2','B1','B2','C1','C2'))`
**Các trigger:** `trg_users_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## password_reset_tokens

Các mã token có hiệu lực ngắn hạn phục vụ cho luồng đặt lại mật khẩu của người dùng. Hệ thống chỉ lưu lại mã băm (hash) của token để bảo mật; mã token gốc ở dạng thô sẽ được gửi trực tiếp đến email người dùng.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| token_hash | TEXT | NO | — | Băm SHA-256 của mã token đặt lại mật khẩu gốc |
| expires_at | TIMESTAMPTZ | NO | — | Thời điểm token hết hạn |
| used_at | TIMESTAMPTZ | YES | — | Thời điểm token được sử dụng để đổi mật khẩu |
| revoked_at | TIMESTAMPTZ | YES | — | Thời điểm token bị thu hồi/vô hiệu hóa sớm |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các chỉ mục (Indexes):** `idx_password_reset_tokens_user_id`, `idx_password_reset_tokens_expires_at`
**Các ràng buộc (Constraints):** `UNIQUE (token_hash)`

---

## auth_sessions

Quản lý phiên làm việc lâu dài bằng refresh-token, được giới hạn riêng cho từng cặp người dùng + thiết bị. Khi cơ chế xoay vòng refresh token hoạt động, trường `refresh_token_hash` sẽ được cập nhật trực tiếp tại chỗ.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| device_id | TEXT | NO | — | Mã định danh thiết bị do client tự tạo |
| device_name | TEXT | YES | — | Tên thiết bị dễ đọc |
| refresh_token_hash | TEXT | NO | — | Mã băm của refresh token hiện tại |
| ip_address | INET | YES | — | Địa chỉ IP của client khi khởi tạo phiên làm việc |
| user_agent | TEXT | YES | — | Chuỗi User-Agent đại diện cho trình duyệt/ứng dụng của client |
| expires_at | TIMESTAMPTZ | NO | — | Thời điểm phiên làm việc hết hạn cứng |
| revoked_at | TIMESTAMPTZ | YES | — | Thời điểm đăng xuất hoặc phiên bị cưỡng chế thu hồi |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| last_seen_at | TIMESTAMPTZ | NO | NOW() | Được cập nhật mới sau mỗi lượt refresh token thành công |

**Các chỉ mục (Indexes):** `idx_auth_sessions_user_id`, `idx_auth_sessions_expires_at`, `idx_auth_sessions_token_hash`
**Các ràng buộc (Constraints):** `UNIQUE (user_id, device_id)` — tên alias: `uq_auth_sessions_user_device`

---

## oauth_accounts

Lưu thông tin định danh liên kết tài khoản mạng xã hội (OAuth) của người dùng. Một người dùng có thể liên kết nhiều tài khoản mạng xã hội khác nhau (mỗi nhà cung cấp tương ứng với một dòng).

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| provider | TEXT | NO | — | Tên nhà cung cấp dịch vụ OAuth |
| provider_user_id | TEXT | NO | — | Mã ID người dùng do nhà cung cấp OAuth cấp |
| provider_email | CITEXT | YES | — | Email được báo cáo từ nhà cung cấp OAuth |
| provider_email_verified | BOOLEAN | NO | FALSE | Trạng thái email đã được xác minh từ phía đối tác chưa |
| provider_display_name | TEXT | YES | — | Tên hiển thị báo cáo từ nhà cung cấp OAuth |
| provider_avatar_url | TEXT | YES | — | Đường dẫn ảnh đại diện từ nhà cung cấp OAuth |
| provider_tenant_id | TEXT | YES | — | Microsoft Entra tenant ID (nếu có áp dụng) |
| granted_scopes | TEXT | YES | — | Các quyền (scopes) OAuth được cấp, ngăn cách bởi dấu cách |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_oauth_accounts_user_id`, `idx_oauth_accounts_provider_email`
**Các ràng buộc (Constraints):** `UNIQUE (provider, provider_user_id)` — alias `uq_oauth_accounts_provider_user`; `CHECK (provider IN ('google', 'microsoft', 'facebook'))`
**Các trigger:** `trg_oauth_accounts_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## categories

Bảng chứa các nhóm danh mục cấp cao nhất dùng để phân loại các chủ đề hội thoại trò chuyện (ví dụ: "IELTS Part 1 – Personal Topics").

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| code | TEXT | NO | — | Mã rút gọn duy nhất dành cho hệ thống đọc |
| title | TEXT | NO | — | Tên danh mục hiển thị dễ đọc cho người dùng |
| sort_order | INT | NO | 0 | Thứ tự sắp xếp hiển thị trên giao diện |
| is_active | BOOLEAN | NO | TRUE | Cờ xóa mềm / cờ cho phép hiển thị |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các ràng buộc (Constraints):** `UNIQUE (code)`
**Các trigger:** `trg_categories_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## topics

Các chủ đề hội thoại luyện nói chi tiết nằm bên trong một danh mục cụ thể.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| category_id | UUID | NO | — | Khóa ngoại → categories(id) ON DELETE RESTRICT |
| code | TEXT | NO | — | Mã rút gọn duy nhất dành cho hệ thống đọc |
| title | TEXT | NO | — | Tên chủ đề hiển thị cho người dùng |
| description | TEXT | YES | — | Mô tả chi tiết về chủ đề để định hướng cuộc gọi trò chuyện |
| difficulty_level | TEXT | YES | — | Nhãn phân loại mức độ khó của chủ đề |
| sort_order | INT | NO | 0 | Thứ tự sắp xếp hiển thị trên giao diện |
| is_active | BOOLEAN | NO | TRUE | Cờ xóa mềm / cờ cho phép hiển thị |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_topics_category_id`
**Các ràng buộc (Constraints):** `UNIQUE (code)`, `CHECK (difficulty_level IN ('beginner','intermediate','advanced'))`
**Các trigger:** `trg_topics_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## user_topic_preferences

Theo dõi tần suất người dùng đã luyện tập đối với từng chủ đề cụ thể và điểm độ thành thạo tương ứng của họ. Bảng sử dụng khóa chính hỗn hợp gồm hai trường: `user_id` + `topic_id`.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| user_id | UUID | NO | — | Khóa chính phần 1, Khóa ngoại → users(id) ON DELETE CASCADE |
| topic_id | UUID | NO | — | Khóa chính phần 2, Khóa ngoại → topics(id) ON DELETE CASCADE |
| proficiency_score | NUMERIC(5,2) | YES | — | Điểm ước lượng kỹ năng từ 0–100 cho chủ đề này |
| practice_count | INT | NO | 0 | Tổng số phiên người dùng đã luyện tập chủ đề này |
| last_practiced_at | TIMESTAMPTZ | YES | — | Thời điểm luyện tập gần đây nhất |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các ràng buộc (Constraints):** `PRIMARY KEY (user_id, topic_id)`, `CHECK (proficiency_score BETWEEN 0 AND 100)`

---

## conversations

Lưu thông tin một phiên luyện tập giao tiếp duy nhất giữa người dùng và trợ lý AI. Hỗ trợ xóa mềm thông qua trường `deleted_at` và hỗ trợ ẩn lịch sử hội thoại hiển thị thông qua trường `cleared_at`.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| topic_id | UUID | YES | — | Khóa ngoại → topics(id) ON DELETE SET NULL |
| title | TEXT | YES | — | Tiêu đề tùy chọn do người dùng đặt hoặc AI tự động đặt |
| status | TEXT | NO | 'active' | Trạng thái vòng đời của cuộc hội thoại |
| cleared_at | TIMESTAMPTZ | YES | — | Thời điểm người dùng yêu cầu ẩn lịch sử tin nhắn |
| deleted_at | TIMESTAMPTZ | YES | — | Thời điểm người dùng thực hiện xóa mềm cuộc hội thoại |
| started_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cuộc hội thoại bắt đầu |
| ended_at | TIMESTAMPTZ | YES | — | Thời điểm cuộc hội thoại kết thúc |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_conversations_user_started (user_id, started_at DESC)`, `idx_conversations_topic`, `idx_conversations_cleared_at (partial: WHERE cleared_at IS NOT NULL)`, `idx_conversations_deleted_at (partial: WHERE deleted_at IS NOT NULL)`
**Các ràng buộc (Constraints):** `CHECK (status IN ('active','completed','abandoned'))`
**Các trigger:** `trg_conversations_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## turns

Đại diện cho một đơn vị lượt nói trao đổi gồm (người dùng nói đầu vào + trợ lý phản hồi đầu ra) bên trong một cuộc hội thoại cụ thể. Số thứ tự lượt nói là tăng dần tuần tự và duy nhất trong mỗi cuộc hội thoại.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| conversation_id | UUID | NO | — | Khóa ngoại → conversations(id) ON DELETE CASCADE |
| turn_number | INT | NO | — | Chỉ số lượt nói tuần tự bắt đầu từ 1 |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các ràng buộc (Constraints):** `UNIQUE (conversation_id, turn_number)` — alias `uq_turns_conv_turn`

---

## messages

Lưu thông tin chi tiết các tin nhắn đơn lẻ (của người dùng, của trợ lý, hoặc cấu hình hệ thống system) nằm bên trong một lượt nói (turn).

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| conversation_id | UUID | NO | — | Khóa ngoại → conversations(id) ON DELETE CASCADE |
| turn_id | UUID | YES | — | Khóa ngoại → turns(id) ON DELETE CASCADE |
| role | TEXT | NO | — | Vai trò của đối tượng nói |
| input_mode | TEXT | YES | — | Phương thức người dùng nhập dữ liệu đầu vào |
| text_content | TEXT | YES | — | Nội dung văn bản hiển thị cuối cùng |
| raw_content | TEXT | YES | — | Văn bản gốc chưa xử lý (ví dụ: nhận diện STT thô) |
| suggestions | JSONB | NO | '[]' | Các gợi ý phản hồi nhanh hoặc các cụm từ gợi ý sửa lỗi |
| language_code | TEXT | YES | — | Mã chuẩn ngôn ngữ BCP-47 (ví dụ: `en-US`) |
| token_count | INT | YES | — | Số lượng token LLM tiêu thụ |
| model_name | TEXT | YES | — | Tên mô hình LLM đã sinh ra tin nhắn này |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các chỉ mục (Indexes):** `idx_messages_conversation_created (conversation_id, created_at)`, `idx_messages_turn_id`
**Các ràng buộc (Constraints):** `CHECK (role IN ('user', 'assistant', 'system'))`, `CHECK (input_mode IN ('text', 'audio'))`, `CHECK (language_code ~ '^[a-z]{2}(-[A-Z]{2})?$')`

---

## audio_assets

Siêu dữ liệu chi tiết quản lý lưu trữ của các tệp âm thanh ghi âm — bao gồm tệp ghi âm do người dùng tải lên và các tệp âm thanh phản hồi TTS của trợ lý AI. Mỗi tin nhắn có tối đa một tệp âm thanh cho từng loại.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| message_id | UUID | NO | — | Khóa ngoại → messages(id) ON DELETE CASCADE |
| audio_type | TEXT | NO | — | Định nghĩa tệp âm thanh này là của người dùng hay trợ lý TTS |
| storage_provider | TEXT | NO | — | Nhà cung cấp lưu trữ tệp ở backend |
| storage_key | TEXT | NO | — | Khóa/đường dẫn tệp nằm trong dịch vụ lưu trữ |
| public_url | TEXT | YES | — | Đường dẫn truy cập công khai (pre-signed hoặc CDN) |
| mime_type | TEXT | YES | — | Kiểu MIME của tệp âm thanh (ví dụ: `audio/webm`) |
| duration_ms | INT | YES | — | Thời lượng âm thanh tính theo đơn vị mili giây |
| sample_rate_hz | INT | YES | — | Tần số lấy mẫu âm thanh tính theo Hz |
| size_bytes | BIGINT | YES | — | Dung lượng tệp tính bằng byte |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các chỉ mục (Indexes):** `idx_audio_assets_message_id`
**Các ràng buộc (Constraints):** `UNIQUE (message_id, audio_type)` — alias `uq_audio_assets_message_type`; `CHECK (audio_type IN ('user_input', 'assistant_tts'))`, `CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio'))`

---

## pronunciation_assessments

Kết quả đánh giá chất lượng phát âm tổng thể từ dịch vụ Azure Cognitive Services đối với một tệp ghi âm của người dùng. Mỗi tin nhắn chỉ có tối đa một bản ghi đánh giá tương ứng.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| message_id | UUID | YES | — | Khóa ngoại → messages(id) ON DELETE CASCADE |
| user_id | UUID | YES | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| reference_text | TEXT | YES | — | Văn bản mẫu mà người dùng cần phải đọc theo |
| recognized_text | TEXT | YES | — | Văn bản thực tế hệ thống Azure đã nhận diện được |
| recognition_status | TEXT | YES | — | Trạng thái nhận diện của Azure (ví dụ: `Success`, `NoMatch`) |
| overall_score | NUMERIC(5,2) | YES | — | Điểm phát âm tổng hợp (composite score) 0–100 |
| accuracy_score | NUMERIC(5,2) | YES | — | Điểm độ chính xác phát âm âm vị 0–100 |
| fluency_score | NUMERIC(5,2) | YES | — | Điểm độ trôi chảy tự nhiên 0–100 |
| completeness_score | NUMERIC(5,2) | YES | — | Điểm độ hoàn thiện câu từ (chỉ ở chế độ scripted) 0–100 |
| prosody_score | NUMERIC(5,2) | YES | — | Điểm nhịp điệu và ngữ điệu câu nói 0–100 |
| nbest_confidence | NUMERIC(6,4) | YES | — | Giá trị độ tin cậy của kết quả tốt nhất (NBest) |
| snr | NUMERIC(8,3) | YES | — | Tỷ lệ tín hiệu trên nhiễu (Signal-to-noise ratio) |
| offset_ticks | BIGINT | YES | — | Thời điểm bắt đầu nói tính bằng tick (mỗi tick = 100 ns) |
| duration_ticks | BIGINT | YES | — | Thời lượng của câu nói tính bằng tick (100 ns) |
| error_rate | NUMERIC(6,3) | YES | — | Tỷ lệ lỗi từ nói (Word error rate) |
| azure_request_id | TEXT | YES | — | Mã định danh yêu cầu liên kết của Azure để đối soát |
| raw_result_json | JSONB | NO | '{}' | Phản hồi JSON gốc đầy đủ từ Azure phục vụ lưu vết/gỡ lỗi |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các chỉ mục (Indexes):** `uq_pron_assessment_message (UNIQUE trên message_id)`, `idx_pron_assessments_created`
**Các ràng buộc (Constraints):** Tất cả các cột điểm số đều có ràng buộc: `CHECK (score BETWEEN 0 AND 100)`

---

## pronunciation_word_details

Phân tích chi tiết mức độ phát âm chính xác và nhịp điệu (prosody) đối với từng từ riêng lẻ trong một bản đánh giá phát âm.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| assessment_id | UUID | NO | — | Khóa ngoại → pronunciation_assessments(id) ON DELETE CASCADE |
| word_index | INT | NO | — | Vị trí của từ trong câu nói (bắt đầu từ 0) |
| word | TEXT | NO | — | Nội dung văn bản của từ |
| accuracy_score | NUMERIC(5,2) | YES | — | Điểm độ chính xác của từ 0–100 |
| error_type | TEXT | YES | — | Phân loại lỗi phát âm áp dụng cho từ này |
| offset_ticks | BIGINT | YES | — | Thời điểm bắt đầu từ tính bằng tick (100 ns) |
| duration_ticks | BIGINT | YES | — | Thời lượng phát âm từ tính bằng tick (100 ns) |
| break_error_types | TEXT[] | YES | — | Mảng các lỗi ngắt nghỉ (ví dụ: `["UnexpectedBreak"]`) |
| unexpected_break_confidence | NUMERIC(6,4) | YES | — | Độ tin cậy xảy ra lỗi ngắt nghỉ không mong muốn |
| missing_break_confidence | NUMERIC(6,4) | YES | — | Độ tin cậy bị thiếu khoảng nghỉ cần thiết |
| break_length_ticks | BIGINT | YES | — | Thời lượng khoảng ngắt nghỉ tính bằng tick (100 ns) |
| intonation_error_types | TEXT[] | YES | — | Mảng các lỗi ngữ điệu áp dụng (ví dụ: `["Monotone"]`) |
| monotone_confidence | NUMERIC(6,4) | YES | — | Độ tin cậy giọng nói bị đều đều đơn điệu |

**Các chỉ mục (Indexes):** `idx_pron_word_assessment`
**Các ràng buộc (Constraints):** `UNIQUE (assessment_id, word_index)` — alias `uq_pron_word_position`; `CHECK (error_type IN ('None','Omission','Insertion','Mispronunciation','UnexpectedBreak','MissingBreak','Monotone'))`

---

## pronunciation_syllable_details

Phân tích độ chính xác chi tiết của từng âm tiết bên trong một từ ứng với kết quả chấm điểm phát âm.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| word_detail_id | UUID | NO | — | Khóa ngoại → pronunciation_word_details(id) ON DELETE CASCADE |
| syllable_index | INT | NO | — | Vị trí âm tiết trong từ (bắt đầu từ 0) |
| syllable | TEXT | NO | — | Dạng phiên âm ngữ âm (ví dụ: `"tax"`) |
| grapheme | TEXT | YES | — | Dạng chữ viết thực tế (ví dụ: `"to"`) |
| accuracy_score | NUMERIC(5,2) | YES | — | Điểm độ chính xác của âm tiết từ 0–100 |
| offset_ticks | BIGINT | YES | — | Thời điểm bắt đầu âm tiết tính bằng tick (100 ns) |
| duration_ticks | BIGINT | YES | — | Thời lượng phát âm âm tiết tính bằng tick (100 ns) |

**Các chỉ mục (Indexes):** `idx_pron_syllable_word`
**Các ràng buộc (Constraints):** `UNIQUE (word_detail_id, syllable_index)` — alias `uq_pron_syllable_position`

---

## pronunciation_phoneme_details

Phân tích độ chính xác của từng âm vị (ký tự phiên âm nhỏ nhất) bên trong một từ ứng với kết quả chấm điểm phát âm.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| word_detail_id | UUID | NO | — | Khóa ngoại → pronunciation_word_details(id) ON DELETE CASCADE |
| phoneme_index | INT | NO | — | Vị trí âm vị trong từ (bắt đầu từ 0) |
| phoneme | TEXT | NO | — | Ký hiệu âm vị theo chuẩn quốc tế IPA hoặc ARPABET |
| accuracy_score | NUMERIC(5,2) | YES | — | Điểm độ chính xác của âm vị từ 0–100 |
| offset_ticks | BIGINT | YES | — | Thời điểm bắt đầu âm vị tính bằng tick (100 ns) |
| duration_ticks | BIGINT | YES | — | Thời lượng phát âm âm vị tính bằng tick (100 ns) |

**Các chỉ mục (Indexes):** `idx_pron_phoneme_word`
**Các ràng buộc (Constraints):** `UNIQUE (word_detail_id, phoneme_index)` — alias `uq_pron_phoneme_position`

---

## agent_feedback

Nhận xét gợi ý chi tiết do AI sinh ra định kỳ sau mỗi lượt hội thoại (turn), tóm tắt các quan sát về ngữ pháp, phát âm và cách dùng từ vựng của người dùng.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| turn_id | UUID | NO | — | Khóa ngoại → turns(id) ON DELETE CASCADE |
| summary | TEXT | YES | — | Bản tóm tắt nhận xét chung cho lượt trao đổi |
| grammar_feedback | TEXT | YES | — | Các lưu ý, hướng dẫn chuyên biệt về ngữ pháp |
| pronunciation_feedback | TEXT | YES | — | Các lưu ý, hướng dẫn chuyên biệt về phát âm |
| vocabulary_feedback | TEXT | YES | — | Các lưu ý, hướng dẫn chuyên biệt về từ vựng |
| next_tip | TEXT | YES | — | Một lời khuyên thực tế để người dùng áp dụng ở lượt nói tiếp theo |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các ràng buộc (Constraints):** `UNIQUE (turn_id)` — tên alias: `uq_agent_feedback_turn` (đảm bảo chỉ có một bản ghi nhận xét duy nhất cho mỗi lượt turn)

---

## daily_progress

Bảng tổng hợp hoạt động học tập hàng ngày của từng người dùng. Được hệ thống cập nhật tự động (upsert) ngay sau khi người dùng hoàn thành một phiên luyện tập.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| date | DATE | NO | — | Ngày dương lịch tương ứng (khuyên dùng múi giờ local của người dùng) |
| total_turns | INT | NO | 0 | Tổng số lượt nói trao đổi đã hoàn thành trong ngày |
| minutes_spoken | INT | NO | 0 | Tổng số phút thực tế đã thực hiện nói luyện tập |
| avg_overall_score | NUMERIC(5,2) | YES | — | Điểm phát âm tổng hợp trung bình đạt được trong ngày 0–100 |
| avg_fluency_score | NUMERIC(5,2) | YES | — | Điểm độ trôi chảy trung bình đạt được trong ngày 0–100 |
| avg_accuracy_score | NUMERIC(5,2) | YES | — | Điểm độ chính xác phát âm trung bình đạt được trong ngày 0–100 |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_daily_progress_user_date (user_id, date DESC)`
**Các ràng buộc (Constraints):** `UNIQUE (user_id, date)` — alias `uq_daily_progress_user_date`; tất cả các cột điểm trung bình đều có ràng buộc `CHECK (score BETWEEN 0 AND 100)`
**Các trigger:** `trg_daily_progress_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## grammar_feedback

Bảng phân tích lỗi ngữ pháp chi tiết đối với từng tin nhắn văn bản của người dùng, được sinh ra từ dịch vụ kiểm lỗi ngữ pháp chuyên dụng.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | Khóa chính (Primary key) |
| message_id | UUID | NO | — | Khóa ngoại → messages(id) ON DELETE CASCADE |
| user_input | TEXT | NO | — | Văn bản gốc của người dùng gửi lên cần phân tích |
| errors | JSONB | NO | '[]' | Mảng JSON chứa chi tiết các lỗi ngữ pháp phát hiện được |
| corrected_sentence | TEXT | YES | — | Phiên bản câu hoàn chỉnh sau khi đã sửa hết lỗi ngữ pháp |
| overall_score | INTEGER | YES | — | Điểm đánh giá chất lượng cấu trúc ngữ pháp |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các chỉ mục (Indexes):** `grammar_feedback_message_id_idx`

**Cấu trúc chi tiết của trường JSONB `errors`:**
```json
[
  {
    "id": 1,
    "type": "tense",
    "original": "go",
    "corrected": "went",
    "start_char": 10,
    "end_char": 12,
    "explanation": "Use past simple"
  }
]
```

---

## flashcard_decks

Các bộ sưu tập thẻ từ (decks) do người dùng tự tạo và đặt tên để ôn tập từ vựng.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| name | TEXT | NO | — | Tên hiển thị của bộ thẻ từ |
| description | TEXT | YES | — | Mô tả tùy chọn của bộ thẻ từ |
| is_active | BOOLEAN | NO | TRUE | Cờ xóa mềm bộ thẻ |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_flashcard_decks_user_id`
**Các trigger:** `trg_flashcard_decks_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## flashcards

Các cặp thông tin mặt trước (front_text) / mặt sau (back_text) của thẻ từ thuộc về một bộ thẻ và được sở hữu bởi người dùng.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| deck_id | UUID | NO | — | Khóa ngoại → flashcard_decks(id) ON DELETE CASCADE |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| front_text | TEXT | NO | — | Nội dung văn bản hiển thị ở mặt trước thẻ từ |
| back_text | TEXT | NO | — | Nội dung văn bản hiển thị ở mặt sau thẻ từ |
| tags | TEXT[] | NO | '{}' | Mảng các nhãn dán ở dạng chuỗi phục vụ lọc phân loại thẻ |
| is_active | BOOLEAN | NO | TRUE | Cờ xóa mềm thẻ từ |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_flashcards_deck_id`, `idx_flashcards_user_id`, `idx_flashcards_tags (chỉ mục GIN áp dụng trên mảng tags)`
**Các trigger:** `trg_flashcards_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE

---

## flashcard_media

Các tệp đa phương tiện đính kèm (hình ảnh hoặc âm thanh) ở các mặt của thẻ từ, được lưu trữ bảo mật trên các hệ thống lưu trữ đối tượng backend.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| card_id | UUID | NO | — | Khóa ngoại → flashcards(id) ON DELETE CASCADE |
| side | TEXT | NO | — | Chỉ định tệp đa phương tiện này thuộc về mặt nào của thẻ từ |
| media_type | TEXT | NO | — | Phân loại tệp tin tải lên (hình ảnh hoặc âm thanh) |
| storage_provider | TEXT | NO | — | Hệ thống lưu trữ đối tượng backend sử dụng |
| storage_key | TEXT | NO | — | Khóa/đường dẫn file nằm bên trong dịch vụ lưu trữ |
| public_url | TEXT | YES | — | Đường dẫn truy cập công khai (pre-signed hoặc CDN) |
| mime_type | TEXT | YES | — | Kiểu MIME thực tế của tệp tải lên (ví dụ: `image/png`) |
| size_bytes | BIGINT | YES | — | Dung lượng tệp tính bằng byte |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |

**Các chỉ mục (Indexes):** `idx_flashcard_media_card_id`
**Các ràng buộc (Constraints):** `CHECK (side IN ('front', 'back'))`, `CHECK (media_type IN ('image', 'audio'))`, `CHECK (storage_provider IN ('local','s3','azure_blob','gcs','minio'))`

---

## flashcard_reviews

Bảng theo dõi và lên lịch học lại ngắt quãng theo thuật toán SM-2 áp dụng cho từng thẻ từ ứng với mỗi người dùng. Mỗi cặp card_id + user_id có duy nhất một dòng dữ liệu và được cập nhật trực tiếp tại chỗ sau mỗi lượt ôn tập.

| Cột | Kiểu | Nullable | Mặc định | Mô tả |
|---|---|---|---|---|
| id | UUID | NO | uuid_generate_v4() | Khóa chính (Primary key) |
| card_id | UUID | NO | — | Khóa ngoại → flashcards(id) ON DELETE CASCADE |
| user_id | UUID | NO | — | Khóa ngoại → users(id) ON DELETE CASCADE |
| due_date | DATE | NO | CURRENT_DATE | Ngày dự kiến thực hiện phiên ôn tập tiếp theo |
| interval_days | INT | NO | 1 | Khoảng cách ôn tập hiện tại của thuật toán SM-2 tính theo ngày |
| ease_factor | NUMERIC(4,2) | NO | 2.5 | Hệ số dễ ôn tập của SM-2 (khoảng giá trị chuẩn từ 1.3–2.5) |
| repetitions | INT | NO | 0 | Tổng số lượt đã ôn tập thành công liên tiếp |
| last_rating | TEXT | YES | — | Đánh giá chất lượng ghi nhớ người dùng gửi lên gần nhất |
| last_reviewed_at | TIMESTAMPTZ | YES | — | Thời điểm thực hiện lượt ôn tập gần đây nhất |
| created_at | TIMESTAMPTZ | NO | NOW() | Thời điểm tạo bản ghi |
| updated_at | TIMESTAMPTZ | NO | NOW() | Thời điểm cập nhật bản ghi gần nhất |

**Các chỉ mục (Indexes):** `idx_flashcard_reviews_user_due (user_id, due_date)`
**Các ràng buộc (Constraints):** `UNIQUE (card_id, user_id)` — alias `uq_flashcard_reviews_card_user`; `CHECK (last_rating IN ('again','hard','good','easy'))`
**Các trigger:** `trg_flashcard_reviews_updated_at` — tự động cập nhật `updated_at = NOW()` trước mỗi hành động UPDATE
