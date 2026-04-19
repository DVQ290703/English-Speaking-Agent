# A20-App-014

Latest setup and run instructions for team members.

## Prerequisites

- Python 3.10+
- uv
- Node.js 18+
- Docker Desktop
- Git

## 1. Clone and move into project

```bash
git clone <your-repo-url>
cd A20-App-014
```

## 2. Python environment (local tools/tests)

Create and activate a virtual environment:

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

Install Python dependencies:

```bash
uv pip install -r requirements.txt
```

## 3. Environment variables

Create .env from .env.example:

PowerShell:

```powershell
Copy-Item .env.example .env
```

Git Bash:

```bash
cp .env.example .env
```

Open .env and set required values:

- GROQ_API_KEY
- ELEVENLABS_API_KEY
- ELEVENLABS_VOICE_ID
- ELEVENLABS_MODEL_ID
- JWT_SECRET_KEY
- POSTGRES_DB
- POSTGRES_USER
- POSTGRES_PASSWORD

Notes:

- VITE_API_BASE_URL should stay http://localhost:8000 for local frontend.
- In Docker Compose, backend connects to database using service host postgres automatically.

## 4. Start backend stack (Docker Compose)

This starts backend API, PostgreSQL, and pgAdmin:

```bash
docker compose up -d --build
```

Check running containers:

```bash
docker compose ps
```

Expected services:

- voice_agent_backend
- voice_agent_postgres
- voice_agent_pgadmin

## 5. Seed PostgreSQL data

Run seed from file (safe method):

PowerShell (recommended):

```powershell
Get-Content .\db_schema\seed.sql | docker exec -i voice_agent_postgres psql -U voice_user -d voice_agent
```

Git Bash:

```bash
docker exec -i voice_agent_postgres psql -U voice_user -d voice_agent < db_schema/seed.sql
```

Important:

- Do not paste bcrypt hashes directly into shell SQL strings, because special characters like $ can be altered by shell expansion.
- Always seed from file as shown above.

## 6. Verify backend and database

Backend health check:

```bash
curl http://localhost:8000/health
```

Database quick check:

```bash
docker exec -it voice_agent_postgres psql -U voice_user -d voice_agent -c "SELECT email, length(password_hash) FROM users ORDER BY email;"
```

For seeded users, password hash length should be 60.

Default seeded login:

- alice@example.com / Password123!
- bob@example.com / Password123!
- charlie@example.com / Password123!

## 7. Run frontend locally

```bash
cd frontend
npm install
npm run dev
```

App URL:

- http://localhost:5173

Production build commands:

```bash
npm run build
npm run preview
```

## 8. Optional pgAdmin

- URL: http://localhost:5050
- Email: admin@local.dev
- Password: admin123
- DB host inside Docker network: postgres

## Useful Docker commands

Start or rebuild services:

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

```bash
docker compose down -v
docker compose up -d --build
Get-Content .\db_schema\seed.sql | docker exec -i voice_agent_postgres psql -U voice_user -d voice_agent
```