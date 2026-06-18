# Orion — Setup manual pendente

Checklist de tarefas **humanas** (não automatizadas pelo código/CI).  
Atualizado conforme as fases da migração avançam.

**Estratégia combinada:** Fase 5 (modularização backend) **concluída**. Checkpoint manual **concluído**. Deploy Easypanel e integrações reais ficam como próximos passos.

Legenda: `[ ]` pendente · `[x]` feito · `[-]` não se aplica / adiado

---

## Checkpoint de teste

> Concluído em maio/2026 (Docker `localhost:3000` + login local). Repetir após deploy ou mudanças grandes.

### Ambiente local (`pnpm dev`)

- [x] `pnpm install` (usar `nvm use` → Node 20 via `.nvmrc`)
- [x] `cp .env.example .env` (na **raiz** do repo)
- [x] Preencher no `.env` (mocks OK para smoke; reais para integração)
- [x] `pnpm dev` → `http://localhost:5173/`
- [x] Login local (`admin@local.dev` / `localdev1` no `.env.example`)
- [ ] Login SSO Orbital (pendente — client OIDC no Orbital + `OIDC_*` no ambiente)
- [x] Kanban, mapa, Socket.IO

### Ambiente Docker

- [x] `docker compose up --build`
- [x] `.env` na raiz (montado via `env_file` no compose)
- [x] `http://localhost:3000/` (login + dashboard)
- [x] Persistência SQLite após restart (`orion_sqlite_data` volume)

---

## GitHub — já feito / pendente

### PRs mergeadas

- [x] [#1](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/1) — AI rules (Fase 0)
- [x] [#2](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/2) — Security (Fase 1)
- [x] [#3](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/3) — Monorepo pnpm (Fase 2)
- [x] [#4–#5](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/5) — CI/CD (Fase 3)
- [x] [#6](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/6) — Docker (Fase 4)
- [x] [#7–#14](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/14) — Modularização Fase 5a–5h
- [x] [#16–#19](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/19) — Fase 5i–5l (auth routes, efficiency, integrações, bootstrap)
- [x] [#20](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/20) — Node 20 (`.nvmrc`, `engine-strict`)

### Pendente no GitHub (pode fazer a qualquer momento, não bloqueia fases)

- [ ] Rodar workflow manual **Setup Release Labels** (Actions → `Setup Release Labels` → Run)
- [ ] (Opcional) Deletar branches mergeadas no remote
- [x] `version-dev` automático em push para `dev`

### Secrets — adiar até o deploy

- [ ] `EASYPANEL_DEPLOY_WEBHOOK_DEV` (GitHub secret — deploy auto em push para `dev`)
- [ ] (Futuro prod) secrets de produção no Easypanel / vault

### Infra CI

- [x] Runners `[self-hosted, linux, x64]`
- [x] Postgres efêmero no job de test (`services.postgres` em `.github/workflows/test.yml`)
- [x] Docker no runner (pré-requisito para service containers)

---

## Deploy — próximo passo principal

> Fase 5 concluída. Deploy pode iniciar após credenciais reais no ambiente DEV.

### Easypanel — DEV

- [ ] Criar app/serviço Orion no Easypanel (dev)
- [ ] Build: `Dockerfile` na raiz (context: `.`)
- [ ] Webhook → secret `EASYPANEL_DEPLOY_WEBHOOK_DEV` no GitHub
- [ ] Volume persistente: `/app/backend/data` (SQLite)
- [ ] Env vars no painel (ver `.env.example`):
  - [ ] SIGHRA + Raster (credenciais reais)
  - [ ] Auth (Orbital OIDC `OIDC_*`, `SESSION_SECRET`, bootstrap admin)
  - [ ] `SIGHRA_WEBHOOK_TOKEN` (**obrigatório** em prod)
  - [ ] `ALLOWED_ORIGINS`, `PUBLIC_BASE_URL`, `NODE_ENV=production`
- [ ] Push em `dev` → CI verde → deploy automático
- [ ] Validar login, dashboard, Socket.IO, integrações

### Easypanel — PROD (depois de dev estável)

- [ ] PR `dev` → `main` com label `release:patch|minor|major`
- [ ] Workflow **Release** (tag, GH Release, sync `main → dev`)
- [ ] App prod + HTTPS + backup SQLite

---

## Por fase — status

| Fase | Status código | Sua ação |
| ---- | ------------- | -------- |
| 0–4 | Concluída | — |
| 5a–5l | **Concluída** | — |
| #20 Node 20 | **Concluída** | `nvm use` antes de `pnpm install` |
| Integrações reais | Pendente | Credenciais SIGHRA/Raster no `.env` |
| Orbital SSO | Pendente | Client OIDC no Orbital + `OIDC_*` no Easypanel |
| Deploy | Pendente | Seção acima |
| 6 — Migrations | Pendente | Ver `PLANO_CONTINUIDADE.md` |
| 7 — Observabilidade | Pendente | — |

---

## Próximas tarefas de código (Fase 6+)

- [ ] Backup de `backend/data/bwt_fleet.db` antes de migrations versionadas
- [ ] Migrations SQL em `backend/src/db/migrations/`
- [ ] Testes admin users + supertest rotas (opcional)

---

## Referência — variáveis obrigatórias

| Variável | Dev local | Prod |
| -------- | --------- | ---- |
| `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS` | Sim (boot) | Sim |
| `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD` | Sim (boot) | Sim |
| `SIGHRA_WEBHOOK_TOKEN` | Opcional | **Obrigatório** |
| `ALLOWED_ORIGINS` | Recomendado | **Obrigatório** |
| `BOOTSTRAP_ADMIN_*` | Fresh DB / Docker | Conforme política |
| `OIDC_*`, `SESSION_SECRET` | Se SSO | **Obrigatório** (SSO + sessão Orbital) |
| `EASYPANEL_DEPLOY_WEBHOOK_DEV` | Só auto-deploy | N/A (secret GitHub) |

**Login local padrão (`.env.example`):** `admin@local.dev` / `localdev1`

---

_Última atualização: Fase 5 concluída, checkpoint manual concluído, PR #20 mergeada._
