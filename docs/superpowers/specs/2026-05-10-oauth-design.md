# OAuth Login (Google + Microsoft) — Design Spec

## Goal

Allow users to sign in with Google or Microsoft instead of (or alongside) email/password, using Authorization Code Flow with a backend callback.

## Decisions

| Question | Decision |
|---|---|
| Callback receiver | Backend (`GET /api/auth/oauth/callback/{provider}`) |
| Microsoft tenant | `common` — personal + work/school accounts |
| Existing email match | Auto-link: silently link OAuth account to existing password account |
| Library | None — implement directly with `httpx` + `PyJWT` |

---

## Database

**File:** `db_schema/schema.sql` (modified in-place, no separate migration)

### Changes to `users`
```sql
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;  -- OAuth users have no password

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ;
```

For OAuth-created users: `password_hash = NULL`, `email_verified = TRUE`, `email_verified_at = NOW()`.

### New table: `oauth_accounts`
```sql
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    provider_user_id        TEXT NOT NULL,
    provider_email          CITEXT,
    provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    provider_display_name   TEXT,
    provider_avatar_url     TEXT,
    provider_tenant_id      TEXT,
    granted_scopes          TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_oauth_accounts_provider_user UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id
    ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_email
    ON oauth_accounts(provider_email);

CREATE TRIGGER trg_oauth_accounts_updated_at
    BEFORE UPDATE ON oauth_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Backend

### New file: `app/api/oauth.py`

Router prefix: `/auth/oauth`, registered in `app/api/router.py` under the existing `/api` prefix.

#### `GET /api/auth/oauth/login/{provider}`

1. Validate `provider` ∈ `{'google', 'microsoft'}` → 400 if not
2. Generate `state = secrets.token_hex(32)`
3. Store in Redis: `oauth_state:{state}` = `provider`, TTL = 600 seconds
4. Build authorization URL:
   - **Google:** `https://accounts.google.com/o/oauth2/v2/auth`
     params: `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`, `prompt=select_account`
   - **Microsoft:** `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
     params: same + `scope=openid email profile`
5. Return `{ auth_url: string }`

#### `GET /api/auth/oauth/callback/{provider}`

1. Read `code`, `state` from query params; if either missing → redirect to `{FRONTEND_URL}/login?error=oauth_failed`
2. `GET redis.get(f"oauth_state:{state}")` → verify it equals `provider`; delete key immediately. If mismatch/missing → redirect error
3. Exchange code:
   - **Google token endpoint:** `https://oauth2.googleapis.com/token`
   - **Microsoft token endpoint:** `https://login.microsoftonline.com/common/oauth2/v2.0/token`
   - POST with `client_id`, `client_secret`, `code`, `redirect_uri`, `grant_type=authorization_code`
4. Decode `id_token` from response — verify signature via provider JWKS:
   - **Google JWKS:** `https://www.googleapis.com/oauth2/v3/certs`
   - **Microsoft JWKS:** `https://login.microsoftonline.com/common/discovery/v2.0/keys`
5. Extract claims:
   - Google: `sub` → `provider_user_id`, `email`, `email_verified`, `name`, `picture`
   - Microsoft: `oid` → `provider_user_id`, `email` (fallback: `preferred_username`), `name`, `tid` → `provider_tenant_id`
6. Run find-or-create (see below)
7. Call `create_access_token(user_id, email)` → `(token, expires_in)`
8. Build redirect URL: `{FRONTEND_URL}/auth/callback#token={token}&expires_in={expires_in}&user={json.dumps(user)}`
9. Return `RedirectResponse(url, status_code=302)`

Any exception during steps 3–7 → redirect to `{FRONTEND_URL}/login?error=oauth_failed`

#### Find-or-Create Logic

```
provider_user_id = sub (Google) or oid (Microsoft)
provider_email   = email claim from id_token
email_verified   = email_verified claim (Google) or True for Microsoft (Azure-verified)

Step 1: SELECT user_id FROM oauth_accounts
        WHERE provider = $provider AND provider_user_id = $provider_user_id
        → Found: return user_id

Step 2: Not found + email_verified = True:
        SELECT id, email FROM users WHERE email = $provider_email
        → Found: INSERT oauth_accounts (link to existing user), return user_id

Step 3: Not found (or email_verified = False):
        INSERT INTO users (email, display_name, avatar_url,
                           password_hash=NULL, email_verified=True, email_verified_at=NOW())
        INSERT INTO oauth_accounts
        Return new user_id
```

