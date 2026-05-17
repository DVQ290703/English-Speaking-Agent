# Tài Liệu Tham Khảo Cơ Sở Dữ Liệu (Database Reference)

**Hệ quản trị CSDL:** PostgreSQL 16
**Các tiện ích mở rộng (Extensions):** `uuid-ossp` (tự động tạo mã UUID thông qua hàm `uuid_generate_v4()`), `citext` (kiểu dữ liệu văn bản không phân biệt chữ hoa/chữ thường áp dụng cho các cột email)

---

## Các Quy Ước Thiết Kế (Conventions)

| Quy ước | Chi tiết kỹ thuật |
|---|---|
| Khóa chính (Primary keys) | Dùng kiểu dữ liệu UUID ở mọi bảng (`uuid_generate_v4()`) |
| Trường thời gian (Timestamps) | Khai báo `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` trên mọi bảng |
| Tự động cập nhật thời gian | Cột `updated_at` trong các bảng có thể thay đổi dữ liệu được quản lý tự động bởi trigger `set_updated_at()` |
| Xóa mềm (Soft deletes) | Dùng cột `is_active BOOLEAN` (trong các bảng users, categories, topics, flashcards) hoặc cột `deleted_at TIMESTAMPTZ` (trong bảng conversations) |
| Email không phân biệt chữ hoa chữ thường | Sử dụng kiểu dữ liệu `CITEXT` — khi tìm kiếm `WHERE email = 'ALICE@EXAMPLE.COM'` sẽ khớp trực tiếp với `alice@example.com` |

---

## Các Tệp Schema

| Tệp | Mục đích |
|---|---|
| `db_schema/schema.sql` | Chứa toàn bộ câu lệnh DDL — khởi tạo tất cả các bảng, các chỉ mục (indexes), các trigger. Chạy tệp này một lần đầu tiên để khởi tạo cấu trúc CSDL. |
| `db_schema/seed.sql` | Dữ liệu mẫu ban đầu về các danh mục (categories) và các chủ đề (topics) phục vụ môi trường phát triển local. |

**Cách áp dụng cấu trúc dữ liệu (Apply schema):**
```bash
psql -U <user> -d <database> -f db_schema/schema.sql
psql -U <user> -d <database> -f db_schema/seed.sql
```

Hoặc thông qua Docker Compose — cả hai tệp SQL trên đều được gắn kết (mount) vào thư mục `/docker-entrypoint-initdb.d/` trong container và tự động khởi chạy khi khởi động container lần đầu tiên.

---

## Các Bảng Cơ Sở Dữ Liệu (Tables)

Xem tài liệu [`schema.md`](./schema.md) để biết chi tiết cụ thể ở cấp độ từng cột dữ liệu.

**Gồm 22 bảng đang hoạt động** được chia làm 10 nhóm chức năng cụ thể:

### Nhóm 1 — Người Dùng & Xác Thực (Users & Auth)
| Bảng | Mô tả |
|---|---|
| `users` | Tài khoản người dùng chính (đăng nhập bằng email/mật khẩu hoặc OAuth) |
| `password_reset_tokens` | Lưu mã token dùng để khôi phục mật khẩu có hiệu lực ngắn hạn |
| `auth_sessions` | Quản lý phiên làm việc với refresh-token, mỗi dòng tương ứng với một cặp user + thiết bị |
| `oauth_accounts` | Liên kết các tài khoản đăng nhập bên thứ ba (Google, Microsoft, Facebook) |

### Nhóm 2 — Danh Mục & Chủ Đề (Categories & Topics)
| Bảng | Mô tả |
|---|---|
| `categories` | Phân nhóm các chủ đề trò chuyện ở cấp cao nhất (ví dụ: IELTS Part 1) |
| `topics` | Các chủ đề hội thoại cụ thể nằm trong một danh mục |
| `user_topic_preferences` | Điểm độ thành thạo và số lượt đã luyện tập của từng người dùng đối với mỗi chủ đề |

### Nhóm 3 — Cuộc Hội Thoại / Lượt Nói / Tin Nhắn (Conversations / Turns / Messages)
| Bảng | Mô tả |
|---|---|
| `conversations` | Một phiên trò chuyện luyện nói duy nhất (ở các trạng thái: active, completed, hoặc abandoned) |
| `turns` | Một lượt trao đổi (người dùng nói + trợ lý phản hồi) trong một cuộc hội thoại |
| `messages` | Các tin nhắn chi tiết thuộc về một lượt nói (turn) |

### Nhóm 4 — Tệp Âm Thanh (Audio Assets)
| Bảng | Mô tả |
|---|---|
| `audio_assets` | Lưu trữ file âm thanh người dùng tải lên và âm thanh TTS do AI phản hồi, kèm theo siêu dữ liệu lưu trữ |

### Nhóm 5 — Đánh Giá Phát Âm (Pronunciation Assessment)
| Bảng | Mô tả |
|---|---|
| `pronunciation_assessments` | Điểm số đánh giá từ dịch vụ Azure Cognitive Services ứng với một tin nhắn |
| `pronunciation_word_details` | Phân tích chi tiết độ chính xác và nhịp điệu (prosody) của từng từ |
| `pronunciation_syllable_details` | Độ chính xác của từng âm tiết trong một từ |
| `pronunciation_phoneme_details` | Độ chính xác của từng âm vị trong một từ |

### Nhóm 6 — Nhận Xét Của Trợ Lý (Agent Feedback)
| Bảng | Mô tả |
|---|---|
| `agent_feedback` | Nhận xét gợi ý luyện tập do AI tạo ra sau mỗi lượt trao đổi (turn) |

### Nhóm 7 — Tiến Trình Hàng Ngày (Daily Progress)
| Bảng | Mô tả |
|---|---|
| `daily_progress` | Thống kê tổng hợp hoạt động hàng ngày của người dùng (số lượt, số phút nói, điểm số trung bình) |

### Nhóm 9 — Phân Tích Ngữ Pháp (Grammar Feedback)
| Bảng | Mô tả |
|---|---|
| `grammar_feedback` | Phân tích lỗi ngữ pháp chi tiết đối với một tin nhắn của người dùng |

### Nhóm 10 — Thẻ Từ (Flashcards)
| Bảng | Mô tả |
|---|---|
| `flashcard_decks` | Các bộ sưu tập thẻ từ do người dùng tự tạo |
| `flashcards` | Cặp thông tin mặt trước/mặt sau của thẻ từ kèm theo nhãn dán |
| `flashcard_media` | File hình ảnh hoặc âm thanh đính kèm ở các mặt của thẻ từ |
| `flashcard_reviews` | Trạng thái ôn tập lặp lại ngắt quãng SM-2 của mỗi thẻ ứng với người dùng |

---

## Nhật Ký Kiểm Toán - Audit Logs (Tùy chọn)

Bảng `audit_logs` được định nghĩa sẵn trong tệp `schema.sql` nhưng hiện tại đang được **comment lại** (vô hiệu hóa). Để kích hoạt bảng này:

1. Bỏ comment (uncomment) khối lệnh `CREATE TABLE audit_logs` trong `db_schema/schema.sql`
2. Cấu hình biến môi trường `AUDIT_DB_ENABLED=true` trong môi trường chạy backend

Khi được kích hoạt, mỗi yêu cầu đi qua hệ thống guardrail middleware sẽ được ghi nhận nhật ký gồm: `user_id`, `conversation_id`, các chuỗi băm (hash) đầu vào/đầu ra, quyết định của hệ thống bảo vệ (guardrail decisions), và độ trễ phản hồi (latency).
