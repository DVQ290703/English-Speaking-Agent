# 🧪 Backend Test Suite – Tài liệu kỹ thuật

> **Dự án:** AI Speaking Coach (A20-App-014)
> **Framework:** pytest 9.x · Python 3.10
> **Cập nhật lần cuối:** 2026-04-20

---

## 1. Tổng quan

Bộ test được thiết kế theo nguyên tắc **unit test thuần túy** — toàn bộ external dependency (PostgreSQL, MinIO, Groq LLM, ElevenLabs TTS) đều được mock. Không cần Docker, không cần kết nối mạng, không cần `.env` thực tế.

### 1.1 Mục tiêu

| Mục tiêu | Chi tiết |
|----------|----------|
| **Isolation** | Mỗi test độc lập, không phụ thuộc thứ tự chạy |
| **Speed** | Toàn bộ suite < 10 giây |
| **Coverage** | Security layer · AI services · API routes · Pydantic schemas · **User data flows** |
| **Reliability** | 0 flaky tests — mock state được reset per-test |

### 1.2 Kết quả hiện tại

```
127 passed, 0 failed, 0 warnings — 11s
```

---

## 2. Cấu trúc thư mục

```
tests/
├── conftest.py                          ← Shared fixtures + minio stub
├── __init__.py
│
├── test_security/
│   ├── __init__.py
│   └── test_security.py                 ← 22 tests
│
├── test_ai_services/
│   ├── __init__.py
│   └── test_ai_services.py              ← 21 tests
│
└── test_api/
    ├── __init__.py
    ├── test_schemas.py                  ← 22 tests (Pydantic models)
    ├── test_routes.py                   ← 44 tests (HTTP endpoints)
    └── test_user_data_flow.py           ← 18 tests (user lifecycle & isolation)
```

---

## 3. Cài đặt môi trường test

### 3.1 Kích hoạt virtual environment

**PowerShell:**
```powershell
# Kích hoạt venv
.\.venv\Scripts\Activate.ps1

# Kiểm tra Python đúng venv
python -c "import sys; print(sys.executable)"
```

**Git Bash / WSL:**
```bash
# Kích hoạt venv
source .venv/Scripts/activate

# Kiểm tra Python đúng venv
python -c "import sys; print(sys.executable)"
```

### 3.2 Cài đặt dependencies test

Project tách riêng hai file requirements:

| File | Mục đích | Docker |
|------|----------|--------|
| `requirements.txt` | Production (app chạy thật, có `minio`) | ✅ Dùng |
| `requirements-test.txt` | Test-only (`pytest`, `pytest-cov`) | ❌ Không dùng |

**PowerShell:**
```powershell
# Cài production deps (đã có sẵn nếu chạy app trước)
uv pip install -r requirements.txt

# Cài thêm test deps
uv pip install -r requirements-test.txt

# Hoặc nếu không có uv:
python -m pip install -r requirements.txt
python -m pip install -r requirements-test.txt
```

**Bash:**
```bash
uv pip install -r requirements.txt
uv pip install -r requirements-test.txt

# Hoặc cài cả hai cùng lúc:
python -m pip install -r requirements.txt -r requirements-test.txt
```

> **Lưu ý:** Package `minio` ở trong `requirements.txt` nhưng **không cần kết nối** khi test — `conftest.py` tự inject fake stub vào `sys.modules`.

### 3.3 Biến môi trường

Test **không đọc** file `.env`. Mọi biến được set mặc định tự động trong `conftest.py` và từng file test:

```python
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only-xx")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-el-key")
# ...
```

Không cần tạo `.env` trước khi chạy test.

---

## 4. Chạy test

### 4.1 Chạy toàn bộ suite

**PowerShell:**
```powershell
python -m pytest tests/ -v
```

**Bash:**
```bash
python -m pytest tests/ -v
```

### 4.2 Chạy nhanh (không verbose)

**PowerShell:**
```powershell
python -m pytest tests/ -q
```

**Bash:**
```bash
python -m pytest tests/ -q
```

### 4.3 Chạy một module cụ thể

**PowerShell:**
```powershell
# Security layer
python -m pytest tests/test_security/ -v

# AI services
python -m pytest tests/test_ai_services/ -v

# API routes
python -m pytest tests/test_api/test_routes.py -v

# Pydantic schemas
python -m pytest tests/test_api/test_schemas.py -v
```