Do NOT look up user by email if `email_verified = False` — never link unverified emails.

### Modified: `app/core/settings.py`

Add OAuth credentials and frontend URL:
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
FRONTEND_URL          (e.g. http://localhost:5173 in dev)
```

Derive redirect URIs from `FRONTEND_URL` at startup:
```python
GOOGLE_REDIRECT_URI    = f"{APP_BASE_URL}/api/auth/oauth/callback/google"
MICROSOFT_REDIRECT_URI = f"{APP_BASE_URL}/api/auth/oauth/callback/microsoft"
```
where `APP_BASE_URL` = new env var `APP_BASE_URL` (e.g. `http://localhost:8000`).

### Modified: `app/api/router.py`

```python
from app.api.oauth import router as oauth_router
router.include_router(oauth_router)
```

---

## Frontend

### New file: `frontend/src/components/auth/OAuthButtons.tsx`

Two buttons using existing Radix UI + Tailwind patterns:
- "Continue with Google" — `FcGoogle` icon from `react-icons/fc`
- "Continue with Microsoft" — `SiMicrosoft` icon from `react-icons/si`

On click:
```typescript
const res = await fetch(`${API_BASE}/api/auth/oauth/login/${provider}`)
const { auth_url } = await res.json()
window.location.href = auth_url
```

Shows a loading state on the clicked button while fetching `auth_url`.

### New file: `frontend/src/pages/OAuthCallbackPage.tsx`

Lazy-loaded. Mounted at `/auth/callback` under `PublicRoute`.

On mount:
1. Parse `window.location.hash` → extract `token`, `expires_in`, `user` (URL-decoded JSON)
2. If `?error=oauth_failed` in search params → show error toast, `navigate('/login')`
3. If fragment missing/malformed → `navigate('/login?error=oauth_failed')`
4. Call `AuthContext.login({ token, user })`
5. `navigate('/chat', { replace: true })` — `replace` so back button skips this page

While processing: centered `<Spinner />` (existing component) with "Signing you in…" text.

### Modified: `frontend/src/router.tsx`

Add inside existing `PublicRoute` children:
```typescript
{
  path: 'auth/callback',
  element: (
    <Suspense fallback={<PageFallback />}>
      <OAuthCallbackPage />
    </Suspense>
  ),
}
```

### Modified: Login page

Add `<OAuthButtons />` below existing form:
```tsx
<Separator className="my-4" label="or continue with" />
<OAuthButtons />
```

---

## Security

| Concern | Mitigation |
|---|---|
| CSRF on callback | `state` token verified in Redis, deleted on first use |
| State replay | Redis key deleted immediately after verification |
| Email spoofing → account takeover | Email-based linking only when `email_verified = True` |
| Token in URL fragment | Fragment never sent to server, not in access logs |
| Code interception | State mismatch check rejects replayed codes |
| OAuth users with no password | `password_hash = NULL`; `verify_password_with_padding` already handles `None` |

---

## Environment Variables

```bash
# Backend (.env)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
APP_BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173

# Frontend (.env)
VITE_API_BASE_URL=http://localhost:8000
```

Redirect URIs to register in provider consoles:
- Google: `{APP_BASE_URL}/api/auth/oauth/callback/google`
- Microsoft: `{APP_BASE_URL}/api/auth/oauth/callback/microsoft`

---

## Testing

### Backend (pytest)
- `test_login_url_google` — returns valid Google auth URL with state param
- `test_login_url_microsoft` — returns valid Microsoft auth URL
- `test_login_url_invalid_provider` — returns 400
- `test_callback_new_user` — new OAuth identity → creates user + oauth_account, redirects with token fragment
- `test_callback_existing_oauth` — known `(provider, provider_user_id)` → returns same user
- `test_callback_email_autolink` — existing password user, same verified email → links, returns existing user
- `test_callback_unverified_email_no_link` — `email_verified=False` → creates new user, no email match
- `test_callback_state_replay` — using state token twice → second request redirects to error
- `test_callback_missing_state` → redirects to error
- `test_callback_code_exchange_failure` → redirects to error (httpx mock 400)

### Frontend (Vitest + RTL)
- `OAuthButtons` renders Google and Microsoft buttons
- `OAuthButtons` redirects window on click
- `OAuthCallbackPage` calls `AuthContext.login` and navigates to `/chat` on valid fragment
- `OAuthCallbackPage` navigates to `/login` on malformed fragment
- `OAuthCallbackPage` navigates to `/login` on `?error=oauth_failed`
