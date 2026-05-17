# Hướng Dẫn Phát Âm & Ngữ Pháp (Pronunciation & Grammar Guide)

---

## POST /api/assess — Đánh Giá Phát Âm (Pronunciation Assessment)

Chấm điểm chất lượng phát âm sử dụng **Azure Cognitive Services Speech**. Trả về điểm số chi tiết ở các cấp độ câu (utterance), từ (word), âm tiết (syllable), và âm vị (phoneme).

**Loại Nội Dung (Content-Type):** `multipart/form-data`

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `audio_file` | file | Có | Tệp âm thanh để chấm điểm (mp3/wav/ogg/webm/m4a, tối đa 25 MB) |
| `reference_text` | string | Không | Nếu được cung cấp: chế độ scripted (chỉ ra các lỗi từ/âm vị cụ thể). Nếu bỏ qua: chế độ unscripted (nhận diện tự do). |
| `language` | string | Không | `en-US` (mặc định) hoặc `en-GB` |
| `message_id` | UUID | Không | UUID liên kết kết quả chấm điểm với một tin nhắn sẵn có trong cuộc hội thoại |

### Chế độ đọc theo kịch bản (Scripted mode - có reference_text)

```bash
curl -X POST http://localhost:8000/api/assess \
  -H "Authorization: Bearer <token>" \
  -F "audio_file=@my_recording.wav" \
  -F "reference_text=The weather is nice today." \
  -F "language=en-GB"
```

### Phản hồi mã 200 (OK)

```json
{
  "assessment_id": "3fa85f64-...",
  "mode": "scripted",
  "recognized_text": "The weather is nice today.",
  "pron_score": 84.5,
  "accuracy_score": 88.0,
  "fluency_score": 79.0,
  "completeness_score": 100.0,
  "prosody_score": 81.5,
  "words": [
    {
      "word": "weather",
      "accuracy_score": 91.0,
      "error_type": "None",
      "syllables": [
        { "syllable": "wea", "accuracy_score": 95.0 },
        { "syllable": "ther", "accuracy_score": 87.0 }
      ],
      "phonemes": [
        { "phoneme": "w", "accuracy_score": 98.0 },
        { "phoneme": "ɛ", "accuracy_score": 89.0 }
      ]
    }
  ]
}
```

### Các Trường Điểm Số

| Trường | Ý nghĩa |
|---|---|
| `pron_score` | Điểm chất lượng phát âm tổng hợp (0–100) |
| `accuracy_score` | Độ chính xác của các âm vị được phát âm ra |
| `fluency_score` | Độ trôi chảy và tự nhiên của giọng nói |
| `completeness_score` | Tỷ lệ các từ mong đợi được nói ra (chỉ áp dụng ở chế độ scripted) |
| `prosody_score` | Nhịp điệu, nhấn âm, và ngữ điệu nói chung |

### Các Loại Lỗi Từ (Word Error Types)

| Loại lỗi | Ý nghĩa |
|---|---|
| `None` | Phát âm chính xác |
| `Omission` | Từ bị bỏ qua (không nói từ này) |
| `Insertion` | Từ bị chèn thêm (nói từ ngoài kịch bản) |
| `Mispronunciation` | Từ bị phát âm sai |
| `UnexpectedBreak` | Xuất hiện khoảng dừng ngắt nghỉ không mong muốn |
| `MissingBreak` | Thiếu khoảng dừng ngắt nghỉ cần thiết giữa các từ |
| `Monotone` | Từ được nói ra bị thiếu cao độ tự nhiên (đơn điệu) |

---

## GET /api/grammar/detail_grammar_fb/{message_id} — Nhận Xét Ngữ Pháp (Grammar Feedback)

Trả về nhận xét ngữ pháp chi tiết cho một tin nhắn cụ thể của người dùng. Tiến trình phân tích ngữ pháp được chạy tự động trong API `/api/chat/respond` và kết quả được lưu trữ theo từng tin nhắn.

```bash
curl http://localhost:8000/api/grammar/detail_grammar_fb/3fa85f64-... \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "message_id": "3fa85f64-...",
  "user_input": "Yesterday I go to the market.",
  "corrected_sentence": "Yesterday I went to the market.",
  "overall_score": 72,
  "errors": [
    {
      "id": 1,
      "original": "go",
      "corrected": "went",
      "start_char": 10,
      "end_char": 12,
      "category": "tense",
      "severity": "major",
      "explanation": "Use past simple 'went' instead of present 'go'.",
      "rule": null,
      "example": null
    }
  ]
}
```

**Các lỗi thường gặp:**
- `404` — không tìm thấy tin nhắn, hoặc tin nhắn không thuộc sở hữu của người dùng hiện tại
