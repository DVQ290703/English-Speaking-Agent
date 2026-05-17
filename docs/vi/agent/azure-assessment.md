# Dịch Vụ Đánh Giá Phát Âm Azure Speech

Chấm điểm phát âm ở các cấp độ câu (utterance), từ (word), âm tiết (syllable) và âm vị (phoneme) sử dụng Azure Cognitive Services Speech SDK.

**Nguồn:** `app/services/azure_assessment.py`
**Nhà cung cấp:** [Azure Cognitive Services Speech](https://azure.microsoft.com/en-us/products/ai-services/speech-to-text)
**SDK:** `azure-cognitiveservices-speech` (import tùy chọn — trả về `RuntimeError` nếu chưa được cài đặt)

---

## Cấu Hình

| Biến môi trường | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `AZURE_SPEECH_KEY` | Có* | — | Key đăng ký dịch vụ Azure Speech |
| `AZURE_SUBSCRIPTION_ID` | Có* | — | Tên gọi khác (alias) của `AZURE_SPEECH_KEY` |
| `AZURE_SPEECH_REGION` | Có** | — | Vùng Azure e.g. `eastus` |
| `AZURE_SERVICE_REGION` | Có** | — | Tên gọi khác (alias) của `AZURE_SPEECH_REGION` |
| `AZURE_SPEECH_LANGUAGE` | Không | `en-US` | Ngôn ngữ nhận diện mặc định |

\* Bắt buộc phải đặt `AZURE_SPEECH_KEY` hoặc `AZURE_SUBSCRIPTION_ID`.
\*\* Bắt buộc phải đặt `AZURE_SPEECH_REGION` hoặc `AZURE_SERVICE_REGION`.

---

## Cách Sử Dụng

Dịch vụ này được khởi tạo lazy (chỉ khi được gọi) thông qua `get_assessment_service()`:

```python
@lru_cache(maxsize=1)
def get_assessment_service() -> AzureAssessmentService:
    return AzureAssessmentService(language=os.getenv("AZURE_SPEECH_LANGUAGE", "en-US"))
```

Được gọi bởi `POST /api/assess`. Kết quả chấm điểm được lưu vào các bảng `pronunciation_assessments`, `pronunciation_word_details`, `pronunciation_syllable_details` và `pronunciation_phoneme_details`.

---

## `assess()`

```python
def assess(
    audio_bytes: bytes,
    reference_text: str | None = None,
    language: str | None = None,
    granularity: str = "Phoneme",
    enable_prosody: bool = True,
) -> dict
```

### Các Chế Độ

| Chế độ | Khi nào | Đo lường những gì |
|---|---|---|
| **Scripted** (Có kịch bản) | Cung cấp `reference_text` | So sánh giọng nói với văn bản mẫu — phát hiện các lỗi lược bỏ (omission), chèn thêm (insertion) và phát âm sai (mispronunciation) |
| **Unscripted** (Tự do) | `reference_text=None` | Nhận diện giọng nói tự do và chấm điểm phát âm mà không cần văn bản mục tiêu |

### Độ Chi Tiết (Granularity)

| Giá trị | Cấp độ chi tiết |
|---|---|
| `"Phoneme"` | Mặc định — điểm cấp độ từ + âm tiết + âm vị |
| `"Word"` | Chỉ chấm điểm cấp độ từ |
| `"FullText"` | Chỉ chấm điểm cấp độ câu |

### Ngữ Điệu (Prosody)

Được bật mặc định cho ngôn ngữ `en-US`. Chấm điểm:
- **Break** (Ngắt nghỉ) — những khoảng dừng không mong muốn hoặc thiếu khoảng dừng giữa các từ
- **Intonation** (Ngữ điệu) — sự biến đổi cao độ (phát hiện giọng nói đơn điệu, monotone)

Dữ liệu ngữ điệu xuất hiện dưới dạng `break_error_types`, `intonation_error_types` và điểm số độ tin cậy (confidence score) trên mỗi dòng của bảng `pronunciation_word_details`.

---

## Cấu Trúc Phản Hồi

Trả về kết quả **NBest hàng đầu** từ Azure với hai khóa bổ sung:

```python
{
    # Được thêm bởi wrapper dịch vụ
    "mode": "scripted" | "unscripted",
    "display_text": "The weather is nice today.",

    # Các trường NBest của Azure
    "PronScore": 84.5,          # Điểm tổng hợp (0–100)
    "AccuracyScore": 88.0,
    "FluencyScore": 79.0,
    "CompletenessScore": 100.0,
    "ProsodyScore": 81.5,
    "NBestConfidence": 0.9832,
    "SNR": 35.2,                # Tỷ lệ tín hiệu trên nhiễu (Signal-to-noise ratio)
    "OffsetInTicks": 100000,    # Thời điểm bắt đầu (đơn vị tick 100-ns)
    "DurationInTicks": 4500000, # Thời lượng câu nói (đơn vị tick 100-ns)
    "Words": [
        {
            "Word": "weather",
            "AccuracyScore": 91.0,
            "ErrorType": "None",
            "OffsetInTicks": 150000,
            "DurationInTicks": 800000,
            "Syllables": [
                { "Syllable": "wea", "AccuracyScore": 95.0, ... },
                { "Syllable": "ther", "AccuracyScore": 87.0, ... }
            ],
            "Phonemes": [
                { "Phoneme": "w", "AccuracyScore": 98.0, ... },
                { "Phoneme": "ɛ", "AccuracyScore": 89.0, ... }
            ]
        }
    ]
}
```

Toàn bộ payload gốc của Azure cũng được lưu nguyên vẹn trong cột `pronunciation_assessments.raw_result_json` (kiểu JSONB).

---

## Ý Nghĩa Các Trường Điểm Số

| Trường điểm | Mô tả |
|---|---|
| `PronScore` | Điểm chất lượng phát âm tổng hợp (0-100), là trung bình có trọng số từ các điểm số khác. |
| `AccuracyScore` | Độ chính xác khi các âm vị phát âm khớp với phát âm mong đợi/chuẩn. |
| `FluencyScore` | Độ trôi chảy tự nhiên — ít ngập ngừng, tốc độ nói vừa phải. |
| `CompletenessScore` | Tỷ lệ các từ mong đợi được nói ra (chỉ áp dụng ở chế độ scripted; luôn là 100 ở chế độ unscripted). |
| `ProsodyScore` | Chất lượng về nhịp điệu, nhấn âm và ngữ điệu. |

### Các Loại Lỗi Ở Cấp Độ Từ (Word Error Types)

| Loại lỗi | Ý nghĩa |
|---|---|
| `None` | Phát âm chính xác |
| `Omission` | Từ bị bỏ qua (không nói) |
| `Insertion` | Từ bị chèn thêm (nói từ ngoài kịch bản) |
| `Mispronunciation` | Từ bị phát âm sai |
| `UnexpectedBreak` | Khoảng dừng không mong muốn xuất hiện |
| `MissingBreak` | Thiếu khoảng dừng cần thiết giữa các từ |
| `Monotone` | Thiếu sự biến đổi cao độ khi nói từ này |

---

## Đơn Vị Đo Lường Thời Gian (Tick Units)

Azure trả về các giá trị thời gian dưới dạng **tick 100-nanosecond**:

```python
milliseconds (mili giây) = ticks / 10_000
seconds (giây)           = ticks / 10_000_000
```

Các giá trị này được lưu nguyên vẹn vào các cột `offset_ticks` / `duration_ticks` trong cơ sở dữ liệu.

---

## Xử Lý Lỗi

| Tình huống | Hành vi |
|---|---|
| Thiếu `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` | Gây ra lỗi `ValueError` lúc khởi động |
| Chưa cài đặt `azure-cognitiveservices-speech` | Gây ra lỗi `RuntimeError` lúc khởi động |
| Dữ liệu `audio_bytes` trống | Trả về lỗi `ValueError` |
| Nhận diện thành công `RecognizedSpeech` | Trả về dict kết quả đánh giá ✅ |
| Kết quả nhận diện `NoMatch` | Trả về lỗi `RuntimeError("Speech was not recognized...")` |
| Kết quả nhận diện `Canceled` | Log lý do hủy bỏ + chi tiết lỗi và raise `RuntimeError` |

Các tài nguyên SDK (`recognizer`, `audio_config`, `speech_config`, `stream`) được giải phóng/xóa một cách rõ ràng sau mỗi lần gọi để tránh rò rỉ bộ nhớ (memory leaks).

---

## Ngôn Ngữ Được Hỗ Trợ

| Mã | Ngôn ngữ |
|---|---|
| `en-US` | Tiếng Anh (Mỹ) — ngữ điệu (prosody) được bật mặc định |
| `en-GB` | Tiếng Anh (Anh) |

Truyền tham số `language` vào `POST /api/assess` để ghi đè cấu hình mặc định.
