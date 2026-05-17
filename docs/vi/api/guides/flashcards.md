# Hướng Dẫn Thẻ Từ (Flashcards Guide)

Hệ thống flashcard sử dụng **thuật toán lặp lại ngắt quãng SM-2** để lên lịch ôn tập cho các thẻ từ. Các thẻ được tổ chức theo từng bộ thẻ (decks). Các tệp đa phương tiện (hình ảnh, âm thanh) có thể được đính kèm vào mặt trước (front) hoặc mặt sau (back) của thẻ.

---

## Mô Hình Dữ Liệu (Data Model)

```
bộ thẻ flashcard_decks (sở hữu bởi người dùng)
  └── các thẻ flashcards (front_text, back_text, tags[])
        ├── đa phương tiện flashcard_media (hình ảnh/âm thanh trên từng mặt)
        └── lượt ôn tập flashcard_reviews (trạng thái SM-2: due_date, interval, ease_factor)
```

---

## Bộ Thẻ (Decks)

### Tạo mới một bộ thẻ

```bash
curl -X POST http://localhost:8000/api/flashcards/decks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "IELTS Vocabulary", "description": "Key words for Part 2"}'
```

**Phản hồi mã 201 (Created):**
```json
{
  "id": "3fa85f64-...",
  "name": "IELTS Vocabulary",
  "description": "Key words for Part 2",
  "card_count": 0,
  "due_count": 0,
  "created_at": "2026-05-16T10:00:00Z"
}
```

### Danh sách các bộ thẻ

```bash
curl http://localhost:8000/api/flashcards/decks \
  -H "Authorization: Bearer <token>"
```

Trả về tất cả các bộ thẻ đang hoạt động kèm theo `card_count` (tổng số thẻ đang hoạt động) và `due_count` (số thẻ cần ôn tập trong ngày hôm nay).

### Cập nhật / Xóa bộ thẻ

```bash
# Cập nhật thông tin
curl -X PATCH http://localhost:8000/api/flashcards/decks/3fa85f64-... \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Advanced Vocabulary"}'

# Xóa mềm bộ thẻ (trả về mã 204)
curl -X DELETE http://localhost:8000/api/flashcards/decks/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

---

## Thẻ Từ (Cards)

### Thêm một thẻ từ vào bộ thẻ

```bash
curl -X POST http://localhost:8000/api/flashcards/decks/3fa85f64-.../cards \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "front_text": "eloquent",
    "back_text": "able to speak or write fluently and persuasively",
    "tags": ["vocabulary", "adjective"]
  }'
```

**Phản hồi mã 201 (Created):** Trả về đối tượng thẻ kèm theo trạng thái ban đầu của thuật toán SM-2 (`due_date` = hôm nay, `interval_days` = 1, `ease_factor` = 2.5).

### Danh sách / Lấy / Cập nhật / Xóa thẻ từ

```bash
# Lấy danh sách các thẻ trong bộ thẻ
curl http://localhost:8000/api/flashcards/decks/3fa85f64-.../cards \
  -H "Authorization: Bearer <token>"

# Lấy thông tin chi tiết một thẻ
curl http://localhost:8000/api/flashcards/cards/card-uuid \
  -H "Authorization: Bearer <token>"

# Cập nhật thông tin thẻ
curl -X PATCH http://localhost:8000/api/flashcards/cards/card-uuid \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"back_text": "Updated definition", "tags": ["vocabulary"]}'

# Xóa mềm thẻ (trả về mã 204)
curl -X DELETE http://localhost:8000/api/flashcards/cards/card-uuid \
  -H "Authorization: Bearer <token>"
```

### Tìm kiếm thẻ từ

```bash
curl "http://localhost:8000/api/flashcards/cards/search?q=eloquent&tag=vocabulary" \
  -H "Authorization: Bearer <token>"
```

Trả về tối đa 50 kết quả khớp với từ khóa (so khớp ILIKE trên văn bản mặt trước/mặt sau) và/hoặc nhãn (tag). Có thể lọc tùy chọn theo `deck_id`.

---

## Ôn Tập (Reviews - Thuật toán lặp lại ngắt quãng SM-2)

### Lấy danh sách các thẻ cần học (due cards)

Trả về tất cả các thẻ có ngày ôn tập `due_date <= hôm nay` đối với người dùng hiện tại.

```bash
curl http://localhost:8000/api/flashcards/reviews/due \
  -H "Authorization: Bearer <token>"
```

### Gửi kết quả đánh giá ôn tập

Sau khi ôn tập một thẻ, hãy gửi lên đánh giá của bạn. Thuật toán SM-2 sẽ tự động tính toán và cập nhật các trường `due_date`, `interval_days`, và `ease_factor`.

```bash
curl -X POST http://localhost:8000/api/flashcards/reviews/card-uuid \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rating": "good"}'
```

**Các giá trị đánh giá (Rating):**

| Đánh giá | Ý nghĩa | Tác động thực tế |
|---|---|---|
| `again` | Hoàn toàn quên | Đặt lại khoảng thời gian ôn tập (interval) về 1 ngày |
| `hard` | Nhớ một cách khó khăn | Tăng nhẹ khoảng thời gian ôn tập, giảm hệ số dễ (ease_factor) |
| `good` | Nhớ chính xác | Tăng khoảng thời gian ôn tập một cách bình thường |
| `easy` | Quá dễ | Tăng mạnh khoảng thời gian ôn tập, tăng hệ số dễ (ease_factor) |

**Phản hồi mã 200 (OK):** Trạng thái ôn tập mới `ReviewStateOut` chứa thông tin cập nhật của `due_date`, `interval_days`, `ease_factor`, `repetitions`.

> **Lưu ý:** Việc gửi lại đánh giá ôn tập cho cùng một thẻ trong cùng một ngày sẽ ghi đè lên đánh giá trước đó để đảm bảo tính nhất quán (idempotent).

---

## Thống Kê Bộ Thẻ (Deck Stats)

```bash
curl http://localhost:8000/api/flashcards/decks/3fa85f64-.../stats \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "total_cards": 45,
  "due_today": 8,
  "learned": 32,
  "retention_rate": 0.87
}
```

---

## Đính Kèm Tệp Đa Phương Tiện (Media Attachments)

Đính kèm một hình ảnh hoặc đoạn âm thanh vào mặt trước hoặc mặt sau của thẻ.

```bash
# Tải lên file đa phương tiện
curl -X POST http://localhost:8000/api/flashcards/cards/card-uuid/media \
  -H "Authorization: Bearer <token>" \
  -F "side=front" \
  -F "media_type=image" \
  -F "file=@word_image.png"

# Xóa file đa phương tiện (trả về mã 204)
curl -X DELETE http://localhost:8000/api/flashcards/media/media-uuid \
  -H "Authorization: Bearer <token>"
```

Các tệp đa phương tiện được lưu trữ bảo mật trong MinIO. Đường dẫn `public_url` trong phản hồi API là một **presigned URL có hiệu lực trong vòng 1 giờ**.
