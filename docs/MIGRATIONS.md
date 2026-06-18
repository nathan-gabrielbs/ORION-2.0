# PostgreSQL migrations (Orion)

Orion uses **versioned SQL migrations** applied at boot via `pg` + `DATABASE_URL` (padrão Synapse).

## Layout

```text
backend/src/db/
├── client.ts              # Pool singleton, query(), initDatabase()
├── migration-runner.ts    # Applies pending *.sql in transaction
└── migrations/
    ├── 0001_schema_migrations.sql
    └── 0002_initial_schema.sql
```

Migrations are copied to `backend/dist/db/migrations/` during `pnpm build`.

## Adding a migration

1. Create `backend/src/db/migrations/0003_description.sql` (next sequential prefix).
2. Write idempotent DDL when possible (`IF NOT EXISTS`).
3. Boot the app locally — the runner applies only unregistered files.
4. Verify with `pnpm --filter ./backend test` (includes migration smoke tests).

## Local development

```bash
docker compose up postgres -d
export DATABASE_URL=postgresql://orion:orion_dev@localhost:5433/orion
pnpm dev
```

Tests use database `orion_test` (auto-created by Vitest globalSetup).

## CI (GitHub Actions — self-hosted)

Backend tests are **integration tests** against real PostgreSQL. The Orion test workflow
(`.github/workflows/test.yml`) starts an ephemeral Postgres container on each run via
`docker run` (dynamic port on `127.0.0.1`) — no persistent database on the runner host.

Self-hosted runners cannot use job `container:` with `actions/checkout@v6` (Node runtime
mount issue), so Postgres is started in a step and `DATABASE_URL` is exported to `$GITHUB_ENV`.

The shared `workflows` repo is unchanged; lint still uses the reusable workflow.

**Requirements:** Docker installed on the self-hosted runner.

Vitest `globalSetup` creates `orion_test` if missing; tests truncate tables between cases.

## SQLite → Postgres cutover (QA)

1. Backup `backend/data/bwt_fleet.db` and run `pg_dump` on empty schema.
2. Deploy build with Postgres schema applied.
3. Run once:

```bash
SQLITE_FILE=backend/data/bwt_fleet.db DATABASE_URL=postgresql://... \
  pnpm --filter ./backend migrate:sqlite-to-postgres
```

4. Validate row counts and smoke-test Kanban/login.
5. Remove SQLite volume from Easypanel.

See [EASYPANEL_POSTGRES.md](./EASYPANEL_POSTGRES.md) for addon setup.
