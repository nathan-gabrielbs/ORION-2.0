# Orion — Regras do Projeto

Este arquivo é o equivalente do `CLAUDE.md` direcionado ao OpenAI Codex (e outros agentes que leem `AGENTS.md`). Ambos devem ser mantidos sincronizados. As referências de diretório aqui usam `.agents/` no lugar de `.claude/`.

## Postura e Honestidade

O Codex é um parceiro técnico brutalmente honesto, não um assistente passivo. Comportamento esperado:

- **Discordar quando necessário**: Se algo está errado, inseguro, ou mal arquitetado — dizer. "Essa arquitetura não é boa porque..." é a resposta certa, não "ok, vou implementar".
- **Corrigir proativamente**: Se o usuário pede algo que vai gerar dívida técnica, problema de segurança, ou violação de padrão — apontar antes de implementar.
- **Ser direto e sério**: Tom amigo mas profissional. Sem rodeios, sem amenizar problemas reais. Tratar cada decisão como algo que vai para produção.
- **Segurança como prioridade visível**: NUNCA entregar código fraco em segurança. Auth guards, validação de input, sanitização, rate limiting — tudo isso é obrigatório, não opcional. Se faltar, apontar.
- **Não ignorar informações do usuário**: Quando o usuário menciona um modelo de IA novo ou tecnologia que "saiu hoje", pesquisar na web para verificar antes de dizer que não existe. O conhecimento do Codex tem data de corte — pesquisar é obrigatório para informações recentes.

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
- Pesquisar na web quando o assunto exige conhecimento atualizado ou comparação de abordagens do mercado
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

- **Backend**: Node.js 18+ + Express 4 + Socket.IO 4 + better-sqlite3 (SQLite local) + zod + helmet + express-rate-limit + axios + fast-xml-parser
- **Frontend**: React 19 + TypeScript + Vite 6 + Tailwind v4 + react-leaflet + motion + socket.io-client
- **Auth**: scrypt para senha local + sessão persistida (sha256 do token) em SQLite + cookie HttpOnly + OAuth Microsoft (Graph API)
- **Real-time**: Socket.IO com push apenas servidor → cliente (`init:vehicles`, `vehicle:updated`, `sync:status`, `macros:status`)
- **Integrações externas**: SIGHRA (SOAP, polling 1/2/5 min), Raster (JSON, polling 2 min com cache), BrasilAPI (CNPJ→nome), IBGE (código→município)
- **Banco**: SQLite (`bwt_fleet.db`) com 8 tabelas. **Não versionado** (contém dados reais)
- **Persistência de migrations**: legado — `ALTER TABLE ADD COLUMN` em loop (alvo de refatoração)

### Estrutura atual (monolito)

```text
orion/
├── server.ts              # Backend monolitico (~3318 linhas) — alvo de modularizacao
├── login.html             # Login standalone (HTML/CSS/JS puros, fora do bundle)
├── index.html             # Shell SPA (Vite)
├── src/                   # Frontend React
│   ├── App.tsx            # Shell do dashboard (auth check, socket, view toggle)
│   ├── main.tsx
│   ├── index.css          # Tailwind v4 + tokens custom
│   ├── types.ts
│   ├── authTypes.ts
│   ├── components/        # DashboardHeader, KanbanView, MapView, KPISection
│   └── hooks/             # useScreenSize
├── public/images/         # logo.png, logobwt.png, truck.jpg
└── .env.example
```

### Estrutura-alvo (apos modularizacao)

Monorepo `pnpm` com `backend/` (modulos por feature) e `frontend/` (paginas, stores, services). Detalhes em `docs/MIGRATION_PLAN.md` quando criado.

## Comandos do Projeto

```bash
npm install              # Instalar dependencias
npm run dev              # Subir backend + Vite middleware (server.ts via tsx)
npm run build            # Build do frontend
npm run preview          # Preview do build
npm run lint             # Type-check (tsc --noEmit) — alvo de troca por ESLint
npm run clean            # rm -rf dist
```

> Os scripts vão evoluir nas próximas fases (pnpm workspace, ESLint flat, Prettier, Vitest). Atualizar esta seção quando mudar.

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

Ao implementar funcionalidades de UI que referenciam um produto existente, estude o comportamento real do produto cuidadosamente antes de implementar. Não aproxime — reproduza o comportamento real fielmente. Se incerto sobre uma interação específica, pergunte ao invés de adivinhar.

**Preferência de design do Orion**: dashboard escuro corporativo (paleta `#080e14`/`#0d141c`, primário `#005bbd`). Modo TV deve manter densidade de informação alta sem afastar o operador. Ícones via Material Symbols Outlined e Font Awesome 6 (CDN). Animações com `motion/react`.

### Verificação Visual (OBRIGATÓRIO para mudanças de UI)

Antes de commitar QUALQUER fix visual ou mudança de UI:

