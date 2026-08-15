#!/usr/bin/env bash
#
# Start/stop the local Postgres container.
#
# Prefers Docker Compose (docker-compose.yml is the source of truth, per
# Gambling_Docs/07-Local-Dev-Environment.md). If neither `docker compose` nor
# `docker-compose` is installed, falls back to a plain `docker run` that
# produces an identical container — same image, name, port, credentials and
# named volume — so the setup works either way and stays interchangeable.
#
#   ./scripts/db.sh up | down | reset | logs | psql | status
#
set -euo pipefail

CONTAINER=gamblinghub_postgres
VOLUME=gamblinghub_pgdata
IMAGE=postgres:16
HOST_PORT=5433
PG_USER=gamblinghub
PG_PASS=gamblinghub
PG_DB=gamblinghub

cd "$(dirname "$0")/.."

compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@"; return 0; fi
  if command -v docker-compose >/dev/null 2>&1; then docker-compose "$@"; return 0; fi
  return 1
}

port_in_use_by_other() {
  # True if something OTHER than our container is already on the host port.
  if ss -ltn 2>/dev/null | grep -q ":${HOST_PORT} "; then
    docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}' | grep -q "$CONTAINER" && return 1
    return 0
  fi
  return 1
}

wait_ready() {
  printf 'waiting for postgres'
  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
      echo " — ready on localhost:${HOST_PORT}"
      return 0
    fi
    printf '.'
    sleep 1
  done
  echo
  echo "postgres did not become ready in 60s; check: docker logs $CONTAINER" >&2
  return 1
}

up() {
  if port_in_use_by_other; then
    echo "ERROR: host port ${HOST_PORT} is already in use by something else." >&2
    echo "Change the port in docker-compose.yml and DATABASE_URL, then retry." >&2
    exit 1
  fi

  if compose up -d 2>/dev/null; then
    echo "started via docker compose"
  else
    echo "Docker Compose not installed — using plain docker run (identical container)."
    if [ -n "$(docker ps -aq -f "name=^${CONTAINER}$")" ]; then
      docker start "$CONTAINER" >/dev/null
    else
      docker volume create "$VOLUME" >/dev/null
      docker run -d \
        --name "$CONTAINER" \
        --restart unless-stopped \
        -e POSTGRES_USER="$PG_USER" \
        -e POSTGRES_PASSWORD="$PG_PASS" \
        -e POSTGRES_DB="$PG_DB" \
        -p "${HOST_PORT}:5432" \
        -v "${VOLUME}:/var/lib/postgresql/data" \
        "$IMAGE" >/dev/null
    fi
  fi
  wait_ready
}

down() {
  # Stops the container. The named volume is left alone, so data survives.
  compose down 2>/dev/null || docker stop "$CONTAINER" >/dev/null 2>&1 || true
  echo "stopped (data volume '${VOLUME}' kept)"
}

reset() {
  echo "This DELETES all local database data in volume '${VOLUME}'."
  printf 'Type "yes" to continue: '
  read -r reply
  [ "$reply" = "yes" ] || { echo "aborted"; exit 1; }
  compose down -v 2>/dev/null || {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  }
  echo "database wiped"
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  reset) reset ;;
  logs) docker logs -f "$CONTAINER" ;;
  psql) docker exec -it "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" ;;
  status)
    docker ps --filter "name=^${CONTAINER}$" \
      --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *) echo "usage: $0 {up|down|reset|logs|psql|status}" >&2; exit 1 ;;
esac
