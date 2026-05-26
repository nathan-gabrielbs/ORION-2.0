# Orion — Plano de continuidade (Fase 5+)

Documento de handoff para retomar o trabalho em **outro computador** ou por **outro dev/agente**.  
Branch base: **`dev`**. PRs sempre **`dev` ← feature branch**.

_Última atualização: pós-merge PR #14 (Fase 5h)._

---

## 1. Setup no novo computador

```bash
git clone git@github.com:Grupo-Potencial-IA-e-Inovacao/Orion.git
cd Orion
git checkout dev
git pull origin dev

pnpm install
cp .env.example .env   # preencher credenciais (ver SETUP_PENDENTE.md)
```

**Requisitos:** Node 20+, pnpm (ver `packageManager` na raiz).

**Banco local:** `backend/data/bwt_fleet.db` — gitignored. Copiar do computador anterior ou deixar o seed criar frota vazia.

**Comandos do dia a dia:**

```bash
pnpm dev          # backend :3000 + frontend :5173
pnpm validate     # typecheck + lint + format:check + test
pnpm build        # build real
pnpm test         # 25 testes backend (Vitest)
```

---

## 2. Onde estamos

### Métricas

| Item | Valor |
| ---- | ----- |
| `server.ts` original | ~3460 linhas |
| `server.ts` atual | ~694 linhas (−80%) |
| Testes backend | 25 (Vitest, SQLite `:memory:`) |
| Deploy Easypanel | Adiado (final da migração) |

### PRs mergeadas (Fase 0 → 5h)

| PR | Fase | Conteúdo |
| -- | ---- | -------- |
| #1 | 0 | AI rules |
| #2 | 1 | Security |
| #3 | 2 | Monorepo pnpm |
| #4–#5 | 3 | CI/CD |
| #6 | 4 | Docker |
| #7 | 5a | `shared/` |
| #8 | 5b | `db/` |
| #9 | 5c | `modules/auth/` (service, middleware — **rotas ainda no server**) |
| #10 | 5d | `modules/vehicles/` (repository, seeds) |
| #11 | 5e | `integrations/` (clientes + utils) |
| #12 | 5f | Sync SIGHRA/Raster + webhook |
| #13 | 5g | Rotas vehicles + 22 testes iniciais |
| #14 | 5h | Módulo admin + 3 testes placas |

### Estrutura backend atual

```text
backend/src/
├── db/                    # client, schema, migrations legadas, triggers
├── shared/                # env, paths, cors, app-config, utils
├── integrations/
│   ├── sighra/            # client, sync, webhook, macro-utils, macro-history
│   ├── raster/            # client, sync, trip-handler, trip-utils
│   └── external/          # brasilapi, ibge
├── modules/
│   ├── auth/              # service, middleware, oauth, dto (SEM routes.ts)
│   ├── vehicles/          # repository, service, routes, dto, seeds
│   └── admin/             # service, routes, dto
├── server.ts              # monolito restante (~694 linhas)
└── index.ts
```

---

## 3. O que ainda está no `server.ts`

| Bloco | Rotas / responsabilidade | PR alvo |
| ----- | ------------------------ | ------- |
| Auth | `/login`, `/api/auth/*`, OAuth Microsoft | **5i** |
| Efficiency | `/api/efficiency/*`, snapshot + interval | **5j** |
| Integrações (rotas finas) | sync/macros status, `macros/today`, raster-trip | **5k** |
| Bootstrap | sanitize drivers/locations, auth guard, socket.io, intervals, static SPA | **5l** |

### Detalhe — rotas ainda registradas no monolito

```
GET  /login
GET  /api/auth/me, /api/auth/microsoft/start, /api/auth/microsoft/callback
POST /api/auth/login, /api/auth/logout
GET  /api/vehicles/:plate/raster-trip
GET  /api/efficiency/current, /api/efficiency/start-of-day
GET  /api/sync/status, /api/macros/status, /api/macros/today
POST /api/sighra/webhook
GET  /, /* (SPA prod)
io.on("connection"), setInterval × 5
```

**Já extraído (via `register*Routes`):** vehicles, admin.

---

## 4. Próximas PRs (ordem recomendada)

### PR #15 — Fase 5i: Auth routes

**Branch sugerida:** `refactor/backend-auth-routes`

**Criar:**

- `modules/auth/routes.ts` → `registerAuthRoutes(app, deps)`
- Mover handlers de login, logout, me, OAuth Microsoft
- `server.ts` só chama `registerAuthRoutes(...)`

**Deps do factory:** `auth` module, `authLimiter`, cookies, `verifyPassword`, env Microsoft, `db` (callback OAuth insere/atualiza user).

**Testes a adicionar:**

- `modules/auth/service.test.ts` — sessão, normalizeEmail, sanitizeUser
- (Opcional) supertest login 401/200 com `:memory:`

**Checklist pre-PR:** `pnpm validate` + `pnpm build`

---

### PR #16 — Fase 5j: Fleet efficiency

**Branch:** `refactor/backend-efficiency-module`

**Criar:**

- `modules/efficiency/service.ts` — `calculateFleetEfficiency`, `saveSnapshot`, queries start-of-day
- `modules/efficiency/routes.ts` — `GET /api/efficiency/current`, `GET /api/efficiency/start-of-day`
- Mover `setInterval` de efficiency do `httpServer.listen` para o service ou manter no server chamando `efficiency.saveSnapshot()`

**Testes:** cálculo de % operacional com veículos mock.

---

### PR #17 — Fase 5k: Rotas SIGHRA finas + raster-trip

**Branch:** `refactor/backend-integration-routes`

**Mover:**

- `GET /api/sync/status`, `/api/macros/status` → `integrations/sighra/routes.ts` (usa `sighraSync.get*Status()`)
- `GET /api/macros/today` → `integrations/sighra/routes.ts` ou `macro-history.ts`
- `GET /api/vehicles/:plate/raster-trip` → `integrations/raster/routes.ts` (já existe `trip-handler.ts`)

---

### PR #18 — Fase 5l: Bootstrap / app shell

**Branch:** `refactor/backend-server-bootstrap`

**Extrair:**

- Sanitize drivers/locations no startup → `modules/vehicles/maintenance.ts` ou `shared/bootstrap/`
- `cleanupFinishedMaintenanceByForecast` + interval
- Socket.IO connection handler → `shared/socket/` ou por módulo
- Static SPA + redirect `/` → `shared/static/` ou `app.ts`
- **`server.ts` meta final:** ~150–200 linhas (só wiring)

---

## 5. Testes — roadmap

| Prioridade | O quê | Onde |
| ---------- | ----- | ---- |
| Alta | Admin users (`createUser`, `updateUser`, `resetPassword`) | `modules/admin/service.test.ts` |
| Alta | Auth sessão + login | `modules/auth/service.test.ts` |
| Média | Efficiency calculation | `modules/efficiency/service.test.ts` |
| Média | Supertest rotas (mock `requireAuth`) | `modules/*/routes.test.ts` |
| Baixa | Frontend (Kanban smoke) | `frontend/src/**/*.test.tsx` |

**Hoje:** 25 testes backend. CI falha se backend não tiver testes (`--passWithNoTests` removido no backend).

---

## 6. Workflow Git (obrigatório)

1. `git checkout dev && git pull`
2. `git checkout -b refactor/backend-<nome>`
3. Implementar **uma fase por PR**
4. `pnpm validate` && `pnpm build`
5. `git add <arquivos específicos>` — **nunca** `git add -A` com `.env` ou `bwt_fleet.db`
6. Commit em inglês (conventional commits)
7. `gh pr create --base dev` — título/corpo **PT-BR**, sem rodapé de IA
8. Aguardar CI verde antes de merge

---

## 7. Checkpoint manual (fazer quando 5l mergear ou antes do deploy)

```bash
# Local
pnpm dev

# Docker
docker compose up --build
```

Validar:

- [ ] Login local (+ SSO se configurado)
- [ ] Kanban + mapa + Socket.IO
- [ ] Manutenção de veículo (entrada/saída)
- [ ] Admin: usuários + placas
- [ ] Polling SIGHRA/Raster (logs no terminal)
- [ ] Restart Docker → SQLite persiste

Ver checklist completo em `docs/SETUP_PENDENTE.md`.

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
- Skills de entrega: `.claude/skills/ship/SKILL.md`

---

## 10. Prompt sugerido para retomar no Cursor

> Estou retomando o Orion na branch `dev`. Leia `docs/PLANO_CONTINUIDADE.md` e implemente a **Fase 5i** (auth routes): extrair rotas de `/login` e `/api/auth/*` para `modules/auth/routes.ts`, rodar `pnpm validate`, abrir PR para `dev`.
