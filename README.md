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

```bash
.
├── login.html                      # Tela de login
├── server.ts                       # API + sockets + regras de negócio
├── bwt_fleet.db                    # Banco SQLite
├── src/
│   ├── App.tsx                     # Shell principal do dashboard
│   ├── authTypes.ts                # Tipos de autenticação/usuário
│   └── components/
│       ├── DashboardHeader.tsx     # Header + gestão de usuários/admin
│       ├── KanbanView.tsx
│       ├── MapView.tsx
│       └── ...
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
- Node.js 18+
- npm

### Passos

1. Instalar dependências:
   ```bash
   npm install
   ```

2. Configurar ambiente:
   - copie `.env.example` para `.env` (ou use sua estratégia padrão)
   - preencha credenciais e parâmetros necessários

3. Executar em desenvolvimento:
   ```bash
   npm run dev
   ```

4. Acessar:
   - Login: `http://localhost:3000/login`
   - App: `http://localhost:3000/`

---

## 🧪 Scripts úteis

```bash
npm run dev      # sobe backend + app em modo dev
npm run build    # build frontend
npm run preview  # preview do build
npm run lint     # type-check (tsc --noEmit)
```

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

