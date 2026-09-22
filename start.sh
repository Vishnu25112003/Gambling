#!/usr/bin/env bash
#
# start.sh — bring up the full Infinit Respawn dev stack
#
#   1. Starts Postgres (Docker)
#   2. Runs Prisma migrations
#   3. Starts backend (tsx watch) and frontend (vite) concurrently
#
# Usage:
#   ./start.sh            — full start
#   ./start.sh --no-db    — skip DB/migration step (DB already running)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKIP_DB=false

for arg in "$@"; do
  case "$arg" in
    --no-db) SKIP_DB=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

cd "$ROOT_DIR"

# ── 1. Database ──────────────────────────────────────────────────────────────
if [ "$SKIP_DB" = false ]; then
  echo "▶  Starting Postgres..."
  ./scripts/db.sh up

  echo "▶  Running Prisma migrations..."
  npm run prisma:migrate --workspace backend
fi

# ── 2. Dev servers ───────────────────────────────────────────────────────────
echo "▶  Starting backend and frontend..."
echo "   Backend → http://localhost:4000"
echo "   Frontend → http://localhost:5173"
echo ""

# Run both concurrently; Ctrl-C kills both.
# Prefix each line so output is easy to tell apart.
trap 'echo ""; echo "Shutting down…"; kill 0' INT TERM

npm run dev --workspace backend 2>&1 | sed "s/^/[backend] /" &
BACKEND_PID=$!

npm run dev --workspace frontend 2>&1 | sed "s/^/[frontend] /" &
FRONTEND_PID=$!

wait $BACKEND_PID $FRONTEND_PID
