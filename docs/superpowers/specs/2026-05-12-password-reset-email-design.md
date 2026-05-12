# Password Reset Email Feature - Design

**Date:** 2026-05-12  
**Scope:** Full stack + deployment configuration  
**Branch:** feat/password

---

## Summary

Implement a production-ready forgot-password flow that sends a real reset-password link to the user's email via SMTP, allows the user to open the frontend reset page, and enforces a strict 5-minute token lifetime. The API must not reveal whether an email is registered, the reset token must be single-use, and the flow must work both locally and on the existing GKE deployment.

---

## Goals

- Send a real password reset email from the backend using SMTP.
- Generate frontend reset links using `FRONTEND_URL`.
- Expire reset links after exactly 5 minutes.
- Revoke previously active reset tokens whenever a new reset link is issued.
- Keep the forgot-password response generic to prevent account enumeration.
- Preserve local developer ergonomics by keeping `preview_reset_url` only outside production.
- Fit the existing deployment model where backend configuration comes from the `backend-secret` Kubernetes Secret.

## Non-Goals

- Building a background job or queue-based email worker.
- Adding rate limiting specific to forgot-password beyond existing global guardrails.
- Supporting multiple email providers in this iteration.
- Redesigning the existing forgot/reset password frontend pages.

---

## Chosen Approach

Use direct SMTP delivery from the FastAPI backend through a dedicated email service module. The auth route will create a one-time token, store only its SHA-256 hash in Postgres, build a frontend reset URL, and send the link by email. The existing frontend reset page remains the entry point for users who click the email link.

This is the best fit for the current codebase because:

- The repo already uses environment-based secrets and synchronous request handlers.
- GKE deployment already loads backend secrets through `envFrom: backend-secret`.
- SMTP works in both Docker/local development and GKE without introducing a new queue or provider SDK.
- The mail-sending implementation can later be swapped behind a small service boundary without changing route contracts.

---

## End-to-End Flow

### Forgot Password

1. User submits an email on `/forgot-password`.
2. Frontend calls `POST /api/auth/forgot-password`.
3. Backend normalizes the email and looks up an active local-password account.
4. If no matching local-password account exists, backend returns the same generic success response without sending email.
5. If a matching account exists:
   - revoke existing live reset tokens for that user,
   - generate a new raw token,
   - hash it with SHA-256,
   - store the hash with `expires_at = now + 5 minutes`,
   - build `FRONTEND_URL/reset-password?token=...`,
   - send the email through SMTP.
6. Backend returns the same generic success response regardless of whether the account exists.
7. In non-production only, the response may still include `preview_reset_url` for local testing.

### Reset Password

1. User opens the email link on the frontend route `/reset-password?token=...`.
2. Frontend displays the reset password form and submits `POST /api/auth/reset-password`.
3. Backend validates the token by hash and checks:
   - token exists,
   - token is not used,
   - token is not revoked,
   - token is not expired,
   - linked user is active.
4. Backend updates the user's password hash.
5. Backend marks the matching token as used and revokes any other remaining reset tokens for that user.
6. Frontend redirects the user back to `/login` after success.

---

## Architecture

### Backend Auth Route

`app/api/auth.py` remains the orchestration point for forgot-password and reset-password. The route contract stays stable, but the implementation changes in two important ways:

- `_PASSWORD_RESET_TTL_MINUTES` changes from `60` to `5`.
- Real email delivery is added through a dedicated SMTP service instead of relying only on `preview_reset_url`.

The forgot-password route should keep a generic public response, but internally it should distinguish between:

- unknown email,
- inactive account,
- OAuth-only account,
- valid local-password account.

Only the valid local-password account path should issue a new token and attempt email delivery.

### Email Service

Add a dedicated module, `app/services/email_service.py`, with a narrow API such as `send_password_reset_email(to_email, reset_url, expires_minutes)`.

Responsibilities:

- build a plain-text and HTML email body,
- connect using SMTP over SSL or SMTP + STARTTLS,
- authenticate if credentials are provided,
- set a network timeout,
- raise a dedicated delivery exception on failure.

This service must not know about database logic or token generation.

### Configuration