**Bash:**
```bash
python -m pytest tests/test_security/ -v
python -m pytest tests/test_ai_services/ -v
python -m pytest tests/test_api/test_routes.py -v
python -m pytest tests/test_api/test_schemas.py -v
```

### 4.4 Chạy một test class hoặc một test cụ thể

**PowerShell:**
```powershell
# Chạy cả class
python -m pytest tests/test_api/test_routes.py::TestLogin -v

# Chạy một test đơn lẻ
python -m pytest tests/test_api/test_routes.py::TestLogin::test_login_happy_path_returns_200_with_token -v
```

**Bash:**
```bash
python -m pytest tests/test_api/test_routes.py::TestLogin -v
python -m pytest tests/test_api/test_routes.py::TestLogin::test_login_happy_path_returns_200_with_token -v
```

### 4.5 Chạy với coverage report

**PowerShell:**
```powershell
# Cài coverage nếu chưa có
python -m pip install pytest-cov

# Chạy với HTML report
python -m pytest tests/ --cov=app --cov-report=html --cov-report=term-missing

# Mở report (Windows)
Start-Process htmlcov\index.html
```

**Bash:**
```bash
python -m pip install pytest-cov

python -m pytest tests/ --cov=app --cov-report=html --cov-report=term-missing

# Mở report (Linux/Mac)
open htmlcov/index.html
# hoặc
xdg-open htmlcov/index.html
```

### 4.6 Chạy với output chi tiết khi fail

**PowerShell:**
```powershell
# Traceback đầy đủ
python -m pytest tests/ -v --tb=long

# Dừng ngay khi có 1 test fail
python -m pytest tests/ -v -x

# Dừng khi có 3 fail
python -m pytest tests/ -v --maxfail=3
```

**Bash:**
```bash
python -m pytest tests/ -v --tb=long
python -m pytest tests/ -v -x
python -m pytest tests/ -v --maxfail=3
```

### 4.7 Chạy theo keyword (filter tên)

**PowerShell:**
```powershell
# Chỉ test liên quan đến login
python -m pytest tests/ -k "login" -v

# Test auth (không phải audio)
python -m pytest tests/ -k "auth and not audio" -v

# Test tất cả happy path
python -m pytest tests/ -k "happy_path" -v
```

**Bash:**
```bash
python -m pytest tests/ -k "login" -v
python -m pytest tests/ -k "auth and not audio" -v
python -m pytest tests/ -k "happy_path" -v
```

---

## 5. Chi tiết từng module test

### 5.1 `test_security.py` — 22 tests

Test layer `app/core/security.py`.

| Class | Số test | Mô tả |
|-------|---------|-------|
| `TestHashPassword` | 4 | bcrypt hashing, unique salt, empty string |
| `TestVerifyPassword` | 5 | correct/wrong/empty/invalid hash/case-sensitive |
| `TestCreateAccessToken` | 4 | payload claims (sub, email, iat, exp) |
| `TestDecodeToken` | 4 | valid/wrong secret/expired/malformed |
| `TestGetCurrentUserID` | 5 | middleware valid/no header/bad token/expired/missing sub |

**Kỹ thuật:**
- Mock `JWT_SECRET_KEY` bằng `os.environ.setdefault`
- Test expiry bằng `timedelta(seconds=-1)`

---

### 5.2 `test_ai_services.py` — 21 tests

Test layer `app/core/ai_services.py`.

| Class | Số test | Mô tả |
|-------|---------|-------|
| `TestNormalizeHistory` | 12 | JSON list, string items, topic handling, limits, empty |
| `TestTranscribeAudio` | 3 | happy path, STT exception, filename pass-through |
| `TestSynthesizeAudioBytes` | 3 | success, exception, TTS returns None |
| `TestRunLangraphAgent` | 6 | happy path, history, empty response fallback, exception fallback, TTS retry |

**Kỹ thuật:**
- Patch global `_stt_client`, `_tts_client`, `_llm` bằng `unittest.mock.patch`
- Patch `app.core.ai_services._pipeline` để mock LangGraph output

---

### 5.3 `test_schemas.py` — 22 tests

Test tất cả Pydantic models trong `app/api/schemas.py`.

