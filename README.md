<div align="center"> 
  <img width="1200" height="475" alt="GHBanner" src="https://i.imgur.com/11jux1K.png" />
</div>

# ORION — Dashboard Operacional de Frota

Plataforma web para monitoramento e gestão operacional de frota, com atualização em tempo real, visão Kanban/Mapa, controle de manutenção e autenticação corporativa.

## ✨ Principais funcionalidades

- Dashboard operacional com visão **Kanban** e **Mapa**.
- Atualização em tempo real via **Socket.IO**.
- Gestão de manutenção e histórico operacional.
- Autenticação com:
  - login local (email/senha)
  - SSO Microsoft (OAuth)
- Controle de acesso por perfil (**ADMIN** e **USER**).
- Gestão de usuários para administradores:
  - criar usuário
  - ativar/desativar
  - redefinir senha local

---

## 🧱 Stack técnica

### Frontend

- React
- TypeScript
- Vite
- Tailwind/CSS utilitário

### Backend

- Node.js
- Express
- Socket.IO
- better-sqlite3 (SQLite)

### Integrações

- APIs externas para dados de operação e rastreio (conforme configuração de ambiente).

---

## 📁 Estrutura do projeto (resumo)

Monorepo `pnpm` com dois pacotes:

```bash
.
├── package.json                    # Workspace root + scripts orquestradores
├── pnpm-workspace.yaml
├── tsconfig.base.json              # Config TS compartilhada (strict)
├── backend/
│   ├── package.json                # @orion/backend
│   ├── data/                       # SQLite live DB (gitignored)
│   └── src/
│       ├── index.ts                # Entry: chama startServer()
│       ├── server.ts               # API + sockets + regras de negócio
│       └── test/
├── frontend/
│   ├── package.json                # @orion/frontend
│   ├── index.html                  # Shell SPA (Vite)
│   ├── login.html                  # Tela de login (servida pelo backend em /login)
│   ├── public/images/              # logo.png, logobwt.png, truck.jpg
│   └── src/
│       ├── App.tsx                 # Shell principal do dashboard
│       ├── authTypes.ts            # Tipos de autenticação/usuário
│       └── components/
│           ├── DashboardHeader.tsx
│           ├── KanbanView.tsx
│           ├── MapView.tsx
│           └── KPISection.tsx
├── APRESENTACAO_PROJETO_ORION.md   # Documento executivo do projeto
└── .env.example                    # Variáveis de ambiente de exemplo
```

---

## 🔐 Autenticação e autorização

O ORION valida autenticação e autorização no backend.

- Sessão persistida em banco (`user_sessions`).
- Cookie de sessão `HttpOnly`.
- Perfis de acesso:
  - `ADMIN`: gestão de usuários e ações administrativas.
  - `USER`: acesso operacional sem administração de usuários.

> O administrador principal corporativo é mantido no sistema conforme regra definida em backend.

---

## ⚙️ Configuração de ambiente

Use o arquivo `.env.example` como base.

Variáveis relevantes:

```env
# ORION Authentication
PUBLIC_BASE_URL=http://localhost:3000
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
MICROSOFT_ALLOWED_DOMAIN=grpotencial.com.br
```

E também as variáveis de integração operacional já existentes (SIGHRA/RASTER).

---

## 🚀 Como rodar localmente

### Pré-requisitos

- Node.js 20+
- pnpm 9+ (recomendado via `corepack enable && corepack prepare pnpm@10 --activate`)

### Passos

1. Instalar dependências:

   ```bash
   pnpm install
   ```

2. Configurar ambiente:
   - copie `.env.example` para `.env` (ou use sua estratégia padrão)
   - preencha credenciais e parâmetros necessários

3. Executar em desenvolvimento (sobe backend e frontend em paralelo):

   ```bash
   pnpm dev
   ```

4. Acessar:
   - App (Vite, com proxy): `http://localhost:5173/`
   - Login: `http://localhost:5173/login`
   - API direto: `http://localhost:3000/api/...` (em geral não precisa)

> Em produção, o backend serve `frontend/dist` na mesma porta 3000 — o Vite só existe em dev.

---

## 🧪 Scripts úteis

```bash
pnpm dev          # backend (3000) + frontend (5173) em paralelo
pnpm build        # build do backend (tsc) + frontend (vite)
pnpm preview      # preview do build do frontend
pnpm lint         # ESLint em ambos os pacotes
pnpm format       # Prettier --write
pnpm format:check # Prettier --check (CI)
pnpm typecheck    # tsc --noEmit em ambos
pnpm test         # Vitest em ambos
pnpm validate     # typecheck + lint + format:check + test
pnpm clean        # rm -rf backend/dist frontend/dist
```

---

## 🐳 Docker (produção local)

Simula produção: um container Node na porta **3000** (Express serve API + `frontend/dist`).

```bash
cp .env.example .env          # preencher credenciais
docker compose up --build     # http://localhost:3000/
```

- SQLite persistente no volume `orion_sqlite_data` (`/app/backend/data` no container)
- Imagem: `Dockerfile` multi-stage (Node 20 + pnpm 9, alinhado ao CI)
- Easypanel: usar o mesmo `Dockerfile` no deploy (configurar volume + env no painel — ver `docs/SETUP_PENDENTE.md`)

---

## 🔄 CI/CD

GitHub Actions em `.github/workflows/` usa workflows reutilizáveis da org (`Grupo-Potencial-IA-e-Inovacao/workflows`):

- **PR/push em `dev` ou `main`:** lint + test
- **Push em `dev`:** versionamento automático + deploy Easypanel (requer secret `EASYPANEL_DEPLOY_WEBHOOK_DEV`)
- **PR para `main`:** lembrete de label `release:patch|minor|major`
- **Push em `main`:** release semver + sync `main → dev`

Setup único: rodar manualmente o workflow **Setup Release Labels** no GitHub Actions.

Checklist completo de tarefas manuais (deploy, secrets, env local): [`docs/SETUP_PENDENTE.md`](./docs/SETUP_PENDENTE.md).

---

## 📘 Documentação adicional

- Apresentação executiva/técnica do projeto:
  - [`APRESENTACAO_PROJETO_ORION.md`](./APRESENTACAO_PROJETO_ORION.md)

---

## 🛡️ Boas práticas recomendadas para produção

- Configurar segredo/ambiente com segurança (vault/secret manager).
- Usar HTTPS e `Secure` cookies em produção.
- Implementar rate limit e estratégia CSRF adequada ao fluxo final.
- Adicionar observabilidade (logs estruturados, métricas, tracing).
- Evoluir testes automatizados de integração e e2e.

---

## 📄 Licença

Definir conforme política interna da organização.
