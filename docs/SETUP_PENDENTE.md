# Orion — Setup manual pendente

Checklist de tarefas **humanas** (não automatizadas pelo código/CI).  
Atualizado conforme as fases da migração avançam. **Deploy e secrets de produção ficam para o final.**

Legenda: `[ ]` pendente · `[x]` feito · `[-]` não se aplica / adiado

---

## Quando quiser testar localmente (a qualquer momento)

- [ ] Instalar dependências: `pnpm install`
- [ ] Copiar env: `cp .env.example .env` (na **raiz** do repo)
- [ ] Preencher no `.env`:
  - [ ] `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS`
  - [ ] `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD`
  - [ ] `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (login local sem Microsoft)
  - [ ] (Opcional dev) `SIGHRA_WEBHOOK_TOKEN`
  - [ ] (Opcional dev) `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (SSO)
- [ ] Subir app: `pnpm dev` → `http://localhost:5173/`
- [ ] Confirmar que `backend/data/bwt_fleet.db` existe (não versionado; dados locais)

---

## Após merge das PRs de migração (#3 monorepo, #4 CI → `dev`)

### GitHub — repositório

- [x] Mergear PR [#3](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/3) (monorepo pnpm) em `dev`
- [x] Mergear PR [#4](https://github.com/Grupo-Potencial-IA-e-Inovacao/Orion/pull/4) (CI/CD — estava em branch empilhada)
- [ ] Mergear PR de sync CI → `dev` (levar workflows para a branch principal de dev)
- [ ] Confirmar que checks **Lint** e **Test** passam nesta PR
- [ ] Rodar workflow manual **Setup Release Labels** (Actions → `Setup Release Labels` → Run)
  - Cria: `release:patch`, `release:minor`, `release:major`
- [ ] (Opcional) Deletar branches mergeadas no remote

### GitHub — secrets (adiar deploy se preferir)

> Você pediu para configurar deploy **só no final**. Deixe estes itens para a seção "Deploy" abaixo.

- [ ] `EASYPANEL_DEPLOY_WEBHOOK_DEV` — webhook deploy automático em push para `dev`
- [ ] (Futuro prod) secrets de produção no Easypanel / vault

### Infra — runners CI

- [ ] Confirmar runners `[self-hosted, linux, x64]` disponíveis na org  
  (workflows reusáveis da org dependem disso)
- [ ] (Futuro) Atualizar g++ do runner para C++20 se quiser voltar `better-sqlite3@12`  
  (hoje pinado em v11 por compatibilidade com o compiler do runner)

---

## Deploy — fazer só quando todas as fases estiverem concluídas

> **Adiado por decisão sua.** Preencher quando for hora de subir dev/prod.

### Easypanel — ambiente DEV

- [ ] Criar app/serviço Orion no Easypanel (dev)
- [ ] Configurar webhook e colar URL em `EASYPANEL_DEPLOY_WEBHOOK_DEV` (GitHub secret)
- [ ] Montar volume persistente para SQLite: `backend/data/` (ou path via `DATABASE_FILE`)
- [ ] Variáveis de ambiente no painel (ver `.env.example`):
  - [ ] Integrações: SIGHRA, Raster
  - [ ] Auth: Microsoft OAuth, bootstrap admin
  - [ ] `SIGHRA_WEBHOOK_TOKEN` (**obrigatório** com `NODE_ENV=production`)
  - [ ] `ALLOWED_ORIGINS` com URL pública do ambiente
  - [ ] `PUBLIC_BASE_URL`, `NODE_ENV=production`
- [ ] Testar deploy: push em `dev` dispara pipeline + Easypanel
- [ ] Validar login, dashboard, Socket.IO e integrações em dev

### Easypanel — ambiente PROD (depois de dev estável)

- [ ] PR `dev` → `main` com label `release:patch|minor|major`
- [ ] Confirmar workflow **Release** (tag, GitHub Release, sync `main → dev`)
- [ ] App prod no Easypanel + env vars de produção
- [ ] HTTPS + cookies `Secure`
- [ ] Backup/recovery do SQLite (`backend/data/bwt_fleet.db`)

---

## Fases futuras — itens manuais previstos

Atualizar esta seção quando cada fase for implementada.

### Fase 4 — Docker / container (previsto)

- [ ] Validar build da imagem localmente
- [ ] Configurar app Docker no Easypanel (substituir ou complementar deploy atual)
- [ ] Volume para `backend/data/` no container

### Fase 5+ — modularização backend, testes, observabilidade (previsto)

- [ ] Revisar migrations/versionamento do SQLite quando runner existir
- [ ] Definir estratégia de backup antes de migrations em prod

---

## Referência rápida — variáveis obrigatórias

| Variável | Dev | Prod |
| -------- | --- | ---- |
| `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS` | Sim (boot) | Sim |
| `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD` | Sim (boot) | Sim |
| `SIGHRA_WEBHOOK_TOKEN` | Opcional | **Obrigatório** |
| `ALLOWED_ORIGINS` | Recomendado | **Obrigatório** |
| `BOOTSTRAP_ADMIN_*` | Se login local | Conforme política |
| `MICROSOFT_CLIENT_*` | Se SSO | Se SSO |
| `EASYPANEL_DEPLOY_WEBHOOK_DEV` | Só p/ auto-deploy | N/A (secret GitHub) |

---

_Última atualização: sync CI → `dev` (PR pendente)._
