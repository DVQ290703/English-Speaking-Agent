# A20-App-014

Setup and run guide for the current AI Speaking Coach project.

## Prerequisites

- Python 3.10+
- `uv`
- Node.js 18+
- Docker Desktop
- Git

## 1. Clone the repo

```bash
git clone <your-repo-url>
cd A20-App-014
```

## 2. Python environment

Create the virtual environment:

```bash
uv venv
```

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Git Bash:

```bash
source .venv/Scripts/activate
```

Install dependencies:

```bash
uv pip install -r requirements.txt
uv pip install -r requirements-test.txt
```

## 3. Environment variables

Create `.env` from `.env.example`.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Git Bash:

```bash
cp .env.example .env
```

Required values for local development:

- `APP_ENV`
- `JWT_SECRET_KEY`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `GROQ_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_VOICE_ID_MALE`
- `ELEVENLABS_VOICE_ID_FEMALE`
- `ELEVENLABS_MODEL_ID`
- `VITE_API_BASE_URL`

Optional if you use pronunciation assessment:

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`

Security notes:

- use a strong `JWT_SECRET_KEY` with at least 32 characters
- avoid default credentials for PostgreSQL and MinIO outside local development
- Docker Compose maps `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` into the MinIO container automatically

## 4. Start the backend stack

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Expected services:

- `voice_agent_backend`
- `voice_agent_postgres`
- `voice_agent_pgadmin`
- `voice_agent_minio`

## 5. Seed PostgreSQL data

PowerShell:

```powershell
Get-Content .\db_schema\seed.sql | docker exec -i voice_agent_postgres psql -U admin -d voice_agent
```

Git Bash:

```bash
docker exec -i voice_agent_postgres psql -U admin -d voice_agent < db_schema/seed.sql
```

Seeded demo users:

- `alice@example.com / Password123!`
- `bob@example.com / Password123!`
- `charlie@example.com / Password123!`

Note:

- these seeded passwords exist for local demo data only
- new registrations through the API now require a stronger password policy: at least 12 characters with uppercase, lowercase, digit, and symbol

## 6. Verify the backend

Health check:

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"status":"ok"}
```

Database quick check:

```bash
docker exec -it voice_agent_postgres psql -U admin -d voice_agent -c "SELECT email, length(password_hash) FROM users ORDER BY email;"
```

## 7. Run the frontend locally

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

- `http://localhost:5173`

Production build:

```bash
npm run build
npm run preview
```

## 8. Run tests

Main backend test commands:

PowerShell:

```powershell
python -m pytest tests/test_security/test_security.py tests/test_api/test_routes.py -q
python -m pytest tests/test_api/test_schemas.py tests/test_ai_services/test_ai_services.py -q
```

Git Bash:

```bash
python -m pytest tests/test_security/test_security.py tests/test_api/test_routes.py -q
python -m pytest tests/test_api/test_schemas.py tests/test_ai_services/test_ai_services.py -q
```

Current test layout contains:

- security tests
- API route tests
- schema tests
- AI service tests
- Azure assessment tests

Important:

- the Azure assessment test module requires `azure-cognitiveservices-speech`
- in a stripped local environment, that module may fail to collect until the package is installed

Detailed guide:

- [`document/Backend_Test_Suite_Documentation.md`](document/Backend_Test_Suite_Documentation.md)

## 9. API reference

See:

- [`document/API.md`](document/API.md)

The current backend exposes:

- `/health`
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/me`
- `/api/chat/respond`
- `/api/assess`
- `/api/conversations`
- `/api/conversations/{conversation_id}/messages`

## 10. Useful Docker commands

Start or rebuild:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f backend
docker compose logs -f postgres
```

Stop services:

```bash
docker compose down
```

Reset database volume and reseed:

PowerShell:

```powershell
docker compose down -v
docker compose up -d --build
Get-Content .\db_schema\seed.sql | docker exec -i voice_agent_postgres psql -U admin -d voice_agent
```

Git Bash:

```bash
docker compose down -v
docker compose up -d --build
docker exec -i voice_agent_postgres psql -U admin -d voice_agent < db_schema/seed.sql
```

## 11. Optional pgAdmin

- URL: `http://localhost:5050`
- Email: `admin@local.dev`
- Password: value from `PGADMIN_DEFAULT_PASSWORD`
- DB host inside Docker network: `postgres`

## 12. Optional MinIO console

- API endpoint: `http://localhost:9000`
- Console: `http://localhost:9001`
- Root user: value from `MINIO_ACCESS_KEY`
- Root password: value from `MINIO_SECRET_KEY`

Note:

- backend-generated presigned URLs may use Docker-internal hostnames depending on environment variables
- validate browser reachability in your deployment before treating MinIO URLs as a direct frontend playback source
