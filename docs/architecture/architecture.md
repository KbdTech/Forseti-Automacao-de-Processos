# Documento de Arquitetura — Sistema de Gestão de OS e Compras Públicas

> **Projeto:** Forseti Automações — Sistema Municipal de Ordens de Serviço
> **Versão:** 1.0
> **Data:** Fevereiro de 2026
> **Autora:** Aria (Architect Agent) — Synkra AIOS
> **Status:** Aprovado para Sprint 1

---

## Sumário

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Estrutura de Pastas](#3-estrutura-de-pastas)
4. [Arquitetura em Camadas](#4-arquitetura-em-camadas)
5. [Máquina de Estados das Ordens](#5-máquina-de-estados-das-ordens)
6. [RBAC — Controle de Acesso por Perfil](#6-rbac--controle-de-acesso-por-perfil)
7. [Modelagem de Banco de Dados](#7-modelagem-de-banco-de-dados)
8. [Design da API REST](#8-design-da-api-rest)
9. [Arquitetura de Autenticação e Segurança](#9-arquitetura-de-autenticação-e-segurança)
10. [Arquitetura do Front-End](#10-arquitetura-do-front-end)
11. [Convenções de Código](#11-convenções-de-código)
12. [Decisões Arquiteturais (ADRs)](#12-decisões-arquiteturais-adrs)
13. [Roadmap por Sprint](#13-roadmap-por-sprint)

---

## 1. Visão Geral do Sistema

### Contexto

O sistema substitui processos informais (e-mail, papel, planilhas) por um fluxo digital rastreável para gestão de **Ordens de Serviço (OS) e Compras Públicas** de uma Prefeitura Municipal. É um sistema web com controle de acesso por perfil (RBAC), histórico de auditoria append-only e pipeline financeiro integrado.

### Ciclo de Vida de uma Ordem

```
Criação (Secretaria)
    ↓
Aprovação (Gabinete)
    ↓
Conformidade (Controladoria)
    ↓
Empenho (Contabilidade)
    ↓
Execução + Atesto (Secretaria)
    ↓
Liquidação (Contabilidade)
    ↓
Pagamento (Tesouraria)
```

### Princípios Arquiteturais

| Princípio | Aplicação |
|-----------|-----------|
| **Validação Dupla** | Front-end (UX) + Back-end (segurança) em toda ação |
| **Audit Trail Imutável** | `ordem_historico` é append-only, sem UPDATE/DELETE |
| **RBAC no Back-End** | Token JWT validado em CADA requisição |
| **Separação de Responsabilidades** | Routes → Services → Models (3 camadas) |
| **Dados Agregados no Back-End** | Dashboard calculado no servidor, não no front-end |
| **Assincronia para Notificações** | E-mails via background tasks (não bloqueiam a API) |

---

## 2. Stack Tecnológica

### 2.1 Back-End

| Tecnologia | Versão | Responsabilidade |
|------------|--------|-----------------|
| **Python** | 3.11 | Linguagem principal |
| **FastAPI** | 0.100+ | Framework web / API REST |
| **SQLAlchemy** | 2.0+ | ORM — mapeamento objeto-relacional |
| **Alembic** | 1.12+ | Migrations de banco de dados |
| **Pydantic** | 2.0+ | Validação de dados e schemas |
| **PostgreSQL** | — | Banco de dados (via Supabase) |
| **Supabase** | — | Backend-as-a-Service (PostgreSQL gerenciado) |
| **bcrypt** | — | Hash de senhas |
| **python-jose** | — | Geração e validação de tokens JWT |

### 2.2 Front-End

| Tecnologia | Versão | Responsabilidade |
|------------|--------|-----------------|
| **Node.js** | 20 | Runtime JavaScript |
| **React** | 18 | Framework de UI |
| **TypeScript** | 5 | Tipagem estática (`strict: true`) |
| **Vite** | 5 | Bundler e dev server |
| **Tailwind CSS** | 4 | Estilização utility-first |
| **shadcn/ui** | — | Componentes de UI acessíveis (Radix UI) |
| **Recharts** | — | Gráficos (FunnelChart, BarChart, StackedBar) |
| **React Router** | — | Roteamento client-side com RoleGuard |
| **Zustand** | — | Gerenciamento de estado global |
| **Axios** | — | HTTP client com interceptors JWT |

### 2.3 Infraestrutura e Serviços

| Serviço | Uso |
|---------|-----|
| **Supabase PostgreSQL** | Banco de dados gerenciado |
| **Supabase RLS** | Camada adicional de segurança (Row Level Security) |
| **FastAPI Background Tasks** | Envio assíncrono de e-mails (US-014) |
| **SMTP** | Serviço de e-mail para notificações |

---

## 3. Estrutura de Pastas

```
Forseti-Automacoes/
├── CLAUDE.md                              # Contexto completo do projeto
│
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py                  # Configs via .env (JWT, DB URL, limites)
│   │   │   └── database.py                # Engine SQLAlchemy, SessionLocal, get_db
│   │   │
│   │   ├── models/                        # Modelos SQLAlchemy — mapeamento das tabelas
│   │   │   ├── user.py                    # users, role_change_log
│   │   │   ├── secretaria.py              # secretarias
│   │   │   ├── ordem.py                   # ordens, ordem_historico
│   │   │   └── audit.py                   # audit_logs, notification_log
│   │   │
│   │   ├── schemas/                       # Schemas Pydantic (request/response DTOs)
│   │   │   ├── auth.py                    # LoginPayload, TokenResponse, etc.
│   │   │   ├── user.py                    # UserCreate, UserResponse, RoleUpdate
│   │   │   ├── secretaria.py              # SecretariaCreate, SecretariaResponse
│   │   │   └── ordem.py                   # OrdemCreate, OrdemResponse, AcaoPayload
│   │   │
│   │   ├── routers/                       # Controllers FastAPI — 1 arquivo por domínio
│   │   │   ├── auth.py                    # /api/auth/*
│   │   │   ├── users.py                   # /api/users/*
│   │   │   ├── secretarias.py             # /api/secretarias/*
│   │   │   ├── ordens.py                  # /api/ordens/*
│   │   │   ├── dashboard.py               # /api/dashboard/*
│   │   │   └── audit.py                   # /api/audit-logs
│   │   │
│   │   ├── services/                      # Lógica de negócio desacoplada dos routers
│   │   │   ├── auth_service.py            # Login, JWT, bloqueio por tentativas
│   │   │   ├── ordem_service.py           # Máquina de estados das ordens
│   │   │   └── notification_service.py   # Envio assíncrono de e-mails
│   │   │
│   │   ├── dependencies/                  # Injeção de dependências FastAPI
│   │   │   ├── auth.py                    # get_current_user, require_role
│   │   │   └── permissions.py             # Decorators de RBAC por endpoint
│   │   │
│   │   └── main.py                        # Ponto de entrada, inclusão de routers, CORS
│   │
│   ├── alembic/
│   │   ├── versions/                      # Arquivos de migration gerados
│   │   └── env.py                         # Configuração do ambiente Alembic
│   ├── alembic.ini
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/                        # Componentes shadcn/ui (Button, Input, etc.)
│   │   │
│   │   ├── hooks/                         # Custom hooks React
│   │   │   ├── useAuth.ts                 # Dados do usuário autenticado
│   │   │   └── useOrdens.ts              # Listagem e filtros de ordens
│   │   │
│   │   ├── pages/                         # Páginas — 1 arquivo por rota
│   │   │   ├── LoginPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── NovaOrdemPage.tsx          # StepperForm 3 etapas (US-003)
│   │   │   ├── MinhasOrdensPage.tsx
│   │   │   ├── DevolvidasPage.tsx
│   │   │   ├── GabinetePage.tsx
│   │   │   ├── ControladoriaPage.tsx
│   │   │   ├── EmpenhoPage.tsx
│   │   │   ├── AtestePage.tsx
│   │   │   ├── LiquidacaoPage.tsx
│   │   │   ├── PagamentoPage.tsx
│   │   │   ├── AuditPage.tsx
│   │   │   ├── AdminUsersPage.tsx
│   │   │   ├── AdminSecretariasPage.tsx
│   │   │   └── AcessoNegadoPage.tsx
│   │   │
│   │   ├── routes/
│   │   │   ├── AppRouter.tsx              # Definição central de rotas
│   │   │   └── RoleGuard.tsx              # HOC de proteção por perfil
│   │   │
│   │   ├── services/                      # Camada de acesso à API
│   │   │   ├── api.ts                     # Instância Axios + interceptors JWT
│   │   │   ├── authService.ts
│   │   │   ├── ordensService.ts
│   │   │   ├── secretariasService.ts
│   │   │   ├── dashboardService.ts
│   │   │   └── usersService.ts
│   │   │
│   │   ├── stores/                        # Zustand stores
│   │   │   ├── authStore.ts               # Token JWT, usuário, perfil
│   │   │   └── uiStore.ts                 # Toasts, modais, estado global de UI
│   │   │
│   │   ├── types/                         # Interfaces e types TypeScript
│   │   │   ├── auth.types.ts
│   │   │   ├── ordem.types.ts
│   │   │   ├── secretaria.types.ts
│   │   │   └── user.types.ts
│   │   │
│   │   └── utils/                         # Funções utilitárias puras
│   │       ├── formatters.ts              # Moeda, datas, protocolo
│   │       ├── validators.ts              # Validações de formulário
│   │       └── constants.ts              # Enums, constantes de status e cores
│   │
│   ├── vite.config.ts
│   └── package.json
│
└── docs/
    ├── architecture/
    │   └── architecture.md               # Este documento
    ├── stories/                           # User Stories (AIOS)
    └── prd/                               # Product Requirements Documents
```

---

## 4. Arquitetura em Camadas

### 4.1 Back-End — 3 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 1 — ROUTERS (Controllers)                           │
│  Responsabilidade: HTTP, validação de entrada, serialização │
│  FastAPI routers com Depends() para auth e DB session       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  CAMADA 2 — SERVICES (Business Logic)                       │
│  Responsabilidade: Regras de negócio, máquina de estados,   │
│  geração de protocolo, validação de transições, auditoria   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  CAMADA 3 — MODELS (Data Access)                            │
│  Responsabilidade: SQLAlchemy ORM, queries, tabelas         │
│  Supabase PostgreSQL como banco de dados                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Front-End — Fluxo de Dados

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Pages      │────►│   Services   │────►│   API REST   │
│  (React)     │     │  (Axios)     │     │  (FastAPI)   │
└──────┬───────┘     └──────────────┘     └──────────────┘
       │
       ├── Hooks (useAuth, useOrdens)
       ├── Stores (Zustand: authStore, uiStore)
       └── Components (shadcn/ui + customizados)
```

### 4.3 Fluxo de Autenticação

```
1. LoginPage → POST /api/auth/login
2. Back-end valida credenciais, verifica bloqueio (max 5 tentativas)
3. Gera access_token (8h) + refresh_token (24h)
4. Front-end armazena tokens no authStore (Zustand)
5. Axios interceptor injeta Authorization: Bearer {token} em toda requisição
6. Back-end valida token em CADA endpoint via get_current_user dependency
7. Token expirado → interceptor chama /api/auth/refresh automaticamente
8. Refresh expirado → logout forçado, redirect para /login
```

---

## 5. Máquina de Estados das Ordens

### 5.1 Diagrama de Transições

```
                    [criar]
                       │  secretaria
                       ▼
              AGUARDANDO_GABINETE
             /          |          \
    [autorizar]  [solicitar_alt]  [cancelar]
     gabinete      gabinete        gabinete
        │              │               │
        ▼              ▼               ▼
  AGUARDANDO_   DEVOLVIDA_PARA_    CANCELADA
  CONTROLADORIA  ALTERACAO        (TERMINAL)
     /   |   \        │
    /    |    \    [reenviar]
   /     |     \   secretaria
[ap]  [irr]  [sol_doc]    │
  │     │       │         │
  ▼     ▼       ▼         │
AEmp  COM_   AGUARDANDO   │
      IRRE   DOCUMENTACAO  │
             │             │
             └─────────────┘
             [envio docs]
             secretaria

AGUARDANDO_EMPENHO
        │
     [empenhar]
     contabilidade
        │
        ▼
AGUARDANDO_EXECUCAO
(= AGUARDANDO_ATESTO)
       / \
 [atestar] [recusar]
 secretaria secretaria
     │           │
     ▼           ▼
AGUARDANDO_  EXECUCAO_COM_
LIQUIDACAO    PENDENCIA
     │
  [liquidar]
  contabilidade
     │
     ▼
AGUARDANDO_PAGAMENTO
     │
  [pagar]
  tesouraria
     │
     ▼
   PAGA
 (TERMINAL)
```

### 5.2 Tabela Completa de Transições

| Status Atual | Ação | Perfil | Próximo Status | Campos Obrigatórios |
|---|---|---|---|---|
| — | `criar` | secretaria | `AGUARDANDO_GABINETE` | tipo, prioridade, valor_estimado, justificativa (min 50 chars) |
| `AGUARDANDO_GABINETE` | `autorizar` | gabinete | `AGUARDANDO_CONTROLADORIA` | observacao (opcional) |
| `AGUARDANDO_GABINETE` | `solicitar_alteracao` | gabinete | `DEVOLVIDA_PARA_ALTERACAO` | observacao (min 20 chars, obrigatório) |
| `AGUARDANDO_GABINETE` | `cancelar` | gabinete | `CANCELADA` | observacao (obrigatório) |
| `DEVOLVIDA_PARA_ALTERACAO` | `reenviar` | secretaria | `AGUARDANDO_GABINETE` | observacao (opcional), incrementa versao |
| `AGUARDANDO_CONTROLADORIA` | `aprovar` | controladoria | `AGUARDANDO_EMPENHO` | observacao (opcional) |
| `AGUARDANDO_CONTROLADORIA` | `irregularidade` | controladoria | `COM_IRREGULARIDADE` | observacao (min 50 chars, obrigatório) |
| `AGUARDANDO_CONTROLADORIA` | `solicitar_documentacao` | controladoria | `AGUARDANDO_DOCUMENTACAO` | observacao (obrigatório) |
| `AGUARDANDO_DOCUMENTACAO` | `(envio docs)` | secretaria | `AGUARDANDO_CONTROLADORIA` | — |
| `AGUARDANDO_EMPENHO` | `empenhar` | contabilidade | `AGUARDANDO_EXECUCAO` | numero_empenho (único), valor_empenhado |
| `AGUARDANDO_ATESTO` | `atestar` | secretaria | `AGUARDANDO_LIQUIDACAO` | numero_nf |
| `AGUARDANDO_ATESTO` | `recusar_atesto` | secretaria | `EXECUCAO_COM_PENDENCIA` | motivo (min 30 chars) |
| `AGUARDANDO_LIQUIDACAO` | `liquidar` | contabilidade | `AGUARDANDO_PAGAMENTO` | valor_liquidado, data_liquidacao |
| `AGUARDANDO_PAGAMENTO` | `pagar` | tesouraria | `PAGA` | valor_pago, data_pagamento, forma_pagamento |

### 5.3 Estados Terminais

| Status | Tipo | Reversibilidade |
|--------|------|-----------------|
| `CANCELADA` | Terminal negativo | Somente Admin pode reverter |
| `PAGA` | Terminal positivo | Somente Admin pode reverter em caso de erro |

### 5.4 ENUM PostgreSQL

```sql
CREATE TYPE status_ordem AS ENUM (
  'AGUARDANDO_GABINETE',
  'AGUARDANDO_CONTROLADORIA',
  'AGUARDANDO_EMPENHO',
  'AGUARDANDO_EXECUCAO',
  'AGUARDANDO_ATESTO',
  'AGUARDANDO_LIQUIDACAO',
  'AGUARDANDO_PAGAMENTO',
  'DEVOLVIDA_PARA_ALTERACAO',
  'AGUARDANDO_DOCUMENTACAO',
  'COM_IRREGULARIDADE',
  'EXECUCAO_COM_PENDENCIA',
  'CANCELADA',
  'PAGA'
);
```

### 5.5 Cores de Status no Front-End

| Status | Tailwind | Significado |
|--------|----------|-------------|
| `AGUARDANDO_*` | `bg-blue-100 text-blue-800` | Pendente de ação |
| `DEVOLVIDA_PARA_ALTERACAO` | `bg-yellow-100 text-yellow-800` | Requer atenção |
| `COM_IRREGULARIDADE` | `bg-red-100 text-red-800` | Problema fiscal |
| `EXECUCAO_COM_PENDENCIA` | `bg-red-100 text-red-800` | Não conformidade |
| `CANCELADA` | `bg-gray-100 text-gray-600` | Terminal negativo |
| `PAGA` | `bg-green-100 text-green-800` | Concluído |

---

## 6. RBAC — Controle de Acesso por Perfil

### 6.1 Definição de Perfis

| Perfil | Enum | Descrição |
|--------|------|-----------|
| `secretaria` | `secretaria` | Servidor — cria e acompanha ordens da própria secretaria |
| `gabinete` | `gabinete` | Equipe do Prefeito — autoriza, devolve ou cancela ordens |
| `controladoria` | `controladoria` | Fiscal — analisa conformidade legal e fiscal |
| `contabilidade` | `contabilidade` | Empenhamento e liquidação orçamentária |
| `tesouraria` | `tesouraria` | Efetua e confirma pagamentos |
| `administrador` | `admin` | Gestão da plataforma, usuários, secretarias e acesso total |

### 6.2 Matriz de Permissões por Tela

| Tela / Funcionalidade | secretaria | gabinete | controladoria | contabilidade | tesouraria | admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Login | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dashboard simplificado | ✓ (próprio) | ✓ | — | — | — | ✓ |
| Dashboard executivo completo | — | ✓ | — | — | — | ✓ |
| Nova Ordem | ✓ | — | — | — | — | — |
| Minhas Ordens | ✓ | — | — | — | — | ✓ |
| Devolvidas para Alteração | ✓ | — | — | — | — | ✓ |
| Pipeline Gabinete | — | ✓ | — | — | — | ✓ (RO) |
| Pipeline Controladoria | — | — | ✓ | — | — | ✓ (RO) |
| Pipeline Empenho | — | — | — | ✓ | — | ✓ (RO) |
| Pipeline Atesto | ✓ | — | — | — | — | ✓ (RO) |
| Pipeline Liquidação | — | — | — | ✓ | — | ✓ (RO) |
| Pipeline Pagamento | — | — | — | — | ✓ | ✓ (RO) |
| Histórico/Auditoria da Ordem | ✓ (própria) | ✓ | ✓ | — | — | ✓ |
| Audit Log Global | — | — | — | — | — | ✓ |
| Gestão de Usuários | — | — | — | — | — | ✓ |
| Gestão de Secretarias | — | — | — | — | — | ✓ |

> **RO** = Somente Leitura

### 6.3 Implementação no Back-End

```python
# dependencies/auth.py
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    # Valida JWT, retorna usuário ou HTTP 401
    ...

def require_role(*roles: str):
    """Decorator de RBAC — validado em CADA requisição"""
    async def dependency(
        current_user: User = Depends(get_current_user)
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=403,
                detail="Acesso negado para este perfil"
            )
        return current_user
    return Depends(dependency)

# Uso nos routers:
@router.patch("/{ordem_id}/acao")
def executar_acao(
    ordem_id: UUID,
    payload: AcaoPayload,
    current_user: User = require_role("gabinete", "admin"),
    db: Session = Depends(get_db)
):
    ...
```

### 6.4 Implementação no Front-End

```tsx
// routes/RoleGuard.tsx
// Esconde (não apenas desabilita) rotas sem permissão
const RoleGuard: React.FC<RoleGuardProps> = ({ roles, children }) => {
  const { user } = useAuthStore()
  if (!roles.includes(user?.role)) {
    return <Navigate to="/acesso-negado" replace />
  }
  return <>{children}</>
}

// Botões de ação ficam ocultos (não desabilitados) para perfis sem permissão
{user.role === 'gabinete' && (
  <Button onClick={handleAutorizar}>Autorizar</Button>
)}
```

### 6.5 Regras Críticas de Acesso

1. Back-end **sempre** valida o perfil via token JWT em cada requisição
2. Rota não autorizada retorna **HTTP 403** → front-end redireciona para `/acesso-negado`
3. Botões de ação ficam **ocultos** (não apenas desabilitados) para perfis sem permissão
4. Admin **não pode remover seu próprio perfil** de administrador
5. `secretaria` vê somente ordens da **própria secretaria** (filtro no back-end, nunca no front-end)

---

## 7. Modelagem de Banco de Dados

### 7.1 ENUMs PostgreSQL

```sql
CREATE TYPE role_enum AS ENUM (
  'secretaria', 'gabinete', 'controladoria',
  'contabilidade', 'tesouraria', 'admin'
);

CREATE TYPE tipo_ordem_enum AS ENUM ('COMPRA', 'SERVICO', 'OBRA');

CREATE TYPE prioridade_enum AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

CREATE TYPE forma_pagamento_enum AS ENUM (
  'transferencia', 'cheque', 'pix'
);

CREATE TYPE notification_status_enum AS ENUM ('enviado', 'falhou');
```

### 7.2 Tabela `secretarias`

```sql
CREATE TABLE secretarias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(255) UNIQUE NOT NULL,
  sigla           VARCHAR(5) UNIQUE NOT NULL,
  orcamento_anual DECIMAL(15,2),
  ativo           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

> **Regra:** Secretaria desativada mantém histórico. Não é possível excluir — apenas desativar.

### 7.3 Tabela `users`

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  nome_completo   VARCHAR(255) NOT NULL,
  role            role_enum NOT NULL,
  secretaria_id   UUID REFERENCES secretarias(id),  -- nullable p/ perfis transversais
  is_active       BOOLEAN DEFAULT TRUE,
  first_login     BOOLEAN DEFAULT TRUE,              -- exige troca no primeiro acesso
  login_attempts  INTEGER DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.4 Tabela `ordens`

```sql
CREATE TABLE ordens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo         VARCHAR(20) UNIQUE NOT NULL,         -- OS-2026-00001
  tipo              tipo_ordem_enum NOT NULL,
  prioridade        prioridade_enum NOT NULL,
  secretaria_id     UUID NOT NULL REFERENCES secretarias(id),
  criado_por        UUID NOT NULL REFERENCES users(id),
  responsavel       VARCHAR(255),
  descricao         TEXT,
  valor_estimado    DECIMAL(15,2) NOT NULL CHECK (valor_estimado > 0),
  justificativa     TEXT NOT NULL,                       -- mín 50 chars (validar na app)
  status            status_ordem NOT NULL DEFAULT 'AGUARDANDO_GABINETE',
  versao            INTEGER DEFAULT 1,                   -- incrementado a cada reenvio

  -- Campos financeiros (preenchidos progressivamente)
  numero_empenho    VARCHAR(100) UNIQUE,
  valor_empenhado   DECIMAL(15,2),
  data_empenho      DATE,
  numero_nf         VARCHAR(100),
  data_atesto       TIMESTAMPTZ,
  atestado_por      UUID REFERENCES users(id),
  valor_liquidado   DECIMAL(15,2),
  data_liquidacao   DATE,
  valor_pago        DECIMAL(15,2),
  data_pagamento    DATE,
  forma_pagamento   forma_pagamento_enum,

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Índices obrigatórios de performance
CREATE INDEX idx_ordens_secretaria_id ON ordens(secretaria_id);
CREATE INDEX idx_ordens_status ON ordens(status);
CREATE INDEX idx_ordens_created_at ON ordens(created_at);
CREATE INDEX idx_ordens_secretaria_status ON ordens(secretaria_id, status);
```

> **Protocolo:** Gerado atomicamente no banco no padrão `OS-ANO-SEQUENCIAL` (ex.: `OS-2026-00001`) para evitar duplicatas em ambiente concorrente.

### 7.5 Tabela `ordem_historico` (Append-Only)

```sql
CREATE TABLE ordem_historico (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id        UUID NOT NULL REFERENCES ordens(id),
  usuario_id      UUID NOT NULL REFERENCES users(id),
  perfil          role_enum NOT NULL,
  acao            VARCHAR(100) NOT NULL,
  status_anterior status_ordem,
  status_novo     status_ordem NOT NULL,
  observacao      TEXT,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- SEM colunas updated_at — NUNCA fazer UPDATE ou DELETE
);

CREATE INDEX idx_historico_ordem_id ON ordem_historico(ordem_id);
CREATE INDEX idx_historico_usuario_id ON ordem_historico(usuario_id);
CREATE INDEX idx_historico_created_at ON ordem_historico(created_at);
```

> **CRÍTICO:** Esta tabela é **append-only**. Toda transição de status insere um novo registro. Nenhuma migration pode adicionar UPDATE ou DELETE nesta tabela.

### 7.6 Tabela `audit_logs`

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,  -- LOGIN, LOGOUT, LOGIN_FAILED, etc.
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

### 7.7 Tabelas Auxiliares

```sql
-- Rastreamento de alterações de perfil
CREATE TABLE role_change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  old_role    role_enum NOT NULL,
  new_role    role_enum NOT NULL,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rastreamento de notificações por e-mail
CREATE TABLE notification_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id     UUID REFERENCES ordens(id),
  evento       VARCHAR(100) NOT NULL,
  destinatario VARCHAR(255) NOT NULL,
  status       notification_status_enum NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preferências de notificação por usuário
CREATE TABLE user_notification_prefs (
  user_id     UUID NOT NULL REFERENCES users(id),
  evento      VARCHAR(100) NOT NULL,
  ativo       BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, evento)
);
```

### 7.8 Restrições de Integridade

| Regra | Implementação |
|-------|--------------|
| FK com restrição | `ON DELETE RESTRICT` em dados de auditoria (nunca CASCADE) |
| UUIDs como PK | Todas as tabelas |
| Timestamps com timezone | `TIMESTAMPTZ` em todas as tabelas |
| Row Level Security | Supabase RLS como camada adicional; validação principal no back-end |

---

## 8. Design da API REST

### 8.1 Convenções Gerais

| Convenção | Valor |
|-----------|-------|
| Prefixo base | `/api` |
| Formato de parâmetros | `snake_case` |
| PKs | UUID v4 |
| Timestamps | ISO 8601 |
| Paginação | `page` (1-based) + `limit` (default: 20) |
| Erros | `{ "detail": "mensagem" }` (padrão FastAPI) |
| Autenticação | `Authorization: Bearer <token>` |

### 8.2 Status HTTP Utilizados

| Código | Uso |
|--------|-----|
| `200` | Sucesso |
| `201` | Criado |
| `400` | Dados inválidos |
| `401` | Não autenticado |
| `403` | Sem permissão |
| `404` | Não encontrado |
| `422` | Validação (ex: transição de status inválida) |
| `500` | Erro interno |

### 8.3 Endpoints de Autenticação (`/api/auth`)

| Método | Endpoint | Perfil |
|--------|----------|--------|
| POST | `/api/auth/login` | Público |
| POST | `/api/auth/refresh` | Público |
| POST | `/api/auth/logout` | Qualquer |
| GET | `/api/auth/me` | Qualquer |
| POST | `/api/auth/change-password` | Qualquer |

### 8.4 Endpoints de Usuários (`/api/users`)

| Método | Endpoint | Perfil |
|--------|----------|--------|
| GET | `/api/users` | admin |
| POST | `/api/users` | admin |
| PUT | `/api/users/:id` | admin |
| PUT | `/api/users/:id/role` | admin |
| PUT | `/api/users/me/notification-preferences` | Qualquer |

### 8.5 Endpoints de Secretarias (`/api/secretarias`)

| Método | Endpoint | Perfil |
|--------|----------|--------|
| GET | `/api/secretarias` | Qualquer |
| POST | `/api/secretarias` | admin |
| PUT | `/api/secretarias/:id` | admin |
| PATCH | `/api/secretarias/:id/status` | admin |

### 8.6 Endpoints de Ordens (`/api/ordens`)

| Método | Endpoint | Perfil |
|--------|----------|--------|
| GET | `/api/ordens` | Vários (filtrado por perfil) |
| POST | `/api/ordens` | secretaria |
| GET | `/api/ordens/:id` | Vários |
| PUT | `/api/ordens/:id` | secretaria (somente DEVOLVIDA) |
| PATCH | `/api/ordens/:id/acao` | Varia por ação |
| GET | `/api/ordens/:id/historico` | Vários |

**Query params de `/api/ordens`:**
```
secretaria_id, status, protocolo, page, limit, data_inicio, data_fim
```

**Payloads de `/api/ordens/:id/acao`:**

```json
// Gabinete — autorizar
{ "acao": "autorizar", "observacao": "string (opcional)" }

// Gabinete — solicitar alteração
{ "acao": "solicitar_alteracao", "observacao": "string (min 20 chars, OBRIGATÓRIO)" }

// Gabinete — cancelar
{ "acao": "cancelar", "observacao": "string (OBRIGATÓRIO)" }

// Secretaria — reenviar
{ "acao": "reenviar", "observacao": "string (opcional)" }

// Controladoria — aprovar
{ "acao": "aprovar", "observacao": "string (opcional)" }

// Controladoria — irregularidade
{ "acao": "irregularidade", "observacao": "string (min 50 chars, OBRIGATÓRIO)" }

// Contabilidade — empenhar
{ "acao": "empenhar", "numero_empenho": "string", "valor_empenhado": 0.00 }

// Secretaria — atestar
{ "acao": "atestar", "numero_nf": "string" }

// Secretaria — recusar atesto
{ "acao": "recusar_atesto", "motivo": "string (min 30 chars)" }

// Contabilidade — liquidar
{ "acao": "liquidar", "valor_liquidado": 0.00, "data_liquidacao": "YYYY-MM-DD", "observacao": "string (opcional)" }

// Tesouraria — pagar
{ "acao": "pagar", "valor_pago": 0.00, "data_pagamento": "YYYY-MM-DD", "forma_pagamento": "transferencia|cheque|pix" }
```

### 8.7 Endpoints de Dashboard (`/api/dashboard`)

| Método | Endpoint | Perfil |
|--------|----------|--------|
| GET | `/api/dashboard/summary` | gabinete, admin |
| GET | `/api/dashboard/alertas` | gabinete, admin |

> KPIs calculados com queries `GROUP BY` no banco. Nunca calcular no front-end.

### 8.8 Endpoints de Auditoria

| Método | Endpoint | Perfil |
|--------|----------|--------|
| GET | `/api/audit-logs` | admin |

---

## 9. Arquitetura de Autenticação e Segurança

### 9.1 Configuração JWT

```
access_token:   8 horas (jornada de trabalho)
refresh_token:  24 horas
Algoritmo:      HS256
Payload:        { sub: user_id, role: role_enum, secretaria_id: uuid, exp: timestamp }
Hash de senha:  bcrypt
```

### 9.2 Rate Limiting de Login (US-001)

```
Máximo de tentativas:   5
Período de bloqueio:    15 minutos
Registro:               Toda tentativa vai para audit_logs (LOGIN, LOGIN_FAILED)
Primeiro acesso:        Exige redefinição de senha (first_login = TRUE)
```

### 9.3 Camadas de Segurança

```
1. HTTPS (obrigatório em produção via Supabase/infraestrutura)
2. JWT — validado em cada requisição no back-end
3. RBAC — perfil validado em cada endpoint
4. RLS Supabase — segunda camada no banco de dados
5. Validação de input — Pydantic no back-end + validadores no front-end
6. Senhas — bcrypt (fator de custo adequado)
7. Rate limiting — bloqueio de conta por tentativas de login
```

### 9.4 Fluxo de Interceptor Axios

```typescript
// services/api.ts
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Tenta renovar token
      const refreshed = await tryRefreshToken()
      if (refreshed) return api.request(error.config)
      // Refresh falhou → logout forçado
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)
```

---

## 10. Arquitetura do Front-End

### 10.1 Gerenciamento de Estado

```
authStore (Zustand)
├── token: string | null
├── refreshToken: string | null
├── user: UserProfile | null
├── login(credentials) → void
├── logout() → void
└── setUser(user) → void

uiStore (Zustand)
├── toasts: Toast[]
├── addToast(toast) → void
├── removeToast(id) → void
├── activeModal: string | null
├── openModal(name) → void
└── closeModal() → void
```

### 10.2 Roteamento e Proteção

```tsx
// routes/AppRouter.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/acesso-negado" element={<AcessoNegadoPage />} />

  {/* Rotas protegidas */}
  <Route element={<RoleGuard roles={['secretaria', 'admin']} />}>
    <Route path="/nova-ordem" element={<NovaOrdemPage />} />
    <Route path="/minhas-ordens" element={<MinhasOrdensPage />} />
  </Route>

  <Route element={<RoleGuard roles={['gabinete', 'admin']} />}>
    <Route path="/gabinete" element={<GabinetePage />} />
    <Route path="/dashboard" element={<DashboardPage />} />
  </Route>
  {/* ... demais rotas */}
</Routes>
```

### 10.3 Padrões Obrigatórios de UX

| Padrão | Implementação |
|--------|--------------|
| **Skeleton loaders** | Durante carregamento — nunca tela em branco |
| **Toast notifications** | Feedback de ações (sucesso/erro) via uiStore |
| **Modal de confirmação** | Antes de qualquer ação destrutiva ou transição de status |
| **Debounce de 300ms** | Em buscas e filtros (US-004) |
| **Paginação padrão** | 20 itens por página |
| **StepperForm** | Criação de ordem em 3 etapas com validação por etapa (US-003) |
| **StatusBadge** | Cores padronizadas conforme seção 5.5 |
| **Ações ocultas** | Botões invisíveis (não desabilitados) para perfis sem permissão |

### 10.4 Formulário de Nova Ordem (US-003)

```
Etapa 1: Dados Básicos
  ├── Tipo de Ordem (COMPRA / SERVIÇO / OBRA) — obrigatório
  ├── Prioridade (NORMAL / ALTA / URGENTE) — obrigatório
  └── Responsável — opcional

Etapa 2: Detalhes Financeiros
  ├── Valor Estimado (> 0) — obrigatório
  ├── Descrição — opcional
  └── Justificativa (mín 50 caracteres) — obrigatório

Etapa 3: Revisão e Confirmação
  └── Preview completo + botão de submissão
```

---

## 11. Convenções de Código

### 11.1 Back-End (Python / FastAPI)

```python
# Nomes de variáveis e funções: snake_case
def get_ordem_by_id(ordem_id: UUID, db: Session) -> Ordem: ...

# Nomes de classes: PascalCase
class OrdemService: ...
class OrdemCreate(BaseModel): ...

# Arquivos: snake_case
# ordem_service.py, auth_router.py, database.py

# Constantes: UPPER_SNAKE_CASE
MAX_LOGIN_ATTEMPTS = 5
TOKEN_EXPIRE_HOURS = 8

# Router com prefixo /api
router = APIRouter(prefix="/api/ordens", tags=["ordens"])

# Dependency Injection para autenticação
@router.get("/")
def list_ordens(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
): ...

# Comentários referenciando US + Regra de Negócio
# US-001 RN-1: máx 5 tentativas de login antes do bloqueio

# Erros com HTTP corretos
raise HTTPException(status_code=403, detail="Acesso negado")
raise HTTPException(status_code=422, detail="Número de empenho já existente")

# Nunca hardcode secrets
DATABASE_URL = os.getenv("DATABASE_URL")
```

### 11.2 Front-End (React / TypeScript)

```typescript
// Componentes: PascalCase
const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ orderId }) => { ... }

// Hooks: camelCase com prefixo "use"
const useOrdens = (filters: OrdensFilters) => { ... }

// Arquivos de componentes: PascalCase.tsx
// OrderDetailModal.tsx, StatusBadge.tsx, RoleGuard.tsx

// Serviços, hooks, stores, utils: camelCase.ts
// ordensService.ts, useAuth.ts, authStore.ts, formatters.ts

// Interfaces: PascalCase com sufixo descritivo
interface OrdemResponse { ... }
interface CreateOrdemPayload { ... }
type StatusOrdem = 'AGUARDANDO_GABINETE' | 'PAGA' | ...

// Constantes: UPPER_SNAKE_CASE
const MAX_JUSTIFICATIVA_MIN_LENGTH = 50
const DEBOUNCE_DELAY_MS = 300

// Stores: camelCase com sufixo "Store"
const useAuthStore = create<AuthState>(...)

// Serviços: verbo + recurso
export const fetchOrdens = async (filters: OrdensFilters) => { ... }
export const createOrdem = async (payload: CreateOrdemPayload) => { ... }
export const executeAcao = async (id: string, payload: AcaoPayload) => { ... }

// Tipagem estrita — strict: true no tsconfig. NUNCA use `any`
```

### 11.3 Strings e Mensagens

> **Código em inglês. Mensagens ao usuário em português brasileiro (pt-BR).**

```typescript
// ✅ Correto
const errorMessage = "Número de empenho já cadastrado no sistema"
const successMessage = "Ordem enviada com sucesso"

// ❌ Incorreto
const errorMessage = "Empenho number already exists"
```

---

## 12. Decisões Arquiteturais (ADRs)

### ADR-001 — FastAPI + SQLAlchemy sobre Django ORM
**Decisão:** FastAPI com SQLAlchemy e Alembic.
**Motivo:** Performance assíncrona nativa, validação automática com Pydantic, swagger UI embutida e suporte superior a async I/O para notificações e background tasks.

### ADR-002 — Supabase como PostgreSQL Gerenciado
**Decisão:** Supabase como provider de banco.
**Motivo:** PostgreSQL gerenciado com RLS nativo, dashboard visual, backups automáticos e custo operacional reduzido para equipes municipais.

### ADR-003 — Máquina de Estados no Back-End (não no front-end)
**Decisão:** Todas as transições de status são validadas no `ordem_service.py`.
**Motivo:** Front-end pode ser manipulado. A máquina de estados no back-end é a única fonte de verdade — impede transições inválidas mesmo que o cliente seja modificado.

### ADR-004 — Append-Only em `ordem_historico`
**Decisão:** Nenhum registro de `ordem_historico` pode ser alterado ou deletado.
**Motivo:** Auditoria pública exige imutabilidade. Toda transição gera um novo registro — histórico completo para prestação de contas.

### ADR-005 — Notificações Assíncronas via Background Tasks
**Decisão:** Envio de e-mails via FastAPI `BackgroundTasks`.
**Motivo:** Falha no SMTP não pode bloquear a transição de status de uma ordem. O pipeline financeiro deve seguir mesmo se o servidor de e-mail estiver fora.

### ADR-006 — Dashboard Calculado no Servidor
**Decisão:** KPIs calculados com `GROUP BY` no banco, endpoint `/api/dashboard/summary` retorna dados prontos.
**Motivo:** Dados financeiros sensíveis não devem ser processados no front-end. Queries agregadas são mais eficientes e seguras.

### ADR-007 — Zustand para Estado Global (não Redux)
**Decisão:** Zustand como gerenciador de estado.
**Motivo:** API mais simples que Redux sem boilerplate excessivo, integração nativa com TypeScript e suficiente para os dois stores necessários (auth + ui).

---

## 13. Roadmap por Sprint

| Sprint | Semanas | Foco | User Stories |
|--------|---------|------|-------------|
| **S1** | 1-2 | Autenticação e RBAC | US-001, US-002 |
| **S2** | 3-4 | Criação e Acompanhamento de Ordens | US-003, US-004 |
| **S3** | 5-6 | Workflow de Aprovação | US-005, US-006, US-007 |
| **S4** | 7-8 | Pipeline Financeiro | US-008, US-009, US-010 |
| **S5** | 9-10 | Dashboard e Auditoria | US-011, US-012 |
| **S6** | 11-12 | Administração e Notificações | US-013, US-014 |

### Checklist de Qualidade por US

Antes de considerar uma US completa:

- [ ] Critérios de aceitação Gherkin cobertos
- [ ] Regras de negócio implementadas no back-end (não só no front)
- [ ] Validação de role no endpoint
- [ ] Transição de status validada pelo workflow engine
- [ ] Registro em `ordem_historico` após transição
- [ ] Tratamento de erros com mensagens em pt-BR
- [ ] Loading states e empty states no front
- [ ] Modal de confirmação antes de ações críticas
- [ ] Responsividade básica
- [ ] Testes para regras de negócio críticas

---

*Documento gerado por Aria (Architect Agent) — Synkra AIOS*
*Forseti Automações — Sistema Municipal de OS e Compras Públicas*
