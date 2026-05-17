# Backend Test Suite Documentation

> Project: AI LinguAI (A20-App-014)  
> Framework: `pytest`  
> Scope: backend unit and route tests

## 1. Overview

The backend test suite is designed around isolated tests with mocked external dependencies.

Goals:

- no real PostgreSQL/MinIO/Groq/ElevenLabs calls for the main suite
- predictable route behavior through mocked DB cursors
- fast feedback for auth, API, schema, and service logic

Latest full-suite status (local):

- `536 passed, 0 skipped, 0 failed` (pytest over `tests/`)

## 2. Current Test Modules

| Module | File | Test Count |
| --- | --- | ---: |
| Security | `tests/test_security/test_security.py` | 23 |
| AI services | `tests/test_ai_services/test_ai_services.py` | 25 |
| API schemas | `tests/test_api/test_schemas.py` | 30 |
| API routes | `tests/test_api/test_routes.py` | 51 |
| User data flow | `tests/test_api/test_user_data_flow.py` | 18 |
| Azure assessment service | `tests/test_services/test_azure_assessment.py` | 18 |
| Total test functions defined |  | 165 |

Notes:

- the Azure assessment module depends on `azure-cognitiveservices-speech`
- in environments without that dependency, the rest of the suite can still be run separately

## 3. Verified Local Commands

The following command groups were verified against the current codebase:

```bash
python -m pytest tests/test_security/test_security.py tests/test_api/test_routes.py tests/test_api/test_user_data_flow.py -q
python -m pytest tests/test_api/test_schemas.py tests/test_ai_services/test_ai_services.py -q
python -m pytest tests/ -q
```

Current full-suite result in this environment:

- 536 passed
- 0 skipped
- 0 failed

Azure-specific module can also be run directly when needed:

```bash
python -m pytest tests/test_services/test_azure_assessment.py -q
```

## 4. Test Architecture

### 4.1 Mock Strategy

The tests rely heavily on:

- `unittest.mock.patch`
- fake `minio` modules injected into `sys.modules`
- mocked DB connections/cursors
- patched AI service calls

### 4.2 Shared Fixtures

See `tests/conftest.py` for:

- environment defaults
- stubbed MinIO import
- auth header factory
- base `TestClient` fixture

### 4.3 DB Mock Pattern

Route tests typically mock:

- `app.api.routes.get_connection`
- `cursor.fetchone()`
- `cursor.fetchall()`

This allows each route to be tested without a real database.

## 5. Coverage Areas

### Security

Covered behaviors:

- bcrypt hashing
- password verification
- invalid hash handling
- JWT claims
- expired and malformed token handling

### API Routes

Covered behaviors:

- register/login/me
- chat text and audio flows
- audio size checks
- UUID validation
- conversation ownership isolation
- assessment route validation
- security headers on `/health`

### Schemas

Covered behaviors:

- email validation and normalization
- response model defaults
- Azure result normalization for syllables and phonemes

### AI Services

Covered behaviors:

- history parsing
- STT fallback
- TTS fallback
- pipeline fallback response

### User Flows

Covered behaviors:

- full user lifecycle
- continuing an existing conversation
- message ordering
- per-user access isolation

## 6. Running Tests

### Full suite

```bash
python -m pytest tests/ -v
```

### Fast run

```bash
python -m pytest tests/ -q
```

Expected current summary:

- `536 passed, 0 skipped`

### One module

```bash
python -m pytest tests/test_api/test_routes.py -v
```

### One class

```bash
python -m pytest tests/test_api/test_routes.py::TestAssessRoute -v
```

### Keyword filter

```bash
python -m pytest tests/ -k "login" -v
```

### Coverage

```bash
python -m pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
```

## 7. Common Issues

### Missing Azure SDK

Symptom:

- `ModuleNotFoundError: No module named 'azure'`

Fix:

- install packages from `requirements.txt`

### Route test fails with `StopIteration`

Symptom:

- mocked cursor ran out of `fetchone()` values

Fix:

- update the side-effect list to match the route's DB calls

### `415 Unsupported Media Type`

Symptom:

- audio route rejects a fake upload

Reason:

- backend now validates both declared content type and binary signature

## 8. Related Files

- `tests/conftest.py`
- `tests/helpers/db_mocks.py`
- `tests/test_api/test_routes.py`
- `tests/test_api/test_user_data_flow.py`
- `tests/test_security/test_security.py`
- `tests/test_ai_services/test_ai_services.py`
- `tests/test_services/test_azure_assessment.py`

