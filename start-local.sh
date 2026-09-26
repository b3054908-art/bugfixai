#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PID_FILE="$ROOT/.backend.pid"
FRONTEND_PID_FILE="$ROOT/.frontend.pid"
BACKEND_LOG_FILE="$ROOT/.backend.log"
FRONTEND_LOG_FILE="$ROOT/.frontend.log"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="${2:-120}"
  local elapsed=0

  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

stop_existing_process() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping existing process PID $pid from $pid_file"
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

require_cmd docker
require_cmd npm
require_cmd python3
require_cmd curl

echo "Clearing any conflicting local listeners on ports ${FRONTEND_PORT}, ${BACKEND_PORT}, 5432 and 6379..."
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${FRONTEND_PORT}/tcp" "${BACKEND_PORT}/tcp" 5432/tcp 6379/tcp 2>/dev/null || true
fi

start_backend() {
  echo "Starting infrastructure services in Docker..."
  cd "$BACKEND_DIR"
  docker compose up -d postgres redis

  echo "Starting backend directly on the host..."
  if [ ! -d .venv ]; then
    python3 -m venv .venv
  fi
  # shellcheck source=/dev/null
  source .venv/bin/activate

  if [ -f .env ]; then
    set -a
    . ./.env
    set +a
  fi

  python -m pip install --quiet -r requirements.txt
  echo "Applying database migrations..."
  alembic upgrade head

  stop_existing_process "$BACKEND_PID_FILE"
  nohup uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT}" >"$BACKEND_LOG_FILE" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"

  echo "Waiting for backend health on http://localhost:${BACKEND_PORT}/api/v1/health..."
  if ! wait_for_http "http://localhost:${BACKEND_PORT}/api/v1/health" 120; then
    echo "Backend failed to start on http://localhost:${BACKEND_PORT}/api/v1/health" >&2
    echo "--- backend log ---" >&2
    cat "$BACKEND_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "Backend health:"
  curl -fsS "http://localhost:${BACKEND_PORT}/api/v1/health"
}

start_frontend() {
  echo "Starting frontend on http://localhost:${FRONTEND_PORT}..."
  cd "$FRONTEND_DIR"
  npm install

  stop_existing_process "$FRONTEND_PID_FILE"
  nohup npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" --strictPort >"$FRONTEND_LOG_FILE" 2>&1 &
  echo $! > "$FRONTEND_PID_FILE"

  if ! wait_for_http "http://localhost:${FRONTEND_PORT}" 120; then
    echo "Frontend failed to start on http://localhost:${FRONTEND_PORT}" >&2
    echo "--- frontend log ---" >&2
    cat "$FRONTEND_LOG_FILE" >&2 || true
    exit 1
  fi

  echo "Frontend ready at http://localhost:${FRONTEND_PORT}"
}

start_backend
start_frontend

echo "\nLocal app is running."
echo "Backend: http://localhost:${BACKEND_PORT}"
echo "Frontend: http://localhost:${FRONTEND_PORT}"
