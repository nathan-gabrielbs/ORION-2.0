# Orion — Plano de continuidade (pós-Fase 5)

Documento de handoff para retomar o trabalho em **outro computador** ou por **outro dev/agente**.  
Branch base: **`dev`**. PRs sempre **`dev` ← feature branch**.

_Última atualização: pós-merge PR #20 (Fase 5 concluída + Node 20)._

---

## 1. Setup no novo computador

```bash
git clone git@github.com:Grupo-Potencial-IA-e-Inovacao/Orion.git
cd Orion
git checkout dev
git pull origin dev

nvm use          # lê .nvmrc → Node 20 (obrigatório para better-sqlite3)
pnpm install
cp .env.example .env   # preencher credenciais (ver SETUP_PENDENTE.md)
```

**Requisitos:** Node **20.x** (ver `.nvmrc` e `engines` no `package.json`), pnpm 9+.

**Banco local:** `backend/data/bwt_fleet.db` — gitignored. Copiar do computador anterior ou deixar o seed criar frota vazia.

**Comandos do dia a dia:**

```bash
pnpm dev          # backend :3000 + frontend :5173
pnpm validate     # typecheck + lint + format:check + test
pnpm build        # build real
pnpm test         # 51 testes backend (Vitest)
```

**Docker (produção-like):**

```bash
docker compose up --build   # app em http://localhost:3000
```

---

## 2. Onde estamos

### Métricas

| Item | Valor |
| ---- | ----- |
| `server.ts` original | ~3460 linhas |
| `server.ts` atual | **~124 linhas** (−96%) |
| Testes backend | **51** (Vitest, SQLite `:memory:`) |
| Checkpoint manual | **Concluído** (Docker + login local) |
| Deploy Easypanel | Pendente (após credenciais reais / SSO) |

### PRs mergeadas (Fase 0 → 5 + tooling)

| PR | Fase | Conteúdo |
| -- | ---- | -------- |
| #1 | 0 | AI rules |
| #2 | 1 | Security |
| #3 | 2 | Monorepo pnpm |
| #4–#5 | 3 | CI/CD |
| #6 | 4 | Docker |
| #7 | 5a | `shared/` |
| #8 | 5b | `db/` |
| #9 | 5c | `modules/auth/` (service, middleware, oauth) |
| #10 | 5d | `modules/vehicles/` (repository, seeds) |
| #11 | 5e | `integrations/` (clientes + utils) |
| #12 | 5f | Sync SIGHRA/Raster + webhook |
| #13 | 5g | Rotas vehicles + testes |
| #14 | 5h | Módulo admin + testes placas |
| #15 | docs | `PLANO_CONTINUIDADE.md` (handoff inicial) |
| #16 | 5i | Auth routes (`modules/auth/routes.ts`) |
| #17 | 5j | Módulo efficiency |
| #18 | 5k | Rotas integração SIGHRA/Raster |
| #19 | 5l | Bootstrap (socket, intervals, static SPA, middleware) |
| #20 | chore | `.nvmrc` Node 20, `engine-strict`, bootstrap em `.env.example` |

### Estrutura backend atual

```text
backend/src/
├── db/                         # client, schema, migrations legadas, triggers
├── shared/
│   ├── bootstrap/intervals.ts  # polling SIGHRA/Raster + snapshots
│   ├── http/server.ts          # createServer + Socket.IO
│   ├── middleware/             # helmet, cors, rate limit
│   ├── socket/handlers.ts
│   └── static/spa.ts
├── integrations/
│   ├── sighra/                 # client, sync, routes, webhook, macro-*
│   ├── raster/                 # client, sync, routes, trip-*
│   └── external/               # brasilapi, ibge
├── modules/
│   ├── auth/                   # service, routes, middleware, oauth, dto
│   ├── vehicles/               # repository, service, routes, startup-sanitize
│   ├── admin/                  # service, routes, dto
│   └── efficiency/             # service, routes
├── server.ts                   # wiring (~124 linhas)
└── index.ts
```

---

## 3. Fase 5 — concluída

Toda a modularização planejada foi mergeada. O `server.ts` só faz wiring: DB, auth, integrações, registro de rotas, socket e listen.

**Pendências funcionais (não são código da Fase 5):**

| Item | Status |
| ---- | ------ |
| Credenciais reais SIGHRA/Raster no `.env` | Pendente (hoje mocks em dev local) |
| Orbital SSO (OIDC) | Pendente (client no Orbital + `OIDC_*` no `.env`; ver `.env.example`) |
| Deploy Easypanel DEV | Pendente |

---

## 4. Próximas PRs / trabalho (ordem recomendada)

### 1. Integração real (manual + `.env`)

- Substituir mocks de SIGHRA/Raster por credenciais reais
- Validar polling e dados no Kanban/mapa

### 2. Orbital SSO (OIDC)

- Cadastrar client Orion no Orbital (redirect: `{PUBLIC_BASE_URL}/auth/callback`, post-logout: `{PUBLIC_BASE_URL}/logout/callback`)
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `SESSION_SECRET`
- Conceder permissão `login` no Orbital aos usuários autorizados

### 3. Deploy Easypanel DEV

Ver `docs/SETUP_PENDENTE.md` — webhook GitHub, volume SQLite, env vars de produção.

### 4. Fase 6 — Migrations versionadas

**Branch sugerida:** `feat/db-versioned-migrations`

- `backend/src/db/migrations/<timestamp>_<nome>.sql`
- Runner próprio (ordem, idempotência `IF NOT EXISTS`)
- Substituir loop legado `ALTER TABLE` com try/catch
- **Backup** de `bwt_fleet.db` antes de aplicar em ambiente com dados

### 5. Fase 7 — Observabilidade

- `requestId` por request
- Logs estruturados (JSON ou pino)

---

## 5. Testes — roadmap

| Prioridade | O quê | Status |
| ---------- | ----- | ------ |
| Alta | Admin users (`createUser`, `updateUser`, `resetPassword`) | Pendente |
| Alta | Auth sessão + login | **Feito** (`modules/auth/service.test.ts`) |
| Média | Efficiency calculation | **Feito** (`modules/efficiency/service.test.ts`) |
| Média | Supertest rotas Orbital SSO | **Feito** (`modules/auth/orbital-routes.test.ts`) |
| Baixa | Frontend (Kanban smoke) | Pendente |

**Hoje:** 51 testes backend. CI falha se backend não tiver testes.

---

## 6. Workflow Git (obrigatório)

1. `git checkout dev && git pull`
2. `nvm use && pnpm install`
3. `git checkout -b <tipo>/<nome>`
4. `pnpm validate` && `pnpm build`
5. `git add <arquivos específicos>` — **nunca** `git add -A` com `.env` ou `bwt_fleet.db`
6. Commit em inglês (conventional commits)
7. `gh pr create --base dev` — título/corpo **PT-BR**, sem rodapé de IA
8. Aguardar CI verde antes de merge

---

## 7. Checkpoint manual

**Status: concluído** (maio/2026 — Docker + login local `admin@local.dev`).

Checklist de referência (repetir após deploy ou mudanças grandes):

```bash
pnpm dev                    # http://localhost:5173
docker compose up --build   # http://localhost:3000
```

- [x] Login local
- [ ] Login SSO Orbital (pendente client OIDC + `OIDC_*` no ambiente)
- [x] Kanban + mapa + Socket.IO
- [x] Manutenção de veículo
- [x] Admin: usuários + placas
- [ ] Polling SIGHRA/Raster com credenciais reais
- [x] Restart Docker → SQLite persiste

Detalhes em `docs/SETUP_PENDENTE.md`.

---

## 8. Depois da Fase 5

| Fase | Conteúdo |
| ---- | -------- |
| 6 | Migrations versionadas (`backend/src/db/migrations/*.sql` + runner) |
| 7 | Observabilidade (requestId, logs estruturados) |
| Deploy | Easypanel — ver `SETUP_PENDENTE.md` |
| Futuro | Postgres (não agora — instância única + SQLite no Docker) |

---

## 9. Referências no repo

- Regras do projeto: `CLAUDE.md` / `AGENTS.md`
- Checklist manual: `docs/SETUP_PENDENTE.md`
- Variáveis: `.env.example`
- Node 20: `.nvmrc`
- Skills de entrega: `.claude/skills/ship/SKILL.md`

---

## 10. Prompt sugerido para retomar no Cursor

> Estou retomando o Orion na branch `dev`. Leia `docs/PLANO_CONTINUIDADE.md` e `docs/SETUP_PENDENTE.md`. A Fase 5 está concluída. Próximo passo: **[Fase 6 migrations / deploy Easypanel / credenciais reais]** — implementar conforme o plano, rodar `pnpm validate`, abrir PR para `dev`.
