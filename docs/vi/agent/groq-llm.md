# Dịch Vụ Groq LLM

Vận hành các node `preflight` và `respond` của pipeline LangGraph.

**Nguồn:** `app/services/groq_llm.py`
**Model:** `llama-3.3-70b-versatile` (mặc định)
**Nhà cung cấp:** [Groq](https://console.groq.com) thông qua `langchain_groq.ChatGroq`

---

## Cấu Hình

| Biến môi trường | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `GROQ_API_KEY` | Có | — | API key của Groq. Raise lỗi `ValueError` lúc khởi động nếu thiếu. |
| `GROQ_LLM_MODEL` | Không | `llama-3.3-70b-versatile` | Tên model LLM. Mọi model chat được hỗ trợ bởi Groq đều hoạt động tốt. |

---

## Cách Sử Dụng

Dịch vụ này được khởi tạo một lần duy nhất thông qua hàm `get_voice_agent_pipeline()` trong tệp `app/core/ai_services.py`:

```python
llm_service = GroqLLMService(model_name=os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"))
```

`ChatGroq` được thiết lập với `temperature=0.2` để đảm bảo các phản hồi có tính nhất quán cao và ít biến động.

---

## `generate_response()`

```python
def generate_response(
    user_input: str,
    history: list[str] | None = None,
) -> str
```

Xây dựng danh sách tin nhắn và gọi tới LLM:

1. **SystemMessage** — Đóng vai huấn luyện viên nói IELTS (IELTS speaking coach persona) kèm ngữ cảnh chủ đề được truyền vào nếu tìm thấy trong lịch sử.
2. **History** — Lấy tối đa **8 dòng** hội thoại gần nhất (luân phiên HumanMessage / AIMessage).
3. **HumanMessage** — Nội dung `user_input` hiện tại.

Trả về chuỗi phản hồi (string response) của LLM.

---

## Cách Dùng Trong Pipeline

Node `respond` sử dụng LLM ở ba chế độ khác nhau tùy thuộc vào trạng thái:

| Chế độ | Khi nào | Cách thức |
|---|---|---|
| **Tool client** | `tool_intent=True`, `user_id` được đặt, số lượt lặp < 5 | `llm.bind_tools(FLASHCARD_TOOLS)` — LLM có thể đưa ra `tool_calls` |
| **Structured client** | Bị tắt tool | `llm.with_structured_output(AgentOutput)` — trả về model Pydantic |
| **Plain client** | Dự phòng | Gọi trực tiếp `llm.invoke()` — trả về chuỗi văn bản thông thường |

Node `preflight` luôn luôn sử dụng plain client để đạt tốc độ tối đa.

---

## Phản Hồi Ngữ Pháp

Khi sử dụng **structured client**, LLM được hướng dẫn đính kèm thẻ XML `<grammar>` trong phản hồi. Node `respond` sẽ bóc tách và phân tích cú pháp thẻ này thành `grammar_raw` (một chuỗi JSON), sau đó dữ liệu này được lưu vào bảng cơ sở dữ liệu `grammar_feedback`.

---

## Xử Lý Lỗi

| Tình huống | Hành vi |
|---|---|
| Thiếu `GROQ_API_KEY` | Raise lỗi `ValueError` khi khởi động — dịch vụ sẽ không được khởi tạo |
| Cuộc gọi LLM thất bại | Bắt ngoại lệ trong `run_langraph_agent()` → trả về văn bản dự phòng, âm thanh rỗng |
| Node `preflight` lỗi | Fails **open** (chế độ mở) — đầu vào được coi là an toàn, `tool_intent` đặt về false |

---

## Thay Đổi Model

Thiết lập `GROQ_LLM_MODEL` thành bất kỳ model chat nào được Groq hỗ trợ:

```bash
GROQ_LLM_MODEL=llama-3.1-8b-instant   # Nhanh hơn, rẻ hơn, nhưng năng lực kém hơn
GROQ_LLM_MODEL=llama-3.3-70b-versatile  # Mặc định — cân bằng tốt nhất
```

Xem [Tài liệu model Groq](https://console.groq.com/docs/models) để biết các tùy chọn sẵn có.
