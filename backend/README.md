# BugFixAI Backend — FastAPI Conversion

Converted from the original Node.js/Express + Prisma backend. See the
module-by-module mapping table below for exactly what maps to what.

## Status: Phases 1–2 of 5 complete (tested end-to-end)

**Done:**
- Full DB layer: all 22 SQLAlchemy models (async, Postgres) + Alembic migrations
- Security: bcrypt password hashing, JWT, AES-256-GCM secret encryption
- `auth` module: register / login / me
- `users` module: me
- `projects` module: list / create / get / delete
- `uploads` module: archive upload + validation + extraction helpers
- `workspace` module: file tree, read/write, search, git status/diff/commit
  (note: `/exec` returns HTTP 501 until the Docker sandbox lands in Phase 5)

**Not yet converted** (still TypeScript in the original project):
`analysis` (pipeline), `bugs`, `fixes`, `code-analysis`, `ai` (multi-provider
routing), `copilot`, `context-docs`, `sandbox` (Docker orchestration),
`integrations/github`, `analytics`, `logs`, `settings`, background workers,
websocket gateway.

## Running it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # fill in DATABASE_URL (Postgres), REDIS_URL, JWT_SECRET, ENCRYPTION_KEY

# Create the schema (once you have Postgres running):
alembic revision --autogenerate -m "init"
alembic upgrade head

uvicorn app.main:app --reload --port 4000
```

Interactive API docs: `http://localhost:4000/docs`

## Stack mapping

| Node.js piece            | FastAPI equivalent                     |
|---------------------------|-----------------------------------------|
| Prisma + PostgreSQL       | SQLAlchemy 2.0 async + asyncpg          |
| Prisma Migrate            | Alembic                                 |
| Zod                       | Pydantic v2                             |
| jsonwebtoken               | python-jose (PyJWT-style API)           |
| bcryptjs                  | passlib[bcrypt] (hash-compatible)       |
| BullMQ + ioredis           | arq (planned for Phase 5)               |
| ws                        | FastAPI's built-in WebSocket support (Phase 5) |
| multer                    | FastAPI's `UploadFile` (python-multipart) |
| pino                       | structlog (planned)                     |
| helmet / cors / express-rate-limit | starlette CORS middleware + slowapi |

## Notes for whoever picks this up

- `app/models/types.py` defines `PortableJSON` / `PortableStringArray` — these
  render as native `JSONB`/`ARRAY` on Postgres (matching the Prisma schema
  exactly) but fall back to plain JSON on SQLite, so the test suite doesn't
  need a real Postgres instance.
- Password hashes are bit-for-bit compatible with the existing `bcryptjs`
  hashes in your database — no user re-registration needed on cutover.
- `WEAK_PASSWORD`, `EMAIL_EXISTS`, `PROJECT_NOT_FOUND`, etc. — all the original
  custom error codes are preserved in the JSON error shape:
  `{"error": {"code": ..., "message": ..., "details": ...}, "requestId": ...}`.
