# PostgreSQL no Easypanel (Orion QA/DEV)

Checklist operacional para substituir SQLite por Postgres addon no Easypanel.

## 1. Criar addon PostgreSQL

1. No projeto Easypanel, adicionar serviço **PostgreSQL** (16+).
2. Criar database e user `orion` com senha forte.
3. Anotar o **hostname interno** do serviço (ex.: `orion-postgres` ou nome gerado pelo painel).

## 2. Configurar app Orion

No serviço Orion, definir:

```env
DATABASE_URL=postgresql://orion:SENHA@<hostname-interno-postgres>:5432/orion
```

Remover:

- Volume persistente `/app/backend/data` (SQLite legado)
- Variável `DATABASE_FILE` (se existir)

Manter demais envs (`SIGHRA_*`, `RASTER_*`, `OIDC_*`, `SESSION_SECRET`, etc.).

## 3. Primeiro deploy com Postgres vazio

1. Fazer deploy da versão com `pg` — migrations `0001`/`0002` rodam no boot.
2. Confirmar logs sem erro de conexão.
3. Login local bootstrap (`BOOTSTRAP_ADMIN_*`) deve criar admin na primeira subida.

## 4. Migrar dados do SQLite QA (se houver)

Antes do cutover:

```bash
# Backup
cp backend/data/bwt_fleet.db backend/data/bwt_fleet.db.bak.$(date +%F)
pg_dump "$DATABASE_URL" > orion-pre-migration.sql
```

Rodar script (em ambiente com acesso ao `.db` e ao Postgres):

```bash
SQLITE_FILE=backend/data/bwt_fleet.db \
DATABASE_URL=postgresql://orion:SENHA@host:5432/orion \
pnpm --filter ./backend migrate:sqlite-to-postgres
```

Validar contagens por tabela e fluxos críticos (login, Kanban, macros).

## 5. Backup operacional pós-cutover

- Usar `pg_dump` periódico (não mais cópia de `.db`).
- Rotacionar backups conforme política BWT/Potencial.

## 6. Rollback (emergência)

1. Restaurar imagem/deploy anterior (SQLite) **somente** se volume `.db` foi preservado.
2. Em produção real, preferir restore de `pg_dump` em vez de reverter para SQLite.
