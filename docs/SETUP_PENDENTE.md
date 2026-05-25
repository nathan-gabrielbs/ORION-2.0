# Orion — Setup manual pendente

Checklist de tarefas **humanas** (não automatizadas pelo código/CI).  
Atualizado conforme as fases da migração avançam.

**Estratégia combinada:** implementar as fases em sequência (PRs separadas) e **testar tudo junto no checkpoint** — após Fase 4 (Docker), antes de modularizar o backend. Deploy Easypanel fica **só no final**.

Legenda: `[ ]` pendente · `[x]` feito · `[-]` não se aplica / adiado

---

## Checkpoint de teste (fazer após Fase 4 — Docker)

> Primeira vez que você precisa sentar e validar de ponta a ponta. Antes disso, só merge/review de PRs.

### Ambiente local (`pnpm dev`)

- [ ] `pnpm install`
- [ ] `cp .env.example .env` (na **raiz** do repo)
- [ ] Preencher no `.env`:
  - [ ] `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS`
  - [ ] `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD`
  - [ ] `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (login local)
  - [ ] (Opcional) `SIGHRA_WEBHOOK_TOKEN`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
- [ ] `pnpm dev` → `http://localhost:5173/`
- [ ] Confirmar `backend/data/bwt_fleet.db` (dados locais, não versionado)
- [ ] Validar: login, dashboard Kanban, mapa, Socket.IO em tempo real

### Ambiente Docker (após Fase 4)

- [ ] `docker compose up --build` (comando exato será documentado na PR da Fase 4)
- [ ] Montar/copiar `.env` para o container
- [ ] Validar mesma checklist acima via URL do container
- [ ] Confirmar persistência do SQLite após restart do container

---

## GitHub — já feito / pendente

### PRs mergeadas

