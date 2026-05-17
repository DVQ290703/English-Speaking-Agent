# Hướng Dẫn Xác Thực (Authentication Guide)

API sử dụng **mã JWT Bearer token** (thuật toán HS256, hết hạn sau 1 giờ). Không sử dụng cookie, không lưu session trên server — mỗi yêu cầu (request) phải đính kèm token trong header `Authorization`.

---

## Đăng Ký (Register)

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "display_name": "Alice",
    "password": "SecurePass1!"
  }'
```

**Phản hồi mã 201 (Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "email": "alice@example.com",
    "display_name": "Alice",
    "english_level": null
  }
}
```

**Yêu cầu mật khẩu:** Dài ít nhất 12 ký tự, bao gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.

---

## Đăng Nhập (Login)

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "SecurePass1!"}'
```

**Phản hồi mã 200 (OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "email": "alice@example.com",
    "display_name": "Alice",
    "english_level": "B2"
  }
}
```

---

## Lấy Thông Tin Người Dùng Hiện Tại (Get Current User)

```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

**Phản hồi mã 200 (OK):**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "alice@example.com",
  "display_name": "Alice",
  "english_level": "B2"
}
```

---

## Quên Mật Khẩu (Forgot Password)

Gửi một đường dẫn đặt lại mật khẩu đến email của người dùng (thông qua dịch vụ Resend). Đường dẫn này có hiệu lực trong vòng **5 phút**.

```bash
curl -X POST http://localhost:8000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com"}'
```

**Phản hồi mã 200 (OK)** (luôn trả về mã 200 — không tiết lộ liệu tài khoản có thực sự tồn tại hay không):
```json
{ "message": "If the account exists, a reset link has been generated." }
```

> **Lưu ý:** Khi chạy ở chế độ `APP_ENV=development` (môi trường phát triển), trường `preview_reset_url` sẽ được đính kèm trực tiếp trong thân phản hồi thay vì chỉ được gửi duy nhất qua email.

---

## Đặt Lại Mật Khẩu (Reset Password)

```bash
curl -X POST http://localhost:8000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<reset_token>", "new_password": "NewSecurePass2@"}'
```

**Phản hồi mã 200 (OK):**
```json
{ "message": "Password reset successfully." }
```

**Các lỗi thường gặp:**
- `400` — token đã hết hạn, đã được sử dụng hoặc bị thu hồi trước đó
- `400` — mật khẩu mới không đáp ứng chính sách bảo mật mật khẩu

---

## Đổi Mật Khẩu (Change Password)

Yêu cầu người dùng phải xác thực (đăng nhập).

```bash
curl -X POST http://localhost:8000/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password": "SecurePass1!", "new_password": "NewSecurePass2@"}'
```

**Phản hồi mã 200 (OK):**
```json
{ "message": "Password changed successfully." }
```

---

## Đăng Nhập Qua Bên Thứ Ba (OAuth)

Tính năng đăng nhập OAuth được triển khai đầy đủ. Luồng hoạt động cụ thể như sau:

1. **GET /api/auth/oauth/login/{provider}** — Yêu cầu lấy URL ủy quyền cho nhà cung cấp dịch vụ được chọn.

```bash
curl http://localhost:8000/api/auth/oauth/login/google
```

**Phản hồi mã 200 (OK):**
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
}
```

Frontend cần thực hiện điều hướng người dùng tới đường dẫn `auth_url` nhận được, nơi họ sẽ thực hiện đăng nhập bằng tài khoản của nhà cung cấp đó.

2. **GET /api/auth/oauth/{provider}/callback** — Các nhà cung cấp OAuth sẽ điều hướng người dùng về đây sau khi họ chấp nhận ủy quyền. Endpoint này sẽ trao đổi mã ủy quyền lấy thông tin tài khoản, tạo mới hoặc liên kết với tài khoản người dùng sẵn có, sau đó điều hướng về frontend kèm theo mã JWT token nằm trong URL fragment.

**Đường dẫn Điều hướng (Mã 302):**
```
https://app.example.com/auth/callback#token=eyJhbGc...&expires_in=3600&user=%7B%22id%22%3A...%7D
```

Token này giống hệt token được sinh ra từ các endpoint `/login` hoặc `/register`, có hiệu lực trong vòng **1 giờ**.

**Các nhà cung cấp được hỗ trợ:** `google`, `microsoft`, `facebook`

**Điểm quan trọng cần lưu ý:**
- Nếu một người dùng sẵn có trong hệ thống có địa chỉ email trùng khớp với địa chỉ email đã được xác minh của tài khoản OAuth, tài khoản OAuth đó sẽ được liên kết trực tiếp với người dùng này một cách tự động.
- Nếu không tìm thấy trùng khớp, hệ thống sẽ tạo một người dùng mới.
- URL điều hướng chứa đối tượng `user` đã được mã hóa JSON (chứa các trường `id`, `email`, `display_name`, và `english_level`) để frontend có thể thiết lập trạng thái giao diện cho người dùng ngay lập tức.
