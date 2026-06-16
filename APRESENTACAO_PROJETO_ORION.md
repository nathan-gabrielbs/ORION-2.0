# ORION — Apresentação Profissional do Projeto

## 1) Visão Geral

O **ORION** é uma plataforma de monitoramento e gestão operacional de frota, com foco em:

- Visão em tempo real do status operacional dos veículos.
- Acompanhamento de manutenção e histórico de eventos.
- Painéis visuais (Kanban + Mapa) para suporte à tomada de decisão.
- Integração com fontes externas de telemetria e dados logísticos.

A solução foi evoluída para um patamar corporativo com autenticação, sessão segura, controle de acesso por perfil e SSO corporativo via Orbital OIDC.

---

## 2) Objetivo do Produto

Concentrar em um único ambiente:

- Operação diária da frota.
- Rastreabilidade dos eventos de viagem e manutenção.
- Governança de acesso por usuário e perfil.
- Escalabilidade para evolução contínua (novos módulos e integrações).

---

## 3) Arquitetura da Solução

### Backend

- **Node.js + Express** para API HTTP.
- **Socket.IO** para atualização em tempo real de dados do dashboard.
- **SQLite (better-sqlite3)** como banco local transacional.
- Serviço único (`server.ts`) com camadas de:
  - persistência,
  - regras operacionais,
  - autenticação/autorização,
  - integração externa.

### Frontend

- **React + Vite + TypeScript**.
- Componentização do dashboard operacional.
- Tela de login dedicada (`login.html`) integrada ao backend.

### Dados em tempo real

- Sincronização periódica com fontes externas.
- Emissão de eventos de atualização para os clientes conectados.

---

## 4) Segurança e Governança

### Autenticação

- Login local via e-mail/senha.
- Login corporativo via Orbital OIDC (SSO; Microsoft/Entra fica atrás do Orbital).

### Sessão

- Cookie de sessão com `HttpOnly` e `SameSite`.
- Sessões persistidas em banco e validadas no backend.

### Controle de acesso

- Perfis:
  - **ADMIN**
  - **USER**
- Endpoints administrativos protegidos por autorização de perfil.
- Socket autenticado via sessão.

### Senhas

- Armazenamento com hash seguro (`scrypt`).
- Migração automática de senha legada em texto puro no primeiro login válido.

---

## 5) Módulos Funcionais

### 5.1 Dashboard Operacional

- Visualização em **Kanban** e **Mapa**.
- Indicadores operacionais e status de sincronização.
- Atualização em tempo real.

### 5.2 Gestão de Manutenção

- Registro e atualização de manutenção por veículo.
- Histórico de manutenção para auditoria operacional.

### 5.3 Gestão de Usuários (Admin)

- Listagem de usuários.
- Criação de novo usuário com formulário.
- Ativação/desativação de acesso.
- Redefinição de senha para usuários locais.

### 5.4 Autenticação e Sessão

- Login, logout, sessão persistente.
- Proteção de rotas e redirecionamento para login quando necessário.

---

## 6) Estrutura de Dados (resumo)

Principais entidades:

- `vehicles`
- `maintenance_history`
- `macros_history`
- `fleet_efficiency_history`
- `users`
- `user_sessions`

Essa base sustenta operação, histórico e governança de acesso.

---

## 7) Fluxo de Uso (alto nível)

1. Usuário acessa `/login`.
2. Realiza autenticação local ou SSO corporativo (Orbital OIDC).
3. Backend valida credenciais/claims e cria sessão (`orion_session`).
4. Dashboard carrega dados via API + Socket autenticado.
5. Ações administrativas (quando perfil ADMIN) ficam disponíveis no header.

---

## 8) Benefícios para o Negócio

- **Confiabilidade operacional:** visão centralizada e atualizada da frota.
- **Segurança:** controle de acesso e sessão no backend.
- **Produtividade:** gestão de usuários e operação no mesmo painel.
- **Escalabilidade:** base técnica pronta para novas integrações e módulos.

---

## 9) Roadmap sugerido

- Quebra de `server.ts` em módulos (auth, users, fleet, integrations).
- Auditoria detalhada de ações administrativas.
- Recuperação de senha/convite de usuário por e-mail corporativo.
- Testes automatizados (unitários + integração + e2e).
- Hardening para produção (rate limit, CSRF strategy, observabilidade).

---

## 10) Conclusão

O ORION já opera como uma plataforma sólida de gestão operacional de frota e agora possui fundações profissionais de autenticação, segurança e governança de usuários. Isso posiciona o projeto para adoção corporativa com evolução contínua.
