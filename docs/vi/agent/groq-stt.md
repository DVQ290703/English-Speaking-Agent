# Dịch Vụ Groq STT (Whisper)

Chuyển đổi âm thanh giọng nói của người dùng thành văn bản trước khi đưa vào pipeline LangGraph.

**Nguồn:** `app/services/groq_stt.py`  
**Model:** `whisper-large-v3-turbo` (mặc định)  
**Nhà cung cấp:** [Groq](https://console.groq.com) thông qua SDK Python của `groq`

---

## Cấu Hình

| Biến môi trường | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `GROQ_API_KEY` | Có | — | Dùng chung với dịch vụ LLM. Raise lỗi `ValueError` khi khởi động nếu thiếu. |
| `GROQ_STT_MODEL` | Không | `whisper-large-v3-turbo` | Biến thể model Whisper được sử dụng. |

---

## Cách Sử Dụng

Dịch vụ này được khởi tạo lazy (khi cần dùng) thông qua hàm `get_stt_service()` trong tệp `app/core/ai_services.py`:

```python
@lru_cache(maxsize=1)
def get_stt_service() -> GroqSTTService:
    return GroqSTTService(model_name=os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo"))
```

Dịch vụ được gọi bởi hàm `transcribe_audio()` (hàm này bọc dịch vụ kèm theo xử lý lỗi) và được sử dụng ở hai vị trí:

| Bên gọi | Khi nào |
|---|---|
| `POST /api/chat/respond` | Khi file âm thanh (`audio_file`) được tải lên thay vì văn bản (`text`) |
| `POST /api/chat/transcribe` | Endpoint gọn nhẹ chuyên dùng cho STT |

---

## `transcribe()`

```python
def transcribe(
    audio_bytes: bytes,
    filename: str = "recording.wav",
) -> str
```

1. **Bọc `audio_bytes`** vào một buffer `io.BytesIO` với tên tệp được chỉ định (được API Groq dùng để nhận dạng định dạng âm thanh)
2. **Gọi `client.audio.transcriptions.create()`** với:
   - `response_format="verbose_json"` — trả về siêu dữ liệu (metadata) chi tiết cùng với văn bản nhận diện
   - `temperature=0.0` — kết quả đầu ra có tính xác định (deterministic)
3. **Trích xuất thuộc tính `.text`** (xử lý tốt cả cấu trúc phản hồi dạng đối tượng và dạng từ điển)
4. **Trả về** chuỗi văn bản đã được cắt bỏ khoảng trống thừa (trimmed transcript)

---

## Định Dạng Âm Thanh Được Hỗ Trợ

Endpoint chat chấp nhận: `mp3`, `wav`, `ogg`, `webm`, `m4a`  
Dung lượng tệp tối đa: **25 MB**

Tên tệp được truyền vào `transcribe()` giúp API Groq nhận biết định dạng âm thanh. Nếu định dạng bị mơ hồ, hãy truyền phần mở rộng tên tệp rõ ràng:

```python
stt.transcribe(audio_bytes, filename="recording.webm")
```

---

## Xử Lý Lỗi

| Tình huống | Hành vi |
|---|---|
| Thiếu `GROQ_API_KEY` | Raise lỗi `ValueError` lúc khởi động |
| Dữ liệu `audio_bytes` rỗng | Trả về chuỗi rỗng `""` ngay lập tức |
| Lỗi API nhận dạng (Transcription API) | Ngoại lệ được bắt trong wrapper `transcribe_audio()` → trả về `""` |

Khi việc nhận diện trả về `""`, endpoint chat sẽ tự động chuyển sang sử dụng bất kỳ nội dung nào có trong trường `text` được cung cấp. Nếu cả hai trường đều trống, yêu cầu sẽ bị từ chối với lỗi HTTP 400.

---

## Thay Đổi Model

```bash
GROQ_STT_MODEL=whisper-large-v3          # Độ chính xác cao hơn, chậm hơn
GROQ_STT_MODEL=whisper-large-v3-turbo    # Mặc định — nhanh + chính xác
```

Xem [Tài liệu model âm thanh Groq](https://console.groq.com/docs/speech-text) để biết các tùy chọn sẵn có.
