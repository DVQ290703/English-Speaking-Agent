# A20-App-014

Environment setup guide for team members.

## Prerequisites

- Python 3.10 or newer
- uv (package manager)
- Docker Desktop (running)
- Git

## 1. Initialize project and check Python version

Run inside the project root:

```bash
uv init
```

Then verify Python requirement in pyproject.toml and .python-version:

```toml
requires-python = ">=3.10"
```

```toml
3.10
```

## 2. Create and activate virtual environment

Create the environment:

```bash
uv venv
```

Activate it:

PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Git Bash:

```bash
source .venv/Scripts/activate
```

## 3. Install dependencies

```bash
uv pip install -r requirements.txt
```

## 4. Configure environment variables

Create .env from .env.example.

PowerShell:

```powershell
Copy-Item .env.example .env
```

Git Bash:

```bash
cp .env.example .env
```

Open .env and fill required secrets, especially:

- API_KEY_ASSEMBLYAI
- ELEVENLABS_API_KEY
- GROQ_API_KEY
- JWT_SECRET_KEY
- LANGSMITH_API_KEY (if tracing is enabled)

## 5. Start Docker services

Make sure Docker Desktop is running, then:

```bash
docker compose up -d
```

Check containers:

```bash
docker ps
```

Expected containers:

- voice_agent_postgres
- voice_agent_pgadmin

## 6. Seed PostgreSQL data

Use one of the following commands.

Git Bash (input redirection):

```bash
docker exec -i voice_agent_postgres psql -U voice_user -d voice_agent < db_schema/seed.sql
```

PowerShell (recommended):

```powershell
Get-Content .\db_schema\seed.sql | docker exec -i voice_agent_postgres psql -U voice_user -d voice_agent
```

## 7. Verify database connection

Run a simple query:

```bash
docker exec -it voice_agent_postgres psql -U voice_user -d voice_agent -c "SELECT NOW();"
```

Optional: pgAdmin is available at:

- http://localhost:5050

Default login (if unchanged):

- Email: admin@local.dev
- Password: admin123

## Useful Docker commands

Start services:

```bash
docker compose up -d
```

Stop services:

```bash
docker compose down
```

Rebuild database from scratch (removes data volume):

```bash
docker compose down -v
docker compose up -d
```

After rebuilding, run the seed command again.