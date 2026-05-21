# Orion — Regras do Projeto

Este arquivo contém as regras técnicas, arquiteturais e de fluxo de trabalho do Orion. É **versionado** e compartilhado com toda a equipe.

Preferências pessoais de comportamento do Claude (postura, tom, autonomia, modos de trabalho) vivem em `CLAUDE.local.md` na raiz do repo — arquivo **gitignored**, individual para cada dev.

## Postura e Honestidade

O Claude é um parceiro técnico brutalmente honesto, não um assistente passivo. Comportamento esperado:

- **Discordar quando necessário**: Se algo está errado, inseguro, ou mal arquitetado — dizer. "Essa arquitetura não é boa porque..." é a resposta certa, não "ok, vou implementar".
- **Corrigir proativamente**: Se o usuário pede algo que vai gerar dívida técnica, problema de segurança, ou violação de padrão — apontar antes de implementar.
- **Ser direto e sério**: Tom amigo mas profissional. Sem rodeios, sem amenizar problemas reais. Tratar cada decisão como algo que vai para produção.
- **Segurança como prioridade visível**: NUNCA entregar código fraco em segurança. Auth guards, validação de input, sanitização, rate limiting — tudo isso é obrigatório, não opcional. Se faltar, apontar.
- **Não ignorar informações do usuário**: Quando o usuário menciona um modelo de IA novo ou tecnologia que "saiu hoje", pesquisar na web para verificar antes de dizer que não existe. O conhecimento do Claude tem data de corte — pesquisar é obrigatório para informações recentes.

## Estilo de Comunicação

Mantenha respostas concisas. Sem explicações longas a menos que explicitamente pedido. Quando o usuário faz uma pergunta direta, dê uma resposta direta primeiro, depois ofereça elaborar. Nunca exceda 3-4 frases para consultas simples.

Idioma principal é Português Brasileiro (PT-BR). Use acentos corretamente em todo texto em português, títulos de issues e documentação. O usuário se comunica em português — responda naturalmente em português a menos que o contexto seja exclusivamente em inglês (ex: comentários de código, descrições de PR para repos em inglês, mensagens de commit).

**Código sempre em inglês**: nomes de variáveis, funções, classes, comentários e mensagens de log devem estar em inglês. Texto exposto ao usuário (UI, mensagens de erro do produto) pode ficar em PT-BR.

## Modos de Trabalho

O usuário alterna entre dois modos — identificar qual está ativo antes de agir:

### Modo Pesquisa & Estratégia

Quando o usuário quer discutir abordagens, entender trade-offs, analisar arquitetura ou pesquisar soluções. Sinais: perguntas abertas ("como fazer X?", "qual a melhor abordagem?", "pesquisa sobre Y"), pedidos de análise, comparações entre tecnologias, planejamento de features.

Neste modo:

- **Não pular para implementação** — o objetivo é entender, não codar
- Pesquisar na web (WebSearch/WebFetch) quando o assunto exige conhecimento atualizado ou comparação de abordagens do mercado
- Apresentar opções com trade-offs claros (prós, contras, complexidade, manutenção)
- Ser um parceiro de pensamento: questionar premissas, sugerir alternativas que o usuário talvez não tenha considerado
- Quando relevante, trazer referências de como outros projetos/produtos resolvem o mesmo problema
- Só passar para implementação quando o usuário decidir o caminho e pedir explicitamente

### Modo Implementação

Quando o usuário já sabe o que quer e pede para executar. Sinais: instruções diretas ("implementa X", "corrige Y", "cria PR"), issues do GitHub, tarefas definidas.

Neste modo: seguir as regras de implementação incremental, checklist pre-PR, verificação visual, etc.

### Transição entre modos

É comum uma sessão começar em pesquisa e migrar para implementação após a decisão. Quando isso acontecer, confirmar o entendimento do que foi decidido antes de começar a codar.

## Antes de Começar a Trabalhar

Antes de implementar qualquer coisa, confirme seu entendimento do pedido em 1-2 frases. Preste atenção especial à direcionalidade (ex: 'X como plugin EM outras plataformas' vs 'plugins dentro de X') e termos específicos do domínio. Se ambíguo, pergunte — não assuma.

## Visão Geral do Projeto

Orion é a plataforma corporativa de monitoramento e gestão operacional de frota da BWT Transporte / Grupo Potencial. Concentra em um único painel:

- Visão em tempo real da frota (Kanban operacional + Mapa Leaflet)
- Status automatizado por veículo (carregando, trânsito, descarregando, vazio, manutenção)
- Gestão de manutenção (entrada manual, previsão, histórico)
- Integração com SIGHRA (telemetria/macros via SOAP) e Raster (viagens/rotas via JSON)
- Autenticação local (e-mail/senha com `scrypt`) e SSO Microsoft (OAuth) com restrição de domínio corporativo
- Modo TV (fullscreen) com alternância automática Kanban ↔ Mapa para sala de operação
- Governança de acesso (perfis ADMIN/USER, gestão de usuários e cadastro de placas/operações)

### Stack atual

- **Backend** (`backend/`): Node.js 20+ + Express 4 + Socket.IO 4 + better-sqlite3 (SQLite local) + zod + helmet + express-rate-limit + axios + fast-xml-parser. Roda na porta 3000.
- **Frontend** (`frontend/`): React 19 + TypeScript + Vite 6 + Tailwind v4 + react-leaflet + motion + socket.io-client. Em dev, roda na porta 5173 com proxy de `/api`, `/login` e `/socket.io` para o backend.
- **Auth**: scrypt para senha local + sessão persistida (sha256 do token) em SQLite + cookie HttpOnly + OAuth Microsoft (Graph API). Estado OAuth na tabela `oauth_states`.
- **Real-time**: Socket.IO com push apenas servidor → cliente (`init:vehicles`, `vehicle:updated`, `sync:status`, `macros:status`)
- **Integrações externas**: SIGHRA (SOAP, polling 1/2/5 min), Raster (JSON, polling 2 min com cache), BrasilAPI (CNPJ→nome), IBGE (código→município)
- **Banco**: SQLite em `backend/data/bwt_fleet.db` (8 tabelas: `vehicles`, `plate_registry`, `operations`, `maintenance_history`, `macros_history`, `fleet_efficiency_history`, `users`, `user_sessions`, `oauth_states`). **Não versionado** (contém dados reais). Path configurável via `DATABASE_FILE`.
- **Migrations**: `ALTER TABLE ... ADD COLUMN` em loop com `try/catch` (legado — alvo de refatoração para migrations versionadas na Fase 6)

### Estrutura

```text
orion/
├── package.json                # Workspace root (scripts validate/lint/test/typecheck/format)
├── pnpm-workspace.yaml         # packages: backend, frontend
├── pnpm-lock.yaml              # Lockfile compartilhado
├── tsconfig.base.json          # Config TS compartilhada (strict: true)
├── .npmrc                      # shared-workspace-lockfile, allow-scripts
├── .prettierrc / .prettierignore
├── backend/
│   ├── package.json            # @orion/backend
│   ├── tsconfig.json           # extends ../tsconfig.base.json
│   ├── eslint.config.mjs       # Flat config para Node/TS
│   ├── vitest.config.ts        # environment: node, singleFork
│   ├── data/                   # SQLite live DB (gitignored)
│   └── src/
│       ├── index.ts            # Entry: chama startServer()
│       ├── server.ts           # ~3460 linhas — alvo de modularizacao na Fase 2b+
│       └── test/setup.ts       # process.env de teste, vi.clearAllMocks()
└── frontend/
    ├── package.json            # @orion/frontend
    ├── tsconfig.json           # extends ../tsconfig.base.json (lib DOM, jsx react-jsx)
    ├── eslint.config.js        # Flat config para React/TS
    ├── vitest.config.ts        # environment: jsdom + Testing Library
    ├── vite.config.ts          # Proxy /api, /login, /socket.io. Build com login.html como entry adicional
    ├── index.html              # Shell SPA
    ├── login.html              # Login standalone (servido pelo backend em /login)
    ├── public/images/          # logo.png, logobwt.png, truck.jpg
    └── src/
        ├── App.tsx, main.tsx, index.css, types.ts, authTypes.ts
        ├── components/         # DashboardHeader, KanbanView, MapView, KPISection
        ├── hooks/              # useScreenSize
        └── test/setup.ts       # @testing-library/jest-dom + cleanup automatico
```

### Estrutura-alvo (modularizacao do backend, prox PRs)

`backend/src/` vai ser quebrado em `modules/<feature>/{controller,service,routes,dto,middleware,__tests__}.ts`, `shared/middlewares/`, `shared/utils/`, `integrations/{sighra,raster}/`, `db/{client,migrations,seeds}/`. Acompanhar em `docs/MIGRATION_PLAN.md` quando criado.

## Comandos do Projeto

```bash
pnpm install                  # Instalar dependencias do monorepo
pnpm dev                      # Sobe backend (3000) + frontend (5173) em paralelo via concurrently
pnpm build                    # Build de backend (tsc -> dist) + frontend (vite build -> dist)
pnpm preview                  # Preview do build do frontend
pnpm lint                     # ESLint em backend + frontend
pnpm format                   # Prettier --write em todos os arquivos suportados
pnpm format:check             # Prettier --check (usado no CI)
pnpm typecheck                # tsc --noEmit em backend + frontend
pnpm test                     # Vitest run em backend + frontend
pnpm validate                 # typecheck + lint + format:check + test (rodar antes de PR)
pnpm clean                    # rm -rf backend/dist frontend/dist
```

Backend-especifico (de dentro de `backend/`):

```bash
pnpm dev                      # tsx watch src/index.ts
pnpm build                    # tsc para dist/
pnpm start                    # node dist/index.js (producao)
pnpm test:watch               # vitest --watch
```

Frontend-especifico (de dentro de `frontend/`):

```bash
pnpm dev                      # vite (porta 5173 com proxy)
pnpm build                    # tsc --noEmit && vite build
pnpm preview                  # vite preview
```

## Análise de Código & Debugging

Quando pedido para analisar ou auditar algo, sempre leia o código-fonte real primeiro. Nunca abra issues, faça afirmações sobre respostas de API, ou forneça análise baseada em suposições ou contexto antigo. Verifique pela fonte antes de afirmar fatos.

## Implementação Incremental

Quebrar mudanças grandes em incrementos menores e individualmente testados. Não fazer sweeping changes de 8+ arquivos de uma vez — implementar, testar e validar cada pedaço antes de seguir pro próximo. Isso evita bugs cascateados (loops de render, imports quebrados, conflitos de animação) que exigem múltiplos ciclos de correção.

Para features complexas:

1. Implementar a parte mais arriscada/central primeiro
2. Testar (rodar app, verificar visualmente se for UI)
3. Só depois estender para os demais arquivos
4. Commitar em pontos estáveis — não acumular mudanças não testadas

## Implementação de UI/UX

Ao implementar funcionalidades de UI que referenciam um produto existente (ex: 'estilo Grafana'), estude o comportamento real do produto cuidadosamente antes de implementar. Não aproxime — reproduza o comportamento real fielmente. Se incerto sobre uma interação específica, pergunte ao invés de adivinhar.

**Preferência de design do Orion**: dashboard escuro corporativo (paleta `#080e14`/`#0d141c`, primário `#005bbd`, BWT azul). Modo TV deve manter densidade de informação alta sem afastar o operador. Ícones via Material Symbols Outlined e Font Awesome 6 (CDN). Animações com `motion/react` para modais e transições de view.

### Verificação Visual com Playwright (OBRIGATÓRIO para mudanças de UI)

Antes de commitar QUALQUER fix visual ou mudança de UI:

1. Abrir a página afetada via Playwright e tirar screenshot do estado atual (antes)
2. Aplicar as mudanças
3. Tirar screenshot do resultado (depois) e analisar visualmente
4. Para modais/botões/interações: **clicar em CADA elemento** e verificar resultado
5. Verificar: alinhamento, contraste, hover states, z-index, animações, overflow de texto, responsividade, modo TV
6. Se o usuário enviar prints/screenshots — verificar PRIMEIRO no ambiente local via Playwright. NUNCA assumir que são de outro ambiente (QA, produção). Investigar, não descartar.

## Workflow Git & PR

- Branch principal: `main`. Branch de desenvolvimento: `dev`
- Branches de feature: criadas A PARTIR de `dev`, PRs SEMPRE para `dev`
- Release: PR de `dev` → `main` com label (`release:patch/minor/major`)
- **NUNCA** fazer commit/push direto em `dev` ou `main` — TODA alteração via PR
- **NUNCA** fazer merge de PRs automaticamente — apenas criar e aguardar aprovação humana
- Título e corpo da PR SEMPRE em PT-BR, sem emojis, sem rodapés de IA
- Mensagens de commit em inglês seguindo conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`)

Sempre espere o CI passar antes de mergear PRs. Nunca mergeie sem checks verdes. Após criar uma PR, monitore o status do CI e corrija falhas antes de solicitar merge.

Nunca execute `git clean -fd` ou qualquer operação destrutiva do git sem aprovação explícita do usuário. Sempre faça commit ou stash do trabalho antes de trocar de branch. Trate trabalho não commitado como sagrado.

### Checklist Pre-PR (OBRIGATÓRIO)

1. `pnpm lint` — ESLint sem erros (backend + frontend)
2. `pnpm format:check` → se falhar, `pnpm format` e commitar
3. `pnpm test` — Vitest verde em backend + frontend
4. `pnpm typecheck` — TypeScript sem erros
5. `pnpm build` — build real (`tsc` no backend + `vite build` no frontend)
6. Verificar que `.env` real não foi versionado e que `backend/data/bwt_fleet.db` continua fora do staging
7. Migrations idempotentes (`IF NOT EXISTS` / `IF EXISTS`)
8. Só então criar PR via `gh pr create`

Atalho: `pnpm validate` roda typecheck + lint + format:check + test em uma linha.

### Migrations (CRÍTICO)

- Hoje (legado): `ALTER TABLE ... ADD COLUMN` em loop com `try/catch` silencioso. Idempotente mas sem versionamento.
- Alvo (Fase 2/6): arquivos SQL versionados em `backend/src/db/migrations/<timestamp>_<nome>.sql` aplicados em ordem por um runner próprio, ou Prisma com SQLite/Postgres
- SEMPRE usar `IF NOT EXISTS` / `IF EXISTS` em DDL manual
- SQL deve ser idempotente

## Padrões de Código

- **Código em inglês**: nomes, comentários, logs. Apenas mensagens de UI ficam em PT-BR.
- Auth guard: rotas `/api/*` (exceto `/api/auth/*` e `/api/sighra/webhook`) exigem cookie de sessão validado em `getAuthUserFromToken`
- Socket.IO: autenticado via cookie em `io.use()`. Servidor faz push; cliente apenas escuta.
- API base URL: `/api`
- Mensagens de erro padronizadas: `{ error: string }` no JSON. Considerar `{ error, code, requestId }` na Fase 7 (observabilidade).
- Commit apenas arquivos alterados (não usar `git add -A`; usar `git add <arquivo>` ou paths específicos)
- Após formatar, conferir mudanças reais com `git diff --ignore-cr-at-eol` para evitar noise de CRLF no Windows

### Código Limpo e Sem Legado

- Quando solicitada a remoção de um sistema/módulo para recriar, **remover completamente** — não deixar código morto, imports órfãos, ou arquivos fantasma
- Não comentar código antigo com `// removed` ou `// deprecated` — deletar
- Após remoção, verificar: imports que referenciavam o módulo, rotas, stores, services, types
- Caso atual conhecido: rota `POST /api/sync/manual` é chamada pelo `DashboardHeader.tsx` mas NÃO existe no backend (chamada órfã). Decidir: implementar ou remover, não deixar como está.

### Isolamento de Módulos (CRÍTICO)

Módulos/features do projeto são **isolados por contexto**. Cada feature deve ter seus próprios arquivos, mesmo que a lógica seja similar a outra feature.

- **NUNCA** compartilhar componentes entre features que são conceitualmente separadas
- Se duas features precisam de lógica similar: **copiar e adaptar**, criando arquivos próprios para cada uma
- Avisar o usuário: "Vou precisar criar uma versão própria de [X] para [Y], pois compartilhar com [Z] misturaria contextos"
- Arquivos compartilhados legítimos ficam em `shared/` ou `lib/` com nomes genéricos que refletem o propósito

### Variáveis de Ambiente

- **Preferir banco de dados** sobre `.env` sempre que possível
- Configurações que podem mudar em runtime (feature flags, limites, URLs internas) → banco (tabela de settings ou similar)
- `.env` reservado para: credenciais de infra (SIGHRA, Raster, Microsoft OAuth, bootstrap admin), secrets que não podem estar em banco
- Não poluir `.env` com configurações de aplicação — se faz sentido estar em banco, colocar em banco
- Variáveis obrigatórias hoje: `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS`, `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD`. Sem elas, o servidor não sobe.

### Pesquisa e Escolha de Dependências

- **SEMPRE open-source** com licença permissiva: MIT, Apache 2.0, BSD, ISC
- **NUNCA** GPL, AGPL, SSPL, ou qualquer licença que obrigue a liberar código-fonte
- Antes de sugerir uma lib, verificar: licença, manutenção ativa (commits recentes), issues abertas críticas
- Pesquisar na web o que existe antes de propor construir do zero
- Ao comparar opções, trazer: licença, stars, última release, tamanho do bundle, dependências transitivas

### Bibliotecas Primeiro (IMPORTANTE)

Antes de implementar qualquer funcionalidade nova, **sempre** verificar:

1. Já existe uma biblioteca que faz exatamente isso? (pesquisar npm, GitHub)
2. É algo trivial que uma lib resolve em 5 minutos vs horas de implementação manual?
3. O projeto já tem uma dependência que faz isso? (verificar `package.json` antes de adicionar outra)

Não reinventar a roda. Se existe uma lib bem mantida, com licença permissiva, que resolve o problema — usar. Implementação manual só quando: a lib não existe, é abandonada, tem licença problemática, ou adiciona complexidade desnecessária (lib de 500KB para uma função de 10 linhas).

Ao sugerir implementação manual, justificar: "Não encontrei lib adequada porque [motivo]" ou "Existe [lib X] mas [problema], então faz mais sentido implementar".

**Dependências instaladas mas não usadas hoje** (alvo de remoção na Fase 1): `@google/genai`, `@react-google-maps/api`, `xlsx`, `lucide-react`. Verificar imports antes de remover, mas hoje nenhum existe em `src/` ou `server.ts`.

## Contexto Empresarial

### Grupo Potencial

O Orion pertence ao **Grupo Potencial**, conglomerado brasileiro fundado em 1994 por **Arnoldo Hammerschmidt** (engenheiro mecânico, UFPR 1979), com sede na região metropolitana de Curitiba/PR.

**Setores**: energia, combustíveis, agronegócio, logística, trading internacional, químicos.
**Faturamento**: ~R$10 bi (2023), meta R$20 bi até 2030.
**Funcionários**: ~10.000 diretos e indiretos.

**Subsidiárias relevantes para o Orion**:

- **BWT Transporte**: transporte rodoviário de cargas perigosas — operação primária monitorada pelo Orion
- **Potencial Combustíveis**: distribuição (200+ postos, 2.000+ municípios) — frotas associadas
- **Potencial Agro**: esmagadora de soja em Lapa/PR — logística de grãos
- **BWSP**: logística portuária em Paranaguá/PR

**Setor de IA e Inovação**: onde o Orion é desenvolvido. Email: `global.inovacao@grpotencial.com.br`

**Cores institucionais**:

- Azul Potencial: `#2561C1` (primária)
- Verde Potencial: `#28B877` (secundária/sustentabilidade)
- Navy escuro: `#003349`
- Site: `potencial.net.br`

**Ecossistema de software**:

- **GitHub Org**: `Grupo-Potencial-IA-e-Inovacao` (repos privados, TypeScript + Python)
- **Deploy**: Easypanel com Docker multi-stage
- **Auth corporativo**: Microsoft OAuth com domínio `grpotencial.com.br`; o Orbital atua como OIDC provider em alguns produtos (não é o caso do Orion hoje)
- **CI/CD compartilhado**: repo `Grupo-Potencial-IA-e-Inovacao/workflows` com actions reutilizáveis (lint, test, builds, version-dev, release, deploy-dev, pr-release-labels, setup-release-labels)

Decisões técnicas devem considerar o contexto empresarial: segurança corporativa, escalabilidade para múltiplas unidades, conformidade com governança, e integração entre os produtos do ecossistema.

## CI/CD (GitHub Actions)

A configuração do CI/CD ainda não está em vigor neste repo (será criada na Fase 3 do plano de migração). O alvo é usar os workflows reutilizáveis da org via wrappers de uma linha:

- `lint.yml` — ESLint + Prettier (depende de pnpm + ESLint na Fase 2)
- `test.yml` — Vitest (depende de Vitest na Fase 2)
- `backend-build.yml` — build do backend
- `frontend-build.yml` — build do frontend
- `version-dev.yml` — auto-versiona `package.json` em push para `dev` (`X.Y.Z-dev.<timestamp>`)
- `release.yml` — em push para `main`, lê label `release:patch|minor|major`, bumpa semver, cria tag, GH release, sincroniza `main → dev`
- `pr-release-labels.yml` — comentário lembrando label de release em PR para `main`
- `setup-release-labels.yml` — `workflow_dispatch` para criar as 3 labels
- `deploy-dev.yml` — webhook Easypanel via `EASYPANEL_DEPLOY_WEBHOOK_DEV`

Atualizar esta seção quando a Fase 3 for mergeada.

## Implementação Paralela com Worktrees (Issues em Lote)

Quando o usuário fornecer múltiplas issues para implementar em paralelo, seguir este protocolo:

### Fluxo Completo (4 fases)

**Fase 1 — Preparação**

1. Ler todas as issues via `gh issue view` — entender escopo e dependências
2. Detectar conflitos potenciais — se duas issues tocam os mesmos arquivos, avisar ANTES de iniciar

**Fase 2 — Implementação Paralela**

3. Para cada issue, disparar um sub-agente com `isolation: "worktree"`:
   - O agente recebe: número da issue, contexto completo do problema, arquivos relevantes
   - O agente deve: ler a issue → implementar → escrever testes → rodar checklist pre-PR → criar PR
   - O agente NÃO deve modificar arquivos fora do escopo da sua issue
   - A worktree é automaticamente limpa se o agente não fizer mudanças; caso contrário, o branch e path são retornados

**Fase 3 — Limpeza + Aguardar CI**

4. Limpar worktrees (ver seção abaixo)
5. Gerar tabela resumo parcial com status das PRs
6. Aguardar CI de todas as PRs: `gh pr checks <PR_NUMBER> --watch` para cada uma
   - Se CI falhar em alguma PR, reportar quais falharam e por quê
   - NÃO prosseguir para review de PRs com CI vermelho

**Fase 4 — Review Automatizado**

7. Para cada PR com CI verde, disparar um sub-agente de review (em background):
   - O agente usa a skill `review-pr` (`.claude/skills/review-pr/SKILL.md`)
   - Analisa diff, tipagem, segurança, testes, escopo, migrations
   - Retorna relatório estruturado com veredicto: APROVADO ou MUDANÇAS NECESSÁRIAS

8. Após todos os reviews completarem, retornar com:

   | Issue | PR  | CI  | Review | Problemas |
   | ----- | --- | --- | ------ | --------- |

9. Sinalizar PRs que toquem arquivos sobrepostos para revisão manual
10. Merge é SEMPRE decisão humana — nunca mergear automaticamente

### Limpeza de Worktrees (OBRIGATÓRIO)

- Após a PR ser criada e o branch pushado, remover a worktree: `git worktree remove <path>`
- Ao final do lote, verificar com `git worktree list` que não sobrou nenhuma worktree órfã
- Se sobrar, limpar: `git worktree remove <path> --force` (só worktrees deste lote, nunca a principal)
- NUNCA deixar worktrees acumulando entre sessões — polui o repo e consome disco

### Regras dos Sub-agentes de Implementação

- Cada sub-agente deve rodar o checklist pre-PR completo (lint, test, typecheck, build)
- PRs criadas a partir de `dev`, direcionadas para `dev`
- Se um sub-agente falhar, reportar o erro — não silenciar
- Não tentar resolver conflitos entre PRs automaticamente — apenas reportar para revisão humana

### Regras do Agente de Review

- Só inicia após CI verde — PR com CI vermelho não é revisada
- Usa a skill em `.claude/skills/review-pr/SKILL.md` como guia
- Roda em background para não bloquear reviews de outras PRs
- Retorna relatório para o Claude principal — NUNCA comenta na PR ou aprova diretamente
- Se encontrar mudanças necessárias, lista exatamente o que precisa ser corrigido

## Skills Disponíveis

As skills ficam em `.claude/skills/` e definem fluxos completos para tarefas recorrentes:

| Skill            | Diretório                        | Quando usar                                          |
| ---------------- | -------------------------------- | ---------------------------------------------------- |
| `review-pr`      | `.claude/skills/review-pr/`      | Revisão técnica de PR (pós-CI)                       |
| `changelog`      | `.claude/skills/changelog/`      | Resumo de atividade para gestão/stakeholders         |
| `sprint-summary` | `.claude/skills/sprint-summary/` | Radiografia técnica para o dev                       |
| `triage`         | `.claude/skills/triage/`         | Categorizar e priorizar issues abertas               |
| `release`        | `.claude/skills/release/`        | Preparar PR de release dev→main                      |
| `audit`          | `.claude/skills/audit/`          | Auditoria profunda de módulo ou concern              |
| `research`       | `.claude/skills/research/`       | Pesquisa estruturada com trade-offs                  |
| `ci-status`      | `.claude/skills/ci-status/`      | Panorama do CI e PRs abertas                         |
| `architect`      | `.claude/skills/architect/`      | Discovery e scaffolding de novos projetos/apps       |
| `monday`         | `.claude/skills/monday/`         | Documentação e updates no Monday.com via MCP         |
| `ship`           | `.claude/skills/ship/`           | Branch → PR → CI → merge (fluxo completo de entrega) |

**Como usar uma skill**: Ler o arquivo `SKILL.md` da skill relevante antes de executar — ele contém o fluxo completo, comandos, regras e formato de output. O path é sempre `.claude/skills/<nome>/SKILL.md`.

## Localização dos Arquivos de Configuração

| Arquivo                                 | Path                                | Escopo                  | Versionado |
| --------------------------------------- | ----------------------------------- | ----------------------- | ---------- |
| CLAUDE.md (regras do projeto)           | `./CLAUDE.md`                       | Projeto (todos os devs) | Sim        |
| CLAUDE.local.md (preferências pessoais) | `./CLAUDE.local.md`                 | Pessoal (cada dev)      | Não        |
| Skills do projeto                       | `.claude/skills/<nome>/SKILL.md`    | Projeto (todos os devs) | Sim        |
| Settings do usuário                     | `~/.claude/settings.json`           | Pessoal (cada dev)      | Não        |
| Memórias                                | `~/.claude/projects/<hash>/memory/` | Pessoal (cada dev)      | Não        |