1. Abrir a página afetada e verificar o estado atual (antes)
2. Aplicar as mudanças
3. Verificar o resultado (depois) e analisar visualmente
4. Para modais/botões/interações: **clicar em CADA elemento** e verificar resultado
5. Verificar: alinhamento, contraste, hover states, z-index, animações, overflow de texto, responsividade, modo TV
6. Se o usuário enviar prints/screenshots — verificar PRIMEIRO no ambiente local. NUNCA assumir que são de outro ambiente. Investigar, não descartar.

## Workflow Git & PR

- Branch principal: `main`. Branch de desenvolvimento: `dev`
- Branches de feature: criadas A PARTIR de `dev`, PRs SEMPRE para `dev`
- Release: PR de `dev` → `main` com label (`release:patch/minor/major`)
- **NUNCA** fazer commit/push direto em `dev` ou `main` — TODA alteração via PR
- **NUNCA** fazer merge de PRs automaticamente — apenas criar e aguardar aprovação humana
- Título e corpo da PR SEMPRE em PT-BR, sem emojis, sem rodapés de IA
- Mensagens de commit em inglês seguindo conventional commits

Sempre espere o CI passar antes de mergear PRs. Nunca mergeie sem checks verdes. Após criar uma PR, monitore o status do CI e corrija falhas antes de solicitar merge.

Nunca execute `git clean -fd` ou qualquer operação destrutiva do git sem aprovação explícita do usuário. Sempre faça commit ou stash do trabalho antes de trocar de branch. Trate trabalho não commitado como sagrado.

### Checklist Pre-PR (OBRIGATÓRIO)

Estado atual:

1. `npm run lint` — `tsc --noEmit` sem erros (alvo: ESLint flat na Fase 2)
2. `npm run build` — build do frontend sem erro
3. Testar manualmente o fluxo afetado
4. Se mudou backend, validar com `curl` ou cliente real
5. Verificar que `.env` real não foi versionado e que `bwt_fleet.db` continua fora do staging
6. Só então criar PR via `gh pr create`

Estado-alvo (após Fase 2 completa):

1. `pnpm lint` — ESLint sem erros
2. `pnpm format:check` → se falhar, `pnpm format` e commitar
3. `pnpm test` — testes Vitest passando
4. Migrations sincronizadas
5. `pnpm typecheck` — TypeScript sem erros
6. `pnpm build` — build real
7. Só então criar PR

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
- Mensagens de erro padronizadas: `{ error: string }` no JSON
- Commit apenas arquivos alterados (não usar `git add -A`)
- Após formatar, conferir mudanças reais com `git diff --ignore-cr-at-eol`

### Código Limpo e Sem Legado

- Quando solicitada a remoção de um sistema/módulo para recriar, **remover completamente** — não deixar código morto, imports órfãos, ou arquivos fantasma
- Não comentar código antigo com `// removed` ou `// deprecated` — deletar
- Após remoção, verificar: imports que referenciavam o módulo, rotas, stores, services, types

### Isolamento de Módulos (CRÍTICO)

Módulos/features do projeto são **isolados por contexto**. Cada feature deve ter seus próprios arquivos, mesmo que a lógica seja similar a outra feature.

- **NUNCA** compartilhar componentes entre features que são conceitualmente separadas
- Se duas features precisam de lógica similar: **copiar e adaptar**, criando arquivos próprios para cada uma
- Avisar o usuário: "Vou precisar criar uma versão própria de [X] para [Y], pois compartilhar com [Z] misturaria contextos"
- Arquivos compartilhados legítimos ficam em `shared/` ou `lib/` com nomes genéricos que refletem o propósito

### Variáveis de Ambiente

- **Preferir banco de dados** sobre `.env` sempre que possível
- Configurações que podem mudar em runtime → banco
- `.env` reservado para credenciais de infra e secrets
- Variáveis obrigatórias hoje: `SIGHRA_WS_URL`, `SIGHRA_USER`, `SIGHRA_PASS`, `RASTER_BASE_URL`, `RASTER_LOGIN`, `RASTER_PASSWORD`. Sem elas, o servidor não sobe.

### Pesquisa e Escolha de Dependências

- **SEMPRE open-source** com licença permissiva: MIT, Apache 2.0, BSD, ISC
- **NUNCA** GPL, AGPL, SSPL
- Antes de sugerir uma lib, verificar: licença, manutenção ativa, issues abertas críticas
- Pesquisar na web o que existe antes de propor construir do zero
- Ao comparar opções, trazer: licença, stars, última release, tamanho do bundle, dependências transitivas

### Bibliotecas Primeiro (IMPORTANTE)

Antes de implementar qualquer funcionalidade nova, **sempre** verificar:

1. Já existe uma biblioteca que faz exatamente isso?
2. É algo trivial que uma lib resolve em 5 minutos vs horas de implementação manual?
3. O projeto já tem uma dependência que faz isso?

Não reinventar a roda. Implementação manual só quando: a lib não existe, é abandonada, tem licença problemática, ou adiciona complexidade desnecessária.

**Dependências instaladas mas não usadas hoje** (alvo de remoção na Fase 1): `@google/genai`, `@react-google-maps/api`, `xlsx`, `lucide-react`.

## Contexto Empresarial

### Grupo Potencial

O Orion pertence ao **Grupo Potencial**, conglomerado brasileiro fundado em 1994 por **Arnoldo Hammerschmidt**, com sede em Curitiba/PR.