| Schema | Test |
|--------|------|
| `LoginRequest` | valid, invalid email, missing field |
| `RegisterRequest` | minimal, full, invalid email |
| `UserOut` | full, nullable fields, missing required |
| `LoginResponse` | token_type default, valid, missing user |
| `ChatResponse` | defaults, with audio, missing conv_id |
| `MessageOut` | valid, with audio_url, nullable fields |
| `ConversationOut` | valid, missing required |
| `ConversationListResponse` | empty, with items |
| `ConversationMessagesResponse` | valid, empty messages |

---

### 5.4 `test_routes.py` — 44 tests

Test tất cả HTTP endpoints trong `app/api/routes.py`.

| Class | Endpoint | Số test |
|-------|----------|---------|
| `TestLogin` | `POST /api/auth/login` | 7 |
| `TestRegister` | `POST /api/auth/register` | 6 |
| `TestMe` | `GET /api/auth/me` | 5 |
| `TestChatRespond` | `POST /api/chat/respond` | 8 |
| `TestListConversations` | `GET /api/conversations` | 4 |
| `TestGetConversationMessages` | `GET /api/conversations/{id}/messages` | 7 |
| `TestHealthCheck` | `GET /health` | 1 |

**Scenarios được cover mỗi endpoint:**

```
✓ Happy path (thành công)
✓ Không có auth token → 401
✓ Token không hợp lệ → 401
✓ Resource không tồn tại → 404
✓ Input validation sai → 400 / 422
✓ Duplicate data → 400
✓ File quá lớn → 413
✓ DB/service lỗi → fallback hoặc 500
```

---

### 5.5 `test_user_data_flow.py` — 18 tests

Test các luồng **từ góc nhìn người dùng đã đăng nhập** — verify rằng dữ liệu được lưu, truy xuất đúng, và bị cô lập giữa các user.

| Class | Số test | Mô tả |
|-------|---------|-------|
| `TestUserLifecycle` | 6 | Register → Login → Me → Chat → List → Messages |
| `TestContinueConversation` | 3 | Tiếp tục conversation cũ, turn_number tăng, user sai → 404 |
| `TestUserIsolation` | 4 | User B không thể xem/chat vào conversation của User A |
| `TestConversationHistory` | 2 | Messages theo thứ tự ASC, conversation rỗng |
| `TestConversationTitle` | 3 | Topic có trong DB, topic không có, không có topic |

**Scenarios đặc biệt:**

```
✓ Full lifecycle: register → login → chat → list history → get messages
✓ Continue existing conversation (conversation_id provided)
✓ Turn number tăng theo lần chat (turn 1, 2, 3...)
✓ User B cố truy cập conversation của User A → 404
✓ User B list conversations → empty list (không thấy data của A)
✓ Conversation topic: found in DB / not found / no topic
✓ Message ordering: oldest first (ASC)
✓ Empty conversation → messages = []
```

**Mock strategy:**
- Mỗi test tạo `_make_conn()` riêng với `fetchone_side_effect` khớp với số DB calls của route
- `conversation_id` là UUID hợp lệ → route gọi SELECT trước khi tiếp tục
- Isolation tests: mock trả `None` cho SELECT → route trả 404

---

## 6. Kiến trúc mock

### 6.1 Sơ đồ mock layer

```
Test File
    │
    ├── sys.modules["minio"] = FakeModule      ← Trước mọi import
    │
    ├── os.environ.setdefault(...)             ← Biến môi trường giả
    │
    ├── patch("app.core.database.init_db_pool") ← Ngăn kết nối DB khi startup
    ├── patch("app.core.storage.init_storage")  ← Ngăn kết nối MinIO khi startup
    │
    └── patch("app.api.routes.get_connection")  ← Mock DB per request
            │
            └── MagicMock cursor
                    ├── cursor.fetchone.side_effect = [row1, row2, ...]
                    └── cursor.fetchall.return_value = [rows...]
```

### 6.2 Helper `_make_conn()`

```python
def _make_conn(fetchone_side_effect=(), fetchall_value=None):
    """
    Tạo mock psycopg2 connection.
    
    Args:
        fetchone_side_effect: list các giá trị trả về theo thứ tự 
                              mỗi lần gọi cursor.fetchone()
        fetchall_value:       giá trị trả về cho cursor.fetchall()
    
    Returns:
        (conn, cursor): tuple mock
    """
```

**Ví dụ — mock cho route tạo conversation mới (không có topic):**
```python
conn = _make_conn(
    fetchone_side_effect=[
        (conv_id,),   # INSERT conversations RETURNING id
        (1,),         # MAX(turn_number) + 1
    ]
)
```