Add SMTP settings to `app/core/settings.py`:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_USE_STARTTLS`
- `SMTP_USE_SSL`
- `SMTP_TIMEOUT_SECONDS`

Production and staging should fail fast at startup if required SMTP settings are missing or invalid.

### Frontend

The existing frontend pages already match the target flow:

- `frontend/src/pages/ForgotPasswordPage.jsx`
- `frontend/src/pages/ChangePasswordPage.tsx`

No route contract changes are needed. The frontend should keep:

- generic success messaging after forgot-password submission,
- local-only preview-link handling when `preview_reset_url` exists,
- reset-token parsing from the `token` query string,
- redirect to `/forgot-password` when the reset link is missing or invalid.

Copy may be tightened so reset-mode error states clearly tell the user to request a new link.

---

## File-Level Changes

### `app/api/auth.py`

- Set password reset TTL to 5 minutes.
- Keep `_build_password_reset_url()` based on `FRONTEND_URL`.
- Call the new email service after inserting a token for a valid local-password account.
- Maintain generic success response for all forgot-password submissions.
- Ensure no raw token value is ever logged.
- On successful reset, continue to mark the token used and revoke remaining active tokens.

### `app/services/email_service.py`

- New file.
- Implement SMTP connection and password reset email composition.
- Provide a dedicated exception type for delivery failure.

### `app/core/settings.py`

- Add SMTP configuration loading and validation.
- Fail fast in `production` and `staging` if required mail settings are missing.

### `app/api/schemas.py`

- Keep `ForgotPasswordResponse.preview_reset_url: str | None = None`.
- No public schema changes required.

### `frontend/src/pages/ForgotPasswordPage.jsx`

- Keep current API call and success UI.
- Continue showing `preview_reset_url` only when the backend sends it outside production.

### `frontend/src/pages/ChangePasswordPage.tsx`

- Keep reset mode on `/reset-password`.
- Improve invalid-or-missing-token messaging if needed.

### `.env.prod.example`

- Add placeholder SMTP variables for production deployment.
- Remove any real-looking secrets from the example file and replace them with placeholders.

### `deployments/backend/deploy.yaml`

- No structural change required because backend env already comes from `backend-secret`.
- Comments may be updated to mention SMTP configuration if useful.

---

## Database Behavior

The existing `password_reset_tokens` table is sufficient:

- `user_id`
- `token_hash`
- `expires_at`
- `used_at`
- `revoked_at`
- `created_at`

No new schema is required for SMTP delivery itself.

Token rules:

- Store only `token_hash`, never the raw token.
- Token validity window is exactly 5 minutes from creation.
- Only one active live token should remain after a new forgot-password request.
- Reset token becomes invalid after first successful use.

---

## Deployment On GKE

Production email sending should work with the current ingress and secret model:

- `FRONTEND_URL` should point to the public HTTPS domain, currently `https://vinai-speaking-agent.duckdns.org`.
- Reset links should therefore open on:

```text
https://vinai-speaking-agent.duckdns.org/reset-password?token=...
```

- GKE ingress already routes `/*` to the frontend service, so the SPA reset route works without ingress changes.
- SMTP settings should be added to the existing `backend-secret`.

Recommended `backend-secret` additions:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=CHANGE_ME
SMTP_PASSWORD=CHANGE_ME
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=English Speaking Agent
SMTP_USE_STARTTLS=true
SMTP_USE_SSL=false
SMTP_TIMEOUT_SECONDS=10
```

Operational note:

- `.env.prod.example` currently appears to contain populated secrets and should be sanitized and rotated if those values are real.

---

## Security And Failure Handling

### Account Enumeration

`POST /api/auth/forgot-password` must always return the same `200` success payload, even when:

- the email is unknown,
- the user is inactive,
- the account is OAuth-only,
- email sending fails.

### Token Confidentiality

- Never log raw reset tokens.
- Never persist raw reset tokens.
- Only email the raw token inside the generated frontend URL.

### SMTP Failure

For valid local-password accounts, email delivery should be attempted in the request flow. If email delivery fails:

- roll back the token insert and token revocation changes for that request,
- log the failure with masked user email,
- still return the same generic success response to the client.

This preserves both security and consistency: the system does not leave behind a live token that the user never received.

### Reset Validation Errors

`POST /api/auth/reset-password` should keep returning a single generic client-visible error:

```text
Reset link is invalid or expired
```

That same error should cover:

- missing token,
- unknown token,
- expired token,
- revoked token,
- already-used token.

---

## Testing Strategy

### Backend Tests

Add or update tests for:

- existing local-password account sends email and inserts token,
- unknown email returns generic success and sends nothing,
- OAuth-only account returns generic success and sends nothing,
- production response hides `preview_reset_url`,
- non-production response can still include `preview_reset_url`,
- SMTP failure rolls back token changes and still returns generic success,
- reset token expires after 5 minutes,
- reset token is single-use,
- prior active reset tokens are revoked,
- password hash is updated on successful reset,
- no raw token is logged.

### Frontend Verification

Verify:

- forgot-password page still submits correctly,
- success state remains generic,
- preview link appears only in non-production flows,
- reset page accepts `token` from query string,
- missing-token state routes users back toward `/forgot-password`,
- successful reset returns the user to `/login`.

### Configuration Tests

Add tests for startup/config validation so `production` and `staging` fail fast when required SMTP settings are absent.

---

## Out Of Scope

- Email templates stored outside the codebase.
- Branded email design beyond a clean transactional message.
- Queue-based delivery retries.
- Admin UI for inspecting or revoking reset tokens.
- Passwordless sign-in or magic-link authentication.