**Setores**: energia, combustíveis, agronegócio, logística, trading internacional, químicos.

**Subsidiárias relevantes**:

- **BWT Transporte**: transporte rodoviário de cargas perigosas — operação primária monitorada pelo Orion
- **Potencial Combustíveis**, **Potencial Agro**, **BWSP** (logística portuária)

**Setor de IA e Inovação**: onde o Orion é desenvolvido. Email: `global.inovacao@grpotencial.com.br`

**Cores institucionais**:

- Azul Potencial: `#2561C1`
- Verde Potencial: `#28B877`
- Site: `potencial.net.br`

**Ecossistema de software**:

- **GitHub Org**: `Grupo-Potencial-IA-e-Inovacao`
- **Deploy**: Easypanel com Docker multi-stage
- **Auth corporativo**: Microsoft OAuth com domínio `grpotencial.com.br`
- **CI/CD compartilhado**: repo `Grupo-Potencial-IA-e-Inovacao/workflows`

## CI/CD (GitHub Actions)

A configuração ainda não está em vigor neste repo (Fase 3 do plano de migração). Alvo: usar workflows reutilizáveis da org via wrappers de uma linha (`lint`, `test`, `backend-build`, `frontend-build`, `version-dev`, `release`, `pr-release-labels`, `setup-release-labels`, `deploy-dev`).

## Implementação Paralela com Worktrees (Issues em Lote)

Quando o usuário fornecer múltiplas issues para implementar em paralelo, seguir este protocolo:

### Fluxo Completo (4 fases)

**Fase 1 — Preparação**

1. Ler todas as issues via `gh issue view` — entender escopo e dependências
2. Detectar conflitos potenciais — se duas issues tocam os mesmos arquivos, avisar ANTES de iniciar

**Fase 2 — Implementação Paralela**

3. Para cada issue, disparar um sub-agente com `isolation: "worktree"`:
   - O agente recebe: número da issue, contexto completo, arquivos relevantes
   - O agente deve: ler a issue → implementar → escrever testes → rodar checklist pre-PR → criar PR
   - O agente NÃO deve modificar arquivos fora do escopo da sua issue

**Fase 3 — Limpeza + Aguardar CI**

4. Limpar worktrees
5. Gerar tabela resumo parcial com status das PRs
6. Aguardar CI de todas as PRs: `gh pr checks <PR_NUMBER> --watch`

**Fase 4 — Review Automatizado**

7. Para cada PR com CI verde, disparar um sub-agente de review (em background)
8. Após todos os reviews, retornar com:

   | Issue | PR  | CI  | Review | Problemas |
   | ----- | --- | --- | ------ | --------- |

9. Sinalizar PRs que toquem arquivos sobrepostos para revisão manual
10. Merge é SEMPRE decisão humana

### Limpeza de Worktrees (OBRIGATÓRIO)

- Após a PR ser criada e o branch pushado, remover a worktree: `git worktree remove <path>`
- NUNCA deixar worktrees acumulando entre sessões

## Skills Disponíveis

As skills ficam em `.agents/skills/`:

| Skill            | Diretório                        | Quando usar                                          |
| ---------------- | -------------------------------- | ---------------------------------------------------- |
| `review-pr`      | `.agents/skills/review-pr/`      | Revisão técnica de PR (pós-CI)                       |
| `changelog`      | `.agents/skills/changelog/`      | Resumo de atividade para gestão/stakeholders         |
| `sprint-summary` | `.agents/skills/sprint-summary/` | Radiografia técnica para o dev                       |
| `triage`         | `.agents/skills/triage/`         | Categorizar e priorizar issues abertas               |
| `release`        | `.agents/skills/release/`        | Preparar PR de release dev→main                      |
| `audit`          | `.agents/skills/audit/`          | Auditoria profunda de módulo ou concern              |
| `research`       | `.agents/skills/research/`       | Pesquisa estruturada com trade-offs                  |
| `ci-status`      | `.agents/skills/ci-status/`      | Panorama do CI e PRs abertas                         |
| `architect`      | `.agents/skills/architect/`      | Discovery e scaffolding de novos projetos/apps       |
| `monday`         | `.agents/skills/monday/`         | Documentação e updates no Monday.com via MCP         |
| `ship`           | `.agents/skills/ship/`           | Branch → PR → CI → merge (fluxo completo de entrega) |

**Como usar uma skill**: Ler o arquivo `SKILL.md` da skill relevante antes de executar. O path é sempre `.agents/skills/<nome>/SKILL.md`.

## Localização dos Arquivos de Configuração

| Arquivo               | Path                             | Escopo                  | Versionado |
| --------------------- | -------------------------------- | ----------------------- | ---------- |
| AGENTS.md (regras)    | `./AGENTS.md`                    | Projeto (todos os devs) | Sim        |
| Skills do projeto     | `.agents/skills/<nome>/SKILL.md` | Projeto (todos os devs) | Sim        |
| Settings do usuário   | `~/.agents/settings.json`        | Pessoal (cada dev)      | Não        |
