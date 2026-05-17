# Dịch Vụ ElevenLabs TTS

Chuyển đổi phản hồi dạng văn bản của AI thành âm thanh giọng nói trong node `tts` của pipeline LangGraph.

**Nguồn:** `app/services/elevenlabs_tts.py`  
**Model:** `eleven_flash_v3_2_5` (mặc định)  
**Nhà cung cấp:** [ElevenLabs](https://elevenlabs.io) thông qua HTTP API trực tiếp

---

## Cấu Hình

| Biến môi trường | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `ELEVENLABS_API_KEY` | Có | — | API key của ElevenLabs. Trả về `b""` trong im lặng nếu thiếu. |
| `ELEVENLABS_MODEL_ID` | Không | `eleven_flash_v3_2_5` | Model TTS. Các dòng model Flash được tối ưu hóa cho độ trễ cực thấp. |
| `ELEVENLABS_VOICE_ID` | Không | — | ID giọng nói mặc định/dự phòng |
| `ELEVENLABS_VOICE_ID_male` | Không | — | Giọng nói sử dụng khi `voice_gender="male"` |
| `ELEVENLABS_VOICE_ID_female` | Không | — | Giọng nói sử dụng khi `voice_gender="female"` |

Phải đặt ít nhất một trong số các biến môi trường ID giọng nói, nếu không việc chuyển đổi sẽ trả về `b""`.

---

## Cách Sử Dụng

Dịch vụ này được khởi tạo như một phần của hàm `get_voice_agent_pipeline()`:

```python
tts_service = ElevenLabsTTS()
pipeline = VoiceAgentPipeline(llm_service, tts_service)
```

Node `tts` sẽ gọi hàm `convert_text_to_speech()` với `voice_gender` lấy từ request. Dữ liệu `audio_bytes` kết quả sau đó được tải lên MinIO và được:
- Trả về **trực tiếp dưới dạng base64 (inline)** nếu kích thước < 512 KB.
- Trả về dưới dạng **URL phát trực tuyến (streaming URL)** (`GET /api/audio/{key}`) nếu kích thước ≥ 512 KB.

Node `tts` bị **bỏ qua hoàn toàn** khi pipeline thực hiện các cuộc gọi tool — phản hồi của tool chỉ chứa văn bản thuần.

---

## `convert_text_to_speech()`

```python
def convert_text_to_speech(
    text: str,
    voice_gender: str | None = None,
) -> bytes
```

1. **Phân giải ID giọng nói** — đối chiếu `voice_gender` với `ELEVENLABS_VOICE_ID_male` / `ELEVENLABS_VOICE_ID_female`, nếu không khớp sẽ dùng mặc định là `ELEVENLABS_VOICE_ID`
2. **HTTP POST** tới `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`:
   ```json
   { "text": "...", "model_id": "eleven_flash_v3_2_5" }
   ```
   Headers: `xi-api-key`, `Accept: audio/mpeg`, `Content-Type: application/json`
3. **Phát trực tiếp (Stream)** phản hồi theo các phân đoạn (chunks) 64 KB
4. **Xác thực** `Content-Type` bắt đầu bằng `audio/` và `Content-Length` khớp với số byte nhận được
5. Trả về dữ liệu byte MP3 gốc

---

## Lựa Chọn Giọng Nói

Điều chỉnh giọng nói thông qua các trường form dữ liệu `voice_gender` và `voice_accent` trong `POST /api/chat/respond`:

| `voice_gender` | Biến môi trường được dùng |
|---|---|
| `"male"` | `ELEVENLABS_VOICE_ID_male` |
| `"female"` | `ELEVENLABS_VOICE_ID_female` |
| `null` / giá trị khác | `ELEVENLABS_VOICE_ID` (mặc định) |

> `voice_accent` được truyền tiếp tới pipeline state nhưng hiện tại chưa ảnh hưởng tới việc chọn giọng nói — trường này được để dành cho việc định tuyến theo giọng (accent) trong tương lai.

Tìm kiếm ID giọng nói trong thư viện [ElevenLabs Voice Library](https://elevenlabs.io/voice-library) hoặc qua API của họ.

---

## Xử Lý Lỗi

Mọi thất bại đều trả về `b""` (chuỗi byte rỗng) — TTS là tiến trình không gây tắc nghẽn (non-blocking) và phản hồi của API sẽ có `audio_base64: null` cùng `assistant_audio_url: null`.

| Tình huống | Hành vi |
|---|---|
| Thiếu `ELEVENLABS_API_KEY` | Trả về `b""` |
| Chưa cấu hình Voice ID | Trả về `b""` |
| Dữ liệu `text` rỗng | Trả về `b""` |
| Mã HTTP ≠ 200 | Ghi log mã trạng thái + 200 ký tự đầu của thân phản hồi, trả về `b""` |
| Lỗi mạng (`RequestException`) | Ghi log lỗi, trả về `b""` |
| `Content-Type` không phải `audio/*` | Ghi log cảnh báo, trả về `b""` |
| Mất cân bằng `Content-Length` | Ghi log cảnh báo, trả về `b""` |

---

## Thay Đổi Model

```bash
ELEVENLABS_MODEL_ID=eleven_flash_v3_2_5   # Mặc định — độ trễ thấp
ELEVENLABS_MODEL_ID=eleven_multilingual_v2 # Chất lượng cao hơn, hỗ trợ 29 ngôn ngữ
ELEVENLABS_MODEL_ID=eleven_turbo_v2_5      # Nhanh nhất, chỉ hỗ trợ tiếng Anh
```

Xem [Tài liệu các model ElevenLabs](https://elevenlabs.io/docs/speech-synthesis/models) để biết các tùy chọn và sự đánh đổi (tradeoffs).