**Ví dụ — mock cho route tạo conversation mới (có topic):**
```python
conn = _make_conn(
    fetchone_side_effect=[
        None,         # SELECT topics WHERE code = ? → không tìm thấy
        (conv_id,),   # INSERT conversations RETURNING id
        (1,),         # MAX(turn_number) + 1
    ]
)
```

### 6.3 Pattern chuẩn cho route test

```python
def test_some_endpoint(self):
    conn = _make_conn(fetchone_side_effect=[...])
    
    with (
        patch("app.api.routes.normalize_history", return_value=[]),
        patch("app.api.routes.run_langraph_agent", return_value=("text", b"audio")),
        patch("app.api.routes.store_user_audio", return_value=None),
        patch("app.api.routes._upload"),
        patch("app.api.routes.get_presigned_url", return_value="http://minio/url"),
    ):
        with _client(conn) as (c, _):
            r = c.post("/api/chat/respond", data={...}, headers=self._headers())
    
    assert r.status_code == 200
    assert r.json()["response_text"] == "text"
```

> **Quan trọng:** Patches phải bao ngoài `_client()` context để đảm bảo còn hiệu lực trong suốt vòng đời request.

---

## 7. Các lỗi thường gặp & cách xử lý

### 7.1 `ModuleNotFoundError: No module named 'minio'`

**Nguyên nhân:** `minio` không được cài trong `.venv`.

**Giải pháp:** Đã được xử lý tự động trong `conftest.py`:
```python
sys.modules.setdefault("minio", FakeMinioModule)
sys.modules.setdefault("minio.error", FakeMinioErrorModule)
```
Không cần cài `minio` vào `.venv`.

---

### 7.2 `StopIteration` — `fetchone` hết side_effect

**Nguyên nhân:** Mock cursor `side_effect` list có ít phần tử hơn số lần route gọi `fetchone()`.

**Cách debug:**
```powershell
python -m pytest tests/test_api/test_routes.py::TestXxx::test_yyy -v --tb=long -s
```

**Giải pháp:** Đếm lại số lần `fetchone()` được gọi trong code route và thêm đủ giá trị:
```python
# Route gọi fetchone() 3 lần → cần 3 giá trị
conn = _make_conn(fetchone_side_effect=[val1, val2, val3])
```

---

### 7.3 Test pass riêng lẻ nhưng fail khi chạy toàn bộ

**Nguyên nhân:** Module cache — `side_effect` của mock bị exhausted từ test trước.

**Giải pháp:** Luôn tạo `_make_conn()` mới trong mỗi test, không dùng class-level mock:
```python
# ❌ Sai — dùng chung mock
class TestFoo:
    _conn = _make_conn(...)  # bị exhausted sau test đầu

# ✅ Đúng — tạo mới mỗi test
class TestFoo:
    def _ok_conn(self):
        return _make_conn(...)  # fresh mỗi lần gọi
```

---

### 7.4 `assert 401 == 403` — Status code sai

**Nguyên nhân:** FastAPI `HTTPBearer` trả `401` khi **thiếu** Authorization header (không phải `403`).

**Quy tắc đúng:**

| Tình huống | Status code |
|-----------|-------------|
| Không có Authorization header | **401** |
| Token sai / expired | **401** |
| Token đúng nhưng không có quyền | **403** |

---

### 7.5 `JSONDecodeError` khi gọi `r.json()`

**Nguyên nhân:** Response body rỗng do server crash (500).

**Cách debug:** Thêm assertion status code trước:
```python
assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
assert r.json()["field"] == expected
```

---

## 8. Thêm test mới

### 8.1 Quy tắc đặt tên

```
test_<tên_hàm>_<scenario>

Ví dụ:
  test_login_happy_path_returns_200_with_token
  test_login_wrong_password_returns_401
  test_register_duplicate_email_returns_400
```

### 8.2 Template cho route test

```python
def test_<endpoint>_<scenario>(self):
    # 1. Chuẩn bị DB mock
    conn = _make_conn(
        fetchone_side_effect=[...],  # theo thứ tự route gọi fetchone
        fetchall_value=[...],        # nếu route gọi fetchall
    )
    
    # 2. Patch external services (nếu route gọi chúng)
    with (
        patch("app.api.routes.run_langraph_agent", return_value=("reply", b"audio")),
        # ... các patch khác
    ):
        with _client(conn) as (c, _):
            r = c.post(
                "/api/endpoint",
                json={...},          # hoặc data={...} cho form
                headers=self._headers(),
            )
    
    # 3. Assertions
    assert r.status_code == 200
    assert r.json()["field"] == expected_value
```

