# AI Speaking Coach API

FastAPI backend for the IELTS speaking coach MVP.

Run with:

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload
```

Demo users:

- `demo_student` / `Demo@1234`
- `minh_nguyen` / `Demo@1234`

## Structure

```
├── src/
│   ├── agent.py        # Main agent loop
│   ├── tools.py        # Tool definitions
│   └── config.py       # Configuration
├── scripts/
│   └── (utility scripts)
├── requirements.txt
├── .env.example
├── AGENTS.md           # Rules for using AI coding agents
├── JOURNAL.md          # Weekly journal — product journey & learnings
└── WORKLOG.md          # Technical decisions, task assignments, brainstorming
```

## Getting Started

### 1. Clone and setup

```bash
git clone <repo-url>
cd <repo>
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your provider API key and any database settings you need.

### 3. Run

```bash
python -m venv venv
source venv/bin/activate       # Linux/Mac
# or: venv\Scripts\activate    # Windows

pip install -r requirements.txt
python -m src.agent
```

## Weekly Journal

Update **[JOURNAL.md](./JOURNAL.md)** at the end of every week to document your product-building journey:

- Features shipped
- AI tools used and how they helped
- Hardest problem of the week and how you solved it
- What you'd do differently
- Plan for next week

> JOURNAL.md **must be updated** before each PR. It is your learning record for the course.

## Worklog

Update **[WORKLOG.md](./WORKLOG.md)** whenever your team makes a technical decision or changes direction:

- **Technical decisions** — why did you choose this approach over alternatives?
- **Task assignments** — who does what, by when
- **Brainstorming** — options considered, pros/cons, conclusion
- **Important bugs** — root cause and fix

See each file for the format and examples.

Default SQLite file: `data/speaking_coach_bootstrap.sqlite3`

See [AGENTS.md](./AGENTS.md) for details.
