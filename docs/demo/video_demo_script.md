# Video Demo Script (3–5 phút) — AI LinguAI

## Tổng thời lượng mục tiêu
- 3 phút 30 giây đến 4 phút 30 giây.

## 0:00–0:30 | Mở đầu: Bài toán
Xin chào, nhóm em trình bày dự án **LinguAI (A20-App-014)**.
Bài toán nhóm em giải quyết là người học tiếng Anh thiếu môi trường thực tế luyện tập tiếng anh, ngại giao tiếp với người khác, và thiếu feedback chính xác để cải thiện kỹ năng nói. Dự án của nhóm em là một ứng dụng giúp người học luyện tập giao tiếp theo tình huống thực tế, nhận phản hồi chi tiết về ngữ pháp, phát âm, và gợi ý câu nói tiếp theo để cải thiện kỹ năng nói tiếng Anh hiệu quả hơn.

## 0:30–0:55 | Người dùng mục tiêu
Người dùng chính là học viên luyện giao tiếp theo tình huống thực tế như phỏng vấn, du lịch, IELTS speaking.

## 0:55–2:20 | Demo luồng chính
1. Chọn topic và bắt đầu phiên luyện.
2. Người dùng gửi text hoặc audio.
3. AI coach trả phản hồi + audio.
4. Panel feedback hiển thị lỗi ngữ pháp và gợi ý câu nói tiếp theo.
5. Nếu là audio, hệ thống gọi pronunciation assessment.
6. Kết thúc mini-session có lịch sử và score để xem lại.

## 2:20–3:10 | AI Agent xử lý phía sau
Luồng kỹ thuật: User -> Frontend React -> FastAPI `/api/chat/respond` -> Agent pipeline (LangGraph).
Pipeline gồm preflight safety/tool, generate response, tool calling (flashcard), TTS, và lưu dữ liệu.

## 3:10–3:50 | Kết quả hiện tại
Nhóm đã có evaluation trong repo.
Kết quả hard cases: pass rate 10%, overall score 4.0/5.0
Điểm mạnh là safety và chống prompt injection; điểm cần cải thiện là coaching grammar/pronunciation.

## 3:50–4:20 | Kết luận + roadmap
Dự án đã chạy end-to-end: chat/voice, feedback, lưu lịch sử, flashcard.
Roadmap tiếp theo: nâng chất lượng coaching, tăng guardrails tình huống nhạy cảm, tối ưu UX.

## Gợi ý quay demo
- Dùng một scenario xuyên suốt.
- Kiểm tra mạng và micro trước khi quay.
- Có phương án fallback quay local nếu live URL không ổn định.
- Không hiển thị secrets/token trên màn hình.