- [x] [#1](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/1) — AI rules (Fase 0)
- [x] [#2](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/2) — Security (Fase 1)
- [x] [#3](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/3) — Monorepo pnpm (Fase 2)
- [x] [#4](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/4) — CI/CD (branch empilhada)
- [x] [#5](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/5) — Sync CI → `dev` (Fase 3)
- [x] [#6](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/6) — Docker (Fase 4)

### Pendente no GitHub (pode fazer a qualquer momento, não bloqueia fases)

- [ ] Rodar workflow manual **Setup Release Labels** (Actions → `Setup Release Labels` → Run)
  - Cria: `release:patch`, `release:minor`, `release:major`
- [ ] (Opcional) Deletar branches mergeadas no remote
- [x] `version-dev` já rodou automaticamente no merge da #5 (`0.1.0-dev.*`)

### Secrets — adiar até o deploy

- [ ] `EASYPANEL_DEPLOY_WEBHOOK_DEV` (GitHub secret — deploy auto em push para `dev`)
- [ ] (Futuro prod) secrets de produção no Easypanel / vault

### Infra CI

- [x] Runners `[self-hosted, linux, x64]` — CI passou na PR #5
- [ ] (Futuro) Atualizar g++ do runner para C++20 se quiser voltar `better-sqlite3@12`  
  (hoje pinado em v11 por compatibilidade com o compiler do runner)

---

## Deploy — fazer só quando todas as fases estiverem concluídas

> **Adiado por decisão sua.**

### Easypanel — DEV

- [ ] Criar app/serviço Orion no Easypanel (dev)
- [ ] Apontar build para `Dockerfile` na raiz do repo (context: `.`)
- [ ] Webhook → secret `EASYPANEL_DEPLOY_WEBHOOK_DEV` no GitHub
- [ ] Volume persistente: `/app/backend/data` (SQLite)
- [ ] Env vars no painel (ver `.env.example`):
  - [ ] SIGHRA + Raster
  - [ ] Auth (Microsoft OAuth, bootstrap admin)
  - [ ] `SIGHRA_WEBHOOK_TOKEN` (**obrigatório** em prod)
  - [ ] `ALLOWED_ORIGINS`, `PUBLIC_BASE_URL`, `NODE_ENV=production`
- [ ] Push em `dev` → CI verde → deploy automático
- [ ] Validar login, dashboard, Socket.IO, integrações

### Easypanel — PROD (depois de dev estável)

- [ ] PR `dev` → `main` com label `release:patch|minor|major`
- [ ] Confirmar workflow **Release** (tag, GH Release, sync `main → dev`)
- [ ] App prod no Easypanel + env vars
- [ ] HTTPS + cookies `Secure`
- [ ] Backup/recovery do SQLite

---

## Por fase — o que você precisará fazer

Atualizado conforme cada fase for mergeada.

| Fase | Status código | Sua ação |
| ---- | ------------- | -------- |
| 0 — AI rules | Concluída | Nada |
| 1 — Security | Concluída | Garantir `SIGHRA_WEBHOOK_TOKEN` em prod (no deploy) |
| 2 — Monorepo | Concluída | Usar `pnpm` em vez de `npm` |
| 3 — CI/CD | Concluída | Setup Release Labels (quando quiser) |
| 4 — Docker | Concluída | **Checkpoint de teste** — `docker compose up --build` |
| 5a — Shared foundation | Concluída | — |
| 5b — DB layer | Concluída | — |
| 5c — Auth module | Concluída | — |
| 5d — Vehicles module | Concluída | — |
| 5e — Integrações (foundation) | Concluída | Smoke test SIGHRA/Raster após merge |
| 5f — Polling/rotas integração | Concluída | Smoke test SIGHRA/Raster após merge |
| 5g — Rotas vehicles | Concluída | Smoke test após merge |
| 5h — Módulo admin | Em PR | Revisar PR |
| 5i+ — Auth routes, efficiency, bootstrap | Pendente | Revisar PRs |
| Deploy | Pendente | Seção Deploy acima |

### Fase 4 — Docker

- [ ] `cp .env.example .env` e preencher credenciais SIGHRA/Raster
- [ ] (Docker) Credenciais de bootstrap se volume SQLite for novo:
  - `BOOTSTRAP_ADMIN_EMAIL` (default compose: `admin@local.dev`)
  - `BOOTSTRAP_ADMIN_PASSWORD` — mín. 8 chars (default compose: `localdev1`)
  - Para usar seu banco local com usuários existentes: monte `./backend/data` no volume (avançado)
- [ ] `docker compose up --build`
- [ ] Acessar `http://localhost:3000/` (login + dashboard)
- [ ] Validar Socket.IO e integrações (SIGHRA/Raster)
- [ ] `docker compose down` → `docker compose up` — confirmar que dados SQLite persistem no volume
- [ ] (Opcional) `docker build -t orion:local .` — build manual da imagem

### Fase 5+ — modularização, migrations, testes (previsto)

- [ ] Backup de `backend/data/bwt_fleet.db` antes de aplicar migrations
- [ ] Revisar changelog da PR antes de mergear em `dev`
- [ ] Smoke test pós-merge (login + 1 veículo no mapa)

---

## Referência — variáveis obrigatórias

| Variável | Dev local | Prod |
| -------- | --------- | ---- |
| `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS` | Sim (boot) | Sim |
| `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD` | Sim (boot) | Sim |
| `SIGHRA_WEBHOOK_TOKEN` | Opcional | **Obrigatório** |
| `ALLOWED_ORIGINS` | Recomendado | **Obrigatório** |
| `BOOTSTRAP_ADMIN_*` | Se login local | Conforme política |
| `MICROSOFT_CLIENT_*` | Se SSO | Se SSO |
| `EASYPANEL_DEPLOY_WEBHOOK_DEV` | Só auto-deploy | N/A (secret GitHub) |

---

_Última atualização: Fase 5h — módulo admin (users, plates, operations) extraído do `server.ts`._
