# Authentication Guide

The API uses **JWT Bearer tokens** (HS256, 1-hour expiry). No cookies, no sessions on the server — each request must include the token in the `Authorization` header.

---

## Register

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "display_name": "Alice",
    "password": "SecurePass1!"
  }'
```

**Response 201:**
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

**Password requirements:** 12+ characters, uppercase, lowercase, digit, symbol.

---

## Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "SecurePass1!"}'
```

**Response 200:**
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

## Get Current User

```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

**Response 200:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "email": "alice@example.com",
  "display_name": "Alice",
  "english_level": "B2"
}
```

---

## Forgot Password

Sends a reset link to the user's email (via Resend). The link is valid for **5 minutes**.

```bash
curl -X POST http://localhost:8000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com"}'
```

**Response 200** (always — does not reveal whether the account exists):
```json
{ "message": "If the account exists, a reset link has been generated." }
```

> **Note:** When `APP_ENV=development`, the `preview_reset_url` field is included in the response body instead of the link being sent by email only.

---

## Reset Password

```bash
curl -X POST http://localhost:8000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token": "<reset_token>", "new_password": "NewSecurePass2@"}'
```

**Response 200:**
```json
{ "message": "Password reset successfully." }
```

**Errors:**
- `400` — token expired, already used, or revoked
- `400` — new password does not meet policy

---

## Change Password

Requires authentication.

```bash
curl -X POST http://localhost:8000/api/auth/change-password \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"current_password": "SecurePass1!", "new_password": "NewSecurePass2@"}'
```

**Response 200:**
```json
{ "message": "Password changed successfully." }
```

---

## OAuth

OAuth login is fully implemented. The flow works as follows:

1. **GET /api/auth/oauth/login/{provider}** — Request authorization URL for the given provider.

```bash
curl http://localhost:8000/api/auth/oauth/login/google
```

**Response 200:**
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
}
```

The frontend should redirect the user to the returned `auth_url`, where they log in with their OAuth provider credentials.

2. **GET /api/auth/oauth/{provider}/callback** — OAuth providers redirect here after the user authorizes. The endpoint exchanges the authorization code for an identity, creates or links a user account, and redirects to the frontend with a JWT token in the URL fragment.

**Redirect (302):**
```
https://app.example.com/auth/callback#token=eyJhbGc...&expires_in=3600&user=%7B%22id%22%3A...%7D
```

The token is identical to one returned by `/login` or `/register`, valid for **1 hour**.

**Supported providers:** `google`, `microsoft`, `facebook`

**Important:** 
- If an existing user has a verified email matching the OAuth email, the OAuth account is linked to that user automatically.
- If no match, a new user is created.
- The redirect includes `user` (JSON-encoded) with `id`, `email`, `display_name`, and `english_level` fields for the frontend to populate user state immediately.
