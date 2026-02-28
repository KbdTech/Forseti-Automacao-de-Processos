# Forseti — Sistema de Gestão de Ordens de Serviço e Compras Públicas

> Sistema web para gestão digitalizada de Ordens de Serviço (OS) e Compras Públicas de uma Prefeitura Municipal. Substitui processos informais (e-mail, papel, planilhas) por um fluxo digital rastreável com controle de acesso por perfil (RBAC), pipeline financeiro integrado e auditoria completa.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Stack Tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Banco de Dados](#banco-de-dados)
- [Segurança](#segurança)
- [Máquina de Estados das Ordens](#máquina-de-estados-das-ordens)
- [Perfis e Permissões (RBAC)](#perfis-e-permissões-rbac)
- [Instalação e Execução](#instalação-e-execução)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Testes](#testes)
- [API Reference](#api-reference)

---

## Visão Geral

O **Forseti** formaliza e rastreia todas as demandas de compras, serviços e obras das secretarias municipais. Nenhuma despesa pública avança sem as aprovações obrigatórias — do Gabinete do Prefeito à Controladoria — e todo o ciclo financeiro é registrado: da criação ao pagamento.

**Ciclo completo:**
```
Criação → Aprovação (Gabinete) → Conformidade (Controladoria)
  → Empenho → Execução → Atesto (NF) → Liquidação → Pagamento
```

---

## Funcionalidades

| Módulo | Descrição |
|--------|-----------|
| **Autenticação** | Login institucional com JWT, bloqueio por tentativas, primeiro acesso com troca obrigatória de senha |
| **RBAC** | 6 perfis de acesso com permissões granulares por tela e ação |
| **Ordens de Serviço** | Criação com StepperForm, protocolo automático `OS-ANO-SEQUENCIAL`, acompanhamento com filtros e paginação |
| **Workflow de Aprovação** | Gabinete (autorizar/devolver/cancelar) → Controladoria (aprovar/irregularidade/solicitar docs) |
| **Pipeline Financeiro** | Empenho → Atesto de NF → Liquidação → Pagamento |
| **Documentos** | Upload e visualização de documentos anexados às ordens (Supabase Storage) |
| **Assinatura GovBR** | Assinatura digital de ordens via plataforma GovBR |
| **Dashboard Executivo** | KPIs, FunnelChart, BarChart, alertas automáticos de gargalos |
| **Auditoria** | Log append-only com timeline completa de tramitação por ordem |
| **Administração** | Gestão de usuários, secretarias e configuração de notificações por e-mail |

---

## Stack Tecnológica

### Back-End

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| Python | 3.11 | Linguagem principal |
| FastAPI | 0.100+ | Framework web / API REST |
| SQLAlchemy | 2.0+ | ORM assíncrono |
| Alembic | 1.12+ | Migrations de banco |
| Pydantic | 2.0+ | Validação e schemas |
| PostgreSQL | — | Banco de dados via Supabase |
| asyncpg | 0.29+ | Driver assíncrono PostgreSQL |
| bcrypt | 4.0+ | Hash de senhas |
| python-jose | 3.3+ | Geração e validação de tokens JWT |

### Front-End

| Tecnologia | Versão | Uso |
|-----------|--------|-----|
| React | 18 | Framework de UI |
| TypeScript | 5 | Tipagem estática (strict mode) |
| Vite | 5 | Bundler e dev server |
| Tailwind CSS | 4 | Estilização utility-first |
| shadcn/ui | — | Componentes acessíveis (Radix UI) |
| Recharts | 2.13 | Gráficos (Funnel, Bar, StackedBar) |
| React Router | 6 | Roteamento client-side |
| Zustand | 5 | Gerenciamento de estado global |
| React Hook Form + Zod | — | Formulários com validação |
| Axios | 1.7 | HTTP client com interceptors JWT |

---

## Arquitetura

O sistema segue uma arquitetura em **3 camadas** com separação clara de responsabilidades:

```
┌─────────────────────────────────────────────────┐
│                  FRONT-END (React)               │
│   Pages → Components → Services (Axios) → Store  │
└──────────────────────┬──────────────────────────┘
                       │ REST / JSON (JWT)
┌──────────────────────▼──────────────────────────┐
│                BACK-END (FastAPI)                 │
│   Routers → Services → Models (SQLAlchemy)        │
│   ┌─────────────────────────────────────────┐    │
│   │         Workflow Engine                  │    │
│   │  Máquina de estados das ordens           │    │
│   │  Valida transições e registra histórico  │    │
│   └─────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────┘
                       │ asyncpg / psycopg2
┌──────────────────────▼──────────────────────────┐
│             BANCO DE DADOS (Supabase)             │
│   PostgreSQL + RLS + Storage                      │
└─────────────────────────────────────────────────┘
```

### Padrões adotados

- **Dependency Injection** via `Depends()` para autenticação, roles e sessão de banco
- **Workflow Engine** centralizado — toda transição de status passa por validação explícita
- **Log append-only** — `ordem_historico` nunca sofre UPDATE ou DELETE
- **Notificações assíncronas** — disparadas em background tasks, falha não bloqueia o fluxo
- **Endpoints agregados** para dashboard — queries com GROUP BY no banco, sem cálculo no front-end

---

## Estrutura do Projeto

```
Forseti-Automacoes/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py              # get_current_user, require_role
│   │   │   └── routes/
│   │   │       ├── auth.py          # /api/auth/*
│   │   │       ├── users.py         # /api/users/*
│   │   │       ├── secretarias.py   # /api/secretarias/*
│   │   │       ├── ordens.py        # /api/ordens/*
│   │   │       ├── documentos.py    # /api/documentos/*
│   │   │       ├── dashboard.py     # /api/dashboard/*
│   │   │       ├── audit.py         # /api/audit-logs
│   │   │       └── notifications.py # /api/notifications/*
│   │   ├── core/
│   │   │   └── config.py            # Configurações via .env
│   │   ├── models/                  # Modelos SQLAlchemy
│   │   │   ├── enums.py             # Todos os ENUMs do sistema
│   │   │   ├── user.py
│   │   │   ├── ordem.py
│   │   │   ├── ordem_historico.py
│   │   │   ├── secretaria.py
│   │   │   ├── documento.py
│   │   │   ├── audit.py
│   │   │   └── notification.py
│   │   ├── schemas/                 # Schemas Pydantic (request/response)
│   │   └── services/                # Lógica de negócio
│   │       ├── workflow_engine.py   # Máquina de estados das ordens
│   │       ├── ordem_service.py
│   │       ├── auth_service.py
│   │       ├── user_service.py
│   │       ├── documento_service.py
│   │       ├── dashboard_service.py
│   │       └── notification_service.py
│   ├── alembic/versions/            # 8 migrations
│   ├── tests/                       # 91 testes (pytest)
│   ├── scripts/seed.py              # Dados iniciais de desenvolvimento
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── auth/                # Login, PrimeiroAcesso, AcessoNegado
        │   ├── secretaria/          # NovaOrdem, MinhasOrdens, Devolvidas, Atesto, EditarOrdem
        │   ├── gabinete/            # AnaliseGabinete
        │   ├── controladoria/       # AnaliseControladoria
        │   ├── contabilidade/       # Empenho, Liquidacao
        │   ├── tesouraria/          # Pagamento, OrdensPagas
        │   ├── dashboard/           # Dashboard executivo
        │   ├── admin/               # Users, Secretarias, Audit
        │   └── settings/            # NotificationPreferences
        ├── components/
        │   ├── workflow/            # WorkflowTable, ActionPanel, StatusBadge
        │   ├── orders/              # Modais: Empenho, Atesto, Liquidacao, Pagamento, Recusa
        │   ├── ordens/              # DocumentUploader, DocumentList, GovBRBanner
        │   ├── layout/              # AppLayout, Sidebar, Header, RoleGuard
        │   └── ui/                  # Componentes shadcn/ui
        ├── services/                # Camada de acesso à API (Axios)
        ├── stores/                  # Zustand (authStore)
        ├── types/                   # Interfaces TypeScript
        ├── hooks/                   # useAuth e outros custom hooks
        ├── utils/                   # formatters, validators, constants
        └── routes/                  # AppRouter com RoleGuard
```

---

## Banco de Dados

O banco utiliza **PostgreSQL via Supabase** com Row Level Security (RLS) habilitado em todas as tabelas.

### Tabelas principais

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários com perfil, secretaria vinculada e controle de bloqueio |
| `secretarias` | Secretarias municipais com orçamento anual |
| `ordens` | Ordens de serviço com todos os campos do ciclo financeiro |
| `ordem_historico` | Log append-only de todas as transições de status |
| `audit_logs` | Registro de login/logout e ações globais |
| `role_change_log` | Histórico de alterações de perfil |
| `documentos` | Metadados de arquivos anexados às ordens |
| `notification_log` | Registro de e-mails enviados |
| `user_notification_prefs` | Preferências de notificação por usuário |

### ENUMs no banco

```sql
-- Perfis de usuário
role_enum: secretaria | gabinete | controladoria | contabilidade | tesouraria | admin

-- Status das ordens
status_ordem: AGUARDANDO_GABINETE | AGUARDANDO_CONTROLADORIA | AGUARDANDO_EMPENHO
            | AGUARDANDO_EXECUCAO | AGUARDANDO_ATESTO | AGUARDANDO_LIQUIDACAO
            | AGUARDANDO_PAGAMENTO | DEVOLVIDA_PARA_ALTERACAO | AGUARDANDO_DOCUMENTACAO
            | COM_IRREGULARIDADE | EXECUCAO_COM_PENDENCIA | CANCELADA | PAGA

-- Tipo da ordem
tipo_ordem_enum: COMPRA | SERVICO | OBRA

-- Prioridade
prioridade_enum: NORMAL | ALTA | URGENTE

-- Forma de pagamento
forma_pagamento_enum: transferencia | cheque | pix
```

### Migrations (Alembic)

| Migration | Conteúdo |
|-----------|----------|
| `001` | Tabelas de autenticação e RBAC (`users`, `audit_logs`, `role_change_log`) |
| `a7d2f` | Tabelas de ordens (`secretarias`, `ordens`, `ordem_historico`) |
| `003` | Notificações (`notification_log`, `user_notification_prefs`) |
| `004` | Documentos (`documentos`) |
| `005` | Habilitar RLS em todas as tabelas |
| `006` | RLS na tabela `alembic_version` |
| `007` | Políticas DENY ALL (silencia alertas INFO do Supabase) |
| `008` | Campo `assinatura_govbr` nas ordens |

---

## Segurança

### Autenticação JWT

- **Access token:** expiração de 8 horas (jornada de trabalho)
- **Refresh token:** expiração de 24 horas
- **Header obrigatório:** `Authorization: Bearer <token>` em todas as rotas protegidas
- **Algoritmo:** HS256

### Proteção de senhas

- Hash com **bcrypt** — nenhuma senha é armazenada em texto plano
- Primeiro acesso exige **redefinição obrigatória** de senha
- Senha mínima: 8 caracteres com letras e números

### Rate Limiting e Bloqueio

- Máximo de **5 tentativas de login** incorretas
- Conta bloqueada por **15 minutos** após limite atingido
- Todas as tentativas registradas em `audit_logs`

### RBAC (Role-Based Access Control)

- Perfil validado no **back-end em cada requisição** — nunca apenas no front-end
- Rota não autorizada retorna **HTTP 403**
- Botões de ação ficam **ocultos** (não apenas desabilitados) para perfis sem permissão
- Secretaria vê apenas ordens da **própria secretaria** — filtro aplicado no back-end

### Row Level Security (Supabase)

- RLS habilitado em **todas as tabelas**
- Políticas DENY ALL configuradas para bloquear acesso direto ao banco
- Validação principal realizada pela camada de API FastAPI

---

## Máquina de Estados das Ordens

```
CRIAÇÃO
  └─► AGUARDANDO_GABINETE
        ├─► AGUARDANDO_CONTROLADORIA  (autorizar)
        ├─► DEVOLVIDA_PARA_ALTERACAO  (solicitar_alteracao)
        │     └─► AGUARDANDO_GABINETE  (reenviar)
        └─► CANCELADA  [TERMINAL]

AGUARDANDO_CONTROLADORIA
  ├─► AGUARDANDO_EMPENHO       (aprovar)
  ├─► COM_IRREGULARIDADE       (irregularidade) [suspensa]
  └─► AGUARDANDO_DOCUMENTACAO  (solicitar_documentacao)
        └─► AGUARDANDO_CONTROLADORIA  (após envio de docs)

AGUARDANDO_EMPENHO
  └─► AGUARDANDO_ATESTO  (empenhar)

AGUARDANDO_ATESTO
  ├─► AGUARDANDO_LIQUIDACAO    (atestar)
  └─► EXECUCAO_COM_PENDENCIA   (recusar_atesto)

AGUARDANDO_LIQUIDACAO
  └─► AGUARDANDO_PAGAMENTO  (liquidar)

AGUARDANDO_PAGAMENTO
  └─► PAGA  [TERMINAL]
```

### Cores de status no front-end

| Status | Cor | Significado |
|--------|-----|-------------|
| `AGUARDANDO_*` | Azul | Pendente de ação |
| `DEVOLVIDA_PARA_ALTERACAO` | Amarelo | Requer atenção |
| `COM_IRREGULARIDADE` | Vermelho | Problema fiscal |
| `EXECUCAO_COM_PENDENCIA` | Vermelho | Não conformidade |
| `CANCELADA` | Cinza/Vermelho | Terminal negativo |
| `PAGA` | Verde | Concluído |

---

## Perfis e Permissões (RBAC)

| Perfil | Responsabilidade |
|--------|-----------------|
| `secretaria` | Cria e acompanha ordens, atesta notas fiscais |
| `gabinete` | Autoriza, devolve ou cancela ordens |
| `controladoria` | Analisa conformidade legal e fiscal |
| `contabilidade` | Registra empenhos e liquidações |
| `tesouraria` | Efetua e confirma pagamentos |
| `admin` | Gestão total da plataforma (somente-leitura nas áreas operacionais) |

---

## Instalação e Execução

### Pré-requisitos

- Python 3.11+
- Node.js 20+
- Conta no [Supabase](https://supabase.com) com projeto PostgreSQL criado

### 1. Clone o repositório

```bash
git clone https://github.com/KbdTech/Forseti-Automacao-de-Processos.git
cd Forseti-Automacao-de-Processos
```

### 2. Back-End

```bash
cd backend

# Criar e ativar ambiente virtual
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais do Supabase

# Aplicar migrations
alembic upgrade head

# (Opcional) Popular banco com dados de desenvolvimento
python scripts/seed.py

# Iniciar servidor
uvicorn app.main:app --reload --port 8000
```

A API estará disponível em `http://localhost:8000`.
Documentação Swagger: `http://localhost:8000/docs`

### 3. Front-End

```bash
cd frontend

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Edite VITE_API_BASE_URL=http://localhost:8000

# Iniciar servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:5173`.

### 4. Credenciais de desenvolvimento (após seed)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin | `admin@prefeitura.gov.br` | `Admin123` |
| Secretaria EDU | `sec.edu@prefeitura.gov.br` | `Senha123!` |
| Secretaria SAÚ | `sec.sau@prefeitura.gov.br` | `Senha123!` |
| Gabinete | `gabinete@prefeitura.gov.br` | `Senha123!` |
| Controladoria | `controladoria@prefeitura.gov.br` | `Senha123!` |
| Contabilidade | `contabilidade@prefeitura.gov.br` | `Senha123!` |
| Tesouraria | `tesouraria@prefeitura.gov.br` | `Senha123!` |

> Todos os usuários (exceto admin) têm `first_login: true` — será solicitada troca de senha no primeiro acesso.

---

## Variáveis de Ambiente

### `backend/.env`

```env
DATABASE_URL=postgresql+asyncpg://user:password@host:port/database
SECRET_KEY=your-jwt-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_HOURS=8
REFRESH_TOKEN_EXPIRE_HOURS=24
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# Supabase Storage (para documentos)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# E-mail (notificações)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@prefeitura.gov.br
SMTP_PASSWORD=your-smtp-password
```

### `frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME="Sistema OS Prefeitura"
```

---

## Testes

### Back-End (pytest)

```bash
cd backend
source .venv/bin/activate

# Rodar todos os testes (91 testes)
pytest

# Com verbose
pytest -v

# Módulo específico
pytest tests/test_workflow_engine.py

# Com cobertura
pytest --cov=app
```

| Arquivo de teste | Testes | Cobertura |
|-----------------|--------|-----------|
| `test_auth.py` | 19 | Autenticação, JWT, bloqueio de conta |
| `test_workflow_engine.py` | 16 | Máquina de estados, transições válidas e inválidas |
| `test_controladoria.py` | 16 | Conformidade fiscal, irregularidades, documentação |
| `test_documentos.py` | 21 | Upload, listagem e exclusão de documentos |
| `test_deps.py` | 9 | Dependências de autenticação e RBAC |
| `test_users.py` | 7 | CRUD de usuários e troca de perfil |

### Front-End (Vitest)

```bash
cd frontend

npm test          # Rodar testes
npm run coverage  # Com cobertura
npm run lint      # Verificar lint
```

---

## API Reference

Documentação interativa disponível em `http://localhost:8000/docs` (Swagger UI).

### Principais endpoints

| Método | Endpoint | Descrição | Perfil |
|--------|----------|-----------|--------|
| `POST` | `/api/auth/login` | Login com e-mail e senha | Público |
| `GET` | `/api/auth/me` | Dados do usuário autenticado | Qualquer |
| `POST` | `/api/auth/change-password` | Troca de senha | Qualquer |
| `GET` | `/api/ordens` | Listar ordens com filtros | Vários |
| `POST` | `/api/ordens` | Criar nova ordem | secretaria |
| `GET` | `/api/ordens/:id` | Detalhe completo da ordem | Vários |
| `PATCH` | `/api/ordens/:id/acao` | Executar ação do workflow | Varia por ação |
| `GET` | `/api/ordens/:id/historico` | Histórico de tramitação | Vários |
| `GET` | `/api/dashboard/summary` | KPIs e dados dos gráficos | gabinete, admin |
| `GET` | `/api/dashboard/alertas` | Gargalos automáticos | gabinete, admin |
| `GET` | `/api/audit-logs` | Log global de ações | admin |
| `GET` | `/api/users` | Listar usuários | admin |
| `POST` | `/api/users` | Criar usuário | admin |
| `GET` | `/api/secretarias` | Listar secretarias | Qualquer |
| `POST` | `/api/secretarias` | Criar secretaria | admin |

### Formato padrão de erro

```json
{ "detail": "Mensagem de erro em português" }
```

### Códigos HTTP utilizados

| Código | Significado |
|--------|-------------|
| `200` | Sucesso |
| `201` | Recurso criado |
| `400` | Dados inválidos |
| `401` | Não autenticado |
| `403` | Sem permissão (perfil insuficiente) |
| `404` | Recurso não encontrado |
| `422` | Erro de validação (ex: transição de status inválida) |
| `500` | Erro interno do servidor |

---

## Licença

Uso interno — Prefeitura Municipal. Todos os direitos reservados.
