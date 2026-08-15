# Local Dev Environment

## One-Line Summary
How to run the PostgreSQL database for this project locally in Docker, without conflicting with any other containers already running on your machine.

## Overview
This project's database runs in its own Docker container, defined by a `docker-compose.yml` at the project root. It uses port **5433** on your machine (not Postgres's usual default, 5432) specifically to avoid clashing with any other Postgres containers you may already have running locally.

**Important:** I can't see your local machine's Docker setup from here — this port was chosen because 5432 is the one most commonly already taken. Before running this for the first time, check it's actually free on your end.

## Status
- **Phase:** Built and running on Dev4's machine (2026-08-15)
- **Depends on:** Docker. Docker Compose is optional — see the note below.

**Verified on this machine (2026-08-15):**
- Port **5433 is free**; port **5432 is genuinely occupied**, so the choice of
  5433 was correct. The open question below is now closed.
- **Docker Compose is NOT installed** — neither `docker compose` (plugin) nor
  `docker-compose` (standalone). `docker-compose.yml` exists as specified, and
  `npm run db:up` (`scripts/db.sh`) falls back to a plain `docker run` that
  produces an identical container: same image, name, port, credentials and named
  volume. Install Compose with `sudo pacman -S docker-compose` to use it
  directly; either path works and they are interchangeable.
- Postgres 16 container `gamblinghub_postgres` is running, migrations applied,
  44 tests passing against it.

## How It Works (Flow)
1. `docker-compose.yml` defines one service: `postgres`, using the official `postgres` image
2. Container's internal port (5432, standard) is mapped to **host port 5433** — so from your machine, you connect on 5433; inside the container, Postgres still runs normally on its default
3. A named Docker volume persists the database data across container restarts (so `docker-compose down` doesn't wipe your data — only `docker-compose down -v` would)
4. Your backend's `.env` file points Prisma at `localhost:5433` for local development

## Where This Lives
```
/ (project root)
  ├── docker-compose.yml     → defines the postgres service
  └── backend/
      └── .env               → DATABASE_URL points here to localhost:5433
```

## Implementation Plan (TODO)

```
[x] Verify port 5433 is actually free on your machine
    - Confirmed 2026-08-15: 5433 free, 5432 occupied. No change needed.
    - scripts/db.sh also refuses to start if 5433 is taken by anything else.

[x] Start the container
    - npm run db:up   (docker compose if installed, plain docker otherwise)
    - Confirmed: gamblinghub_postgres on 0.0.0.0:5433->5432/tcp

[x] Set DATABASE_URL in backend/.env
    - postgresql://gamblinghub:gamblinghub@localhost:5433/gamblinghub

[x] Run Prisma migration
    - Applied as 20260815072115_init
    - NOTE: Prisma 7 no longer accepts `url` inside schema.prisma. The
      datasource URL now lives in backend/prisma.config.ts, and the runtime
      client connects through the @prisma/adapter-pg driver adapter.

[x] Confirm connection
    - npm run prisma:studio  (GUI), or npm run db:psql (shell)
```

## Reference

**docker-compose.yml** (also saved as its own file — see below)
```yaml
services:
  postgres:
    image: postgres:16
    container_name: gamblinghub_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: gamblinghub
      POSTGRES_PASSWORD: gamblinghub
      POSTGRES_DB: gamblinghub
    ports:
      - "5433:5432"
    volumes:
      - gamblinghub_pgdata:/var/lib/postgresql/data

volumes:
  gamblinghub_pgdata:
```

**Connection string for Prisma / backend `.env`:**
```
DATABASE_URL="postgresql://gamblinghub:gamblinghub@localhost:5433/gamblinghub"
```

## Open Questions
- None. Port 5433 confirmed free on Dev4's machine 2026-08-15; 5432 was indeed
  already taken, so the original choice was right.

## Last Updated
2026-08-15 — Setup built and verified. Port confirmed, container running,
migrations applied. Noted the missing Docker Compose binary and the identical
plain-`docker` fallback, plus Prisma 7's move of the datasource URL into
`prisma.config.ts`.