### 8.3 Template cho schema test

```python
def test_<schema>_<scenario>(self):
    with pytest.raises(ValidationError):
        MySchema(invalid_field="bad_value")

# Hoặc happy path
def test_<schema>_valid(self):
    obj = MySchema(field="good_value")
    assert obj.field == "good_value"
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions

File `.github/workflows/test.yml`:

```yaml
name: Backend Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"
      
      - name: Install uv
        run: pip install uv
      
      - name: Install production dependencies
        run: uv pip install -r requirements.txt --system
      
      - name: Install test dependencies
        run: uv pip install -r requirements-test.txt --system
      
      - name: Run tests
        run: python -m pytest tests/
        # Biến môi trường — pytest tự set defaults, chỉ cần override nếu muốn
        env:
          JWT_SECRET_KEY: "ci-test-secret-key-32-chars-minimum"
```

### 9.2 Pre-commit hook

**PowerShell:**
```powershell
# Chạy test trước khi commit
python -m pytest tests/ -q --tb=short
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }
```

**Bash:**
```bash
python -m pytest tests/ -q --tb=short || exit 1
```

---

## 9. Coverage hiện tại và Next Steps

### 9.1 Đã cover (127 tests)

| Layer | File | Tests |
|-------|------|-------|
| Security | `app/core/security.py` | 22 |
| AI Services | `app/core/ai_services.py` | 21 |
| API Schemas | `app/api/schemas.py` | 22 |
| API Routes | `app/api/routes.py` | 44 |
| User Data Flows | routes.py (user-centric) | 18 |
| **Tổng** | | **127** |

### 9.2 Coverage report thực tế (`--cov=app`)

Chạy: `python -m pytest tests/ --cov=app --cov-report=term-missing`

| Module | Stmts | Cover | Ghi chú |
|--------|-------|-------|---------|
| `app/api/routes.py` | 223 | **96%** | 5 dòng exception handling hiếm xảy ra |
| `app/api/schemas.py` | 47 | **100%** | ✅ Full coverage |
| `app/core/security.py` | 36 | **100%** | ✅ Full coverage |
| `app/core/settings.py` | 25 | **88%** | 3 dòng env var edge case |
| `app/core/ai_services.py` | 87 | **84%** | Import-time init code (lines 11–34) |
| `app/core/database.py` | 23 | **43%** | Pool init + retry chưa test |
| `app/core/storage.py` | 75 | **25%** | MinIO upload/presign chưa test |
| `app/agents/pipeline.py` | 32 | **0%** | LangGraph pipeline chưa test |
| `app/agents/state.py` | 6 | **0%** | State schema chưa test |
| `app/services/groq_llm.py` | 46 | **0%** | LLM client chưa test |
| `app/services/groq_stt.py` | 28 | **0%** | STT client chưa test |
| `app/services/elevenlabs_tts.py` | 32 | **0%** | TTS client chưa test |
| **Tổng** | **660** | **64%** | |

### 9.3 Next Steps (ưu tiên theo cover %)

| Module | File | Cover | Ưu tiên |
|--------|------|-------|---------|
| LangGraph pipeline | `app/agents/pipeline.py` | 0% | **Cao** |
| LLM / STT / TTS clients | `app/services/` | 0% | **Cao** |
| Storage layer | `app/core/storage.py` | 25% | Trung bình |
| Database helpers | `app/core/database.py` | 43% | Trung bình |
| Agent state | `app/agents/state.py` | 0% | Thấp |

---

## 10. Tham khảo

| Tài nguyên | Link |
|-----------|------|
| pytest docs | https://docs.pytest.org |
| FastAPI TestClient | https://fastapi.tiangolo.com/tutorial/testing/ |
| unittest.mock | https://docs.python.org/3/library/unittest.mock.html |
| GitHub Actions CI | `.github/workflows/test.yml` |
| Product Spec | `document/ai_speaking_coach_technical_product_spec.md` |
| API Reference | `API.md` |
| WORKLOG ADR-3 | `WORKLOG.md` — quyết định testing strategy |
