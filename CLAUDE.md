# CLAUDE.md — Sistema de Gestão de OS e Compras Públicas

> Documento de contexto do projeto para o Claude Code. Leia este arquivo antes de qualquer tarefa.
> Versão 1.0 — Fevereiro de 2026 — Uso Interno — Equipe de TI

---

## 1. Contexto do Projeto

### Descrição

Sistema web de gestão de **Ordens de Serviço (OS) e Compras Públicas** para uma **Prefeitura Municipal**. O sistema substitui processos informais (e-mail, papel, planilhas) por um fluxo digital rastreável, com controle de acesso por perfil (RBAC), histórico de auditoria completo e pipeline financeiro integrado (empenho, atesto, liquidação, pagamento).

### Origem

O projeto foi desenvolvido inicialmente como **MVP front-end com dados mockados**. Esta fase corresponde à **integração com back-end real**: banco de dados PostgreSQL (Supabase), API REST com FastAPI, autenticação JWT e persistência completa.

### Propósito

- Formalizar e rastrear todas as demandas de compras, serviços e obras das secretarias municipais
- Garantir que nenhuma despesa pública avance sem as aprovações obrigatórias (Gabinete, Controladoria)
- Registrar o ciclo financeiro completo: criação → aprovação → empenho → execução → atesto → liquidação → pagamento
- Fornecer visibilidade executiva com KPIs e alertas automáticos de gargalos
- Manter log de auditoria append-only e imutável para prestação de contas

### Escopo da Fase Atual

- Integração do front-end React (já existente com mocks) ao back-end FastAPI
- Substituição de dados mockados por chamadas reais à API
- Implementação da autenticação JWT com RBAC
- Persistência no banco PostgreSQL via Supabase
- 14 Histórias de Usuário distribuídas em 6 Sprints de 2 semanas

---

## 2. Stack Tecnológica

### Back-End

| Tecnologia       | Versão    | Uso                                              |
|------------------|-----------|--------------------------------------------------|
| Python           | 3.11      | Linguagem principal do back-end                  |
| FastAPI          | 0.100+    | Framework web / API REST                         |
| SQLAlchemy       | 2.0+      | ORM — mapeamento objeto-relacional               |
| Alembic          | 1.12+     | Migrations de banco de dados                     |
| Pydantic         | 2.0+      | Validação de dados e schemas                     |
| PostgreSQL       | —         | Banco de dados (via Supabase)                    |
| Supabase         | —         | Backend-as-a-Service (PostgreSQL gerenciado)     |
| bcrypt           | —         | Hash de senhas                                   |
| python-jose      | —         | Geração e validação de tokens JWT                |

### Front-End

| Tecnologia       | Versão    | Uso                                              |
|------------------|-----------|--------------------------------------------------|
| Node.js          | 20        | Runtime JavaScript                               |
| React            | 18        | Framework de UI                                  |
| TypeScript       | 5         | Tipagem estática                                 |
| Vite             | 5         | Bundler e dev server                             |
| Tailwind CSS     | 4         | Estilização utility-first                        |
| shadcn/ui        | —         | Componentes de UI acessíveis (Radix UI base)     |
| Recharts         | —         | Gráficos (FunnelChart, BarChart, StackedBar)     |
| React Router     | —         | Roteamento client-side com RoleGuard             |
| Zustand          | —         | Gerenciamento de estado global                   |

---

## 3. Estrutura de Pastas

```
Forseti-Automacoes/
├── CLAUDE.md                        # Este arquivo (contexto do projeto)
│
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py            # Configurações (env vars, JWT secret, DB URL)
│   │   │   └── database.py          # Engine SQLAlchemy, SessionLocal, get_db
│   │   ├── models/                  # Modelos SQLAlchemy (tabelas do banco)
│   │   │   ├── user.py              # Modelo User (users, role_change_log)
│   │   │   ├── secretaria.py        # Modelo Secretaria
│   │   │   ├── ordem.py             # Modelo Ordem (ordens, ordem_historico)
│   │   │   └── audit.py             # Modelos AuditLog, NotificationLog
│   │   ├── schemas/                 # Schemas Pydantic (request/response)
│   │   │   ├── auth.py
│   │   │   ├── user.py
│   │   │   ├── secretaria.py
│   │   │   └── ordem.py
│   │   ├── routers/                 # Routers FastAPI por domínio
│   │   │   ├── auth.py              # /api/auth/*
│   │   │   ├── users.py             # /api/users/*
│   │   │   ├── secretarias.py       # /api/secretarias/*
│   │   │   ├── ordens.py            # /api/ordens/*
│   │   │   ├── dashboard.py         # /api/dashboard/*
│   │   │   └── audit.py             # /api/audit-logs
│   │   ├── services/                # Lógica de negócio desacoplada dos routers
│   │   │   ├── auth_service.py
│   │   │   ├── ordem_service.py     # Máquina de estados das ordens
│   │   │   └── notification_service.py
│   │   ├── dependencies/
│   │   │   ├── auth.py              # get_current_user, require_role
│   │   │   └── permissions.py       # Decorators de RBAC
│   │   └── main.py                  # Ponto de entrada FastAPI, inclusão de routers
│   ├── alembic/
│   │   ├── versions/                # Arquivos de migration gerados
│   │   └── env.py
│   ├── alembic.ini
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   └── ui/                  # Componentes shadcn/ui (Button, Input, etc.)
    │   ├── hooks/                   # Custom hooks (useAuth, useOrdens, etc.)
    │   ├── pages/                   # Páginas da aplicação (uma por rota)
    │   │   ├── LoginPage.tsx
    │   │   ├── DashboardPage.tsx
    │   │   ├── NovaOrdemPage.tsx
    │   │   ├── MinhasOrdensPage.tsx
    │   │   ├── DevolvidasPage.tsx
    │   │   ├── GabinetePage.tsx
    │   │   ├── ControladoriaPage.tsx
    │   │   ├── EmpenhoPage.tsx
    │   │   ├── AtestePage.tsx
    │   │   ├── LiquidacaoPage.tsx
    │   │   ├── PagamentoPage.tsx
    │   │   ├── AuditPage.tsx
    │   │   ├── AdminUsersPage.tsx
    │   │   ├── AdminSecretariasPage.tsx
    │   │   └── AcessoNegadoPage.tsx
    │   ├── routes/
    │   │   ├── AppRouter.tsx         # Definição central de rotas
    │   │   └── RoleGuard.tsx         # HOC de proteção por perfil
    │   ├── services/                 # Camada de acesso à API (axios/fetch)
    │   │   ├── api.ts               # Instância base com interceptors JWT
    │   │   ├── authService.ts
    │   │   ├── ordensService.ts
    │   │   ├── secretariasService.ts
    │   │   ├── dashboardService.ts
    │   │   └── usersService.ts
    │   ├── stores/                   # Zustand stores
    │   │   ├── authStore.ts          # Estado de autenticação e perfil
    │   │   └── uiStore.ts            # Estado de UI global (toasts, modals)
    │   ├── types/                    # Interfaces e types TypeScript
    │   │   ├── auth.types.ts
    │   │   ├── ordem.types.ts
    │   │   ├── secretaria.types.ts
    │   │   └── user.types.ts
    │   └── utils/                    # Funções utilitárias
    │       ├── formatters.ts         # Formatação de moeda, datas, protocolo
    │       ├── validators.ts         # Validações de formulário
    │       └── constants.ts          # Enums, constantes de status
    ├── vite.config.ts
    └── package.json
```

---

## 4. Módulos do Sistema e User Stories

### Módulo 1: Autenticação e Controle de Acesso

| US     | Título                                    | Sprint | Prioridade | Depende de    |
|--------|-------------------------------------------|--------|------------|---------------|
| US-001 | Login com Credenciais Institucionais      | S1     | Alta       | —             |
| US-002 | Controle de Acesso por Perfil (RBAC)      | S1     | Alta       | US-001        |

### Módulo 2: Criação e Acompanhamento de Ordens

| US     | Título                                    | Sprint | Prioridade | Depende de    |
|--------|-------------------------------------------|--------|------------|---------------|
| US-003 | Criação de Nova Ordem de Serviço ou Compra| S2     | Alta       | US-001, US-002|
| US-004 | Acompanhamento de Ordens pela Secretaria  | S2     | Alta       | US-003        |

### Módulo 3: Workflow de Aprovação

| US     | Título                                    | Sprint | Prioridade | Depende de         |
|--------|-------------------------------------------|--------|------------|--------------------|
| US-005 | Análise e Decisão do Gabinete do Prefeito | S3     | Alta       | US-003, US-004     |
| US-006 | Reenvio de Ordem Devolvida pela Secretaria| S3     | Alta       | US-005             |
| US-007 | Análise de Conformidade pela Controladoria| S3     | Alta       | US-005             |

### Módulo 4: Pipeline Operacional (Financeiro)

| US     | Título                                          | Sprint | Prioridade | Depende de |
|--------|-------------------------------------------------|--------|------------|------------|
| US-008 | Registro de Empenho pela Contabilidade          | S4     | Alta       | US-007     |
| US-009 | Atesto de Nota Fiscal pela Secretaria           | S4     | Alta       | US-008     |
| US-010 | Liquidação e Pagamento (Contabilidade/Tesouraria)| S4    | Alta       | US-009     |

### Módulo 5: Dashboard Executivo

| US     | Título                                    | Sprint | Prioridade | Depende de                    |
|--------|-------------------------------------------|--------|------------|-------------------------------|
| US-011 | Dashboard Executivo com KPIs e Gráficos   | S5     | Alta       | US-003, US-005, US-007, US-010|
| US-012 | Log de Auditoria e Histórico de Tramitação| S5     | Alta       | US-001, US-003                |

### Módulo 6 e 7: Administração e Notificações

| US     | Título                                    | Sprint | Prioridade | Depende de            |
|--------|-------------------------------------------|--------|------------|-----------------------|
| US-013 | Gestão de Secretarias pelo Administrador  | S6     | Média      | US-001, US-002        |
| US-014 | Notificações por E-mail em Mudança de Etapa| S6   | Média      | US-005, US-007, US-009|

---

## 5. Regras de Negócio

### Autenticação (US-001)

1. Máximo de **5 tentativas de login** antes do bloqueio temporário por **15 minutos**
2. Tokens JWT com expiração de **8 horas** (jornada de trabalho)
3. Refresh token com validade de **24 horas**
4. Senha deve ter no mínimo **8 caracteres**, com letras e números
5. **Primeiro acesso** exige redefinição obrigatória de senha
6. Todas as tentativas de login devem ser registradas em **log de auditoria**

### RBAC — Perfis e Acesso (US-002)

7. Perfis disponíveis: `secretaria`, `gabinete`, `controladoria`, `contabilidade`, `tesouraria`, `admin`
8. Um usuário pode ter **somente um perfil ativo** por vez
9. Administrador visualiza todas as telas com **somente-leitura** às áreas operacionais
10. Alterações de perfil devem ser registradas em log de auditoria
11. Token JWT deve conter o campo `role` para validação no front-end
12. Back-end valida o perfil em **cada requisição** — nunca confiar apenas no front-end

### Criação de Ordens (US-003)

13. Número de protocolo gerado automaticamente no padrão **OS-ANO-SEQUENCIAL** (ex.: `OS-2026-00001`)
14. Data e hora de criação registradas **automaticamente**
15. A secretaria de origem é vinculada **automaticamente** ao usuário criador
16. Tipo de ordem: **Compra**, **Serviço** ou **Obra** (campo obrigatório)
17. Prioridade: **Normal**, **Alta**, **Urgente** (campo obrigatório)
18. Valor estimado é obrigatório e deve ser um **número positivo**
19. Justificativa mínima de **50 caracteres**
20. Ao criar, o status deve ser `AGUARDANDO_GABINETE` automaticamente

### Acompanhamento de Ordens (US-004)

21. Usuário da secretaria vê **apenas ordens da própria secretaria**
22. Histórico de tramitação deve estar disponível em **ordem cronológica**
23. Status exibido reflete sempre a etapa atual do fluxo
24. Paginação com **20 registros por página** padrão
25. Busca por protocolo deve ser **exata** (não parcial) para evitar exposição indevida

### Workflow do Gabinete (US-005)

26. Somente ordens com status `AGUARDANDO_GABINETE` podem receber ações desta tela
27. Ao solicitar alterações, o campo `observacao` é obrigatório (mínimo **20 caracteres**)
28. Ao cancelar, o campo `motivo do cancelamento` é obrigatório
29. Ação de cancelamento é **irreversível** — somente o Administrador pode reverter
30. Todo histórico de ação deve registrar: usuário, perfil, data/hora e observação
31. O Gabinete pode visualizar qualquer ordem do sistema em modo somente-leitura

### Reenvio de Ordem Devolvida (US-006)

32. Somente ordens com status `DEVOLVIDA_PARA_ALTERACAO` podem ser editadas
33. Todos os campos do formulário original ficam editáveis, **exceto secretaria e protocolo**
34. O protocolo original é mantido — **não é gerado novo número**
35. Reenvio deve incrementar um **contador de versão** da ordem
36. Histórico deve mostrar todas as versões e devoluções da ordem

### Análise da Controladoria (US-007)

37. Somente ordens com status `AGUARDANDO_CONTROLADORIA` ou `AGUARDANDO_DOCUMENTACAO` recebem ações desta tela
38. Parecer de irregularidade exige descrição obrigatória com mínimo **50 caracteres**
39. Ordens com irregularidade ficam **suspensas** até resolução manual pelo Administrador ou nova aprovação
40. A Controladoria pode visualizar documentos anexados à ordem
41. Todo parecer é registrado com **nome completo do fiscal responsável**

### Empenho (US-008)

42. Número do empenho é obrigatório e deve ser **único** no sistema
43. Data do empenho é registrada **automaticamente** (data do sistema)
44. Após o empenho, a ordem **não pode ser cancelada** sem processo especial de desempenho
45. O valor empenhado pode ser diferente do valor estimado — deve ser registrado

### Atesto de Nota Fiscal (US-009)

46. Somente o usuário da **secretaria responsável** pela ordem pode atestar a nota
47. A recusa de atesto exige **descrição obrigatória** da não conformidade
48. Data e hora do atesto são registradas **automaticamente**
49. Número da nota fiscal é **obrigatório** para o atesto ser concluído

### Liquidação e Pagamento (US-010)

50. Liquidação: registrar data, valor liquidado e observação opcional
51. Pagamento: registrar data do pagamento, valor pago e forma de pagamento (`transferencia`, `cheque`, `pix`)
52. Valor pago pode diferir do valor liquidado **apenas mediante justificativa**
53. Ordem com status `PAGA` é **somente-leitura** para todos os perfis operacionais
54. Somente Administrador pode reverter uma ordem paga em caso de erro

### Dashboard Executivo (US-011)

55. KPIs: Total de Ordens, Valor Total (R$), Em Aberto, Pagas, Taxa de Reprovação (%), Tempo Médio de Processo (dias)
56. Gargalos: ordens paradas na mesma etapa há mais de **5 dias úteis** geram alerta automático
57. Secretarias com taxa de devolução/irregularidade acima de **20%** geram alerta de atenção
58. Dados do dashboard devem ser servidos por **endpoint agregado** (não calcular no front-end)
59. Atualização dos dados a cada **5 minutos** ou via botão de refresh manual

### Log de Auditoria (US-012)

60. Log de auditoria é **append-only** — nenhum registro pode ser alterado ou deletado
61. Cada entrada do log deve conter: `ordem_id`, `usuario_id`, `perfil`, `acao`, `status_anterior`, `status_novo`, `observacao`, `ip_address`, `created_at`
62. Histórico disponível para: Administrador, Controladoria e Secretaria de origem da ordem
63. Exportação do histórico de uma ordem em formato **PDF** deve ser suportada
64. Logs de acesso ao sistema (login/logout) armazenados **separadamente**

### Gestão de Secretarias (US-013)

65. Nome e sigla da secretaria devem ser **únicos** no sistema
66. Secretaria desativada não pode receber novas ordens, mas **mantém histórico**
67. Orçamento anual pode ser editado a qualquer momento pelo Administrador
68. **Não é possível excluir** uma secretaria — apenas desativar

### Notificações por E-mail (US-014)

69. E-mails são disparados de forma **assíncrona** (fila — não impacta a resposta da API)
70. Configuração de quais eventos disparam e-mail deve ser gerenciável pelo Administrador
71. E-mail deve conter: número do protocolo, secretaria, etapa atual, observação e **link direto** para a ordem
72. Falha no envio de e-mail **não deve bloquear** a transição de status no sistema
73. Usuário pode configurar preferência de receber ou não notificações

---

## 6. Maquina de Estados das Ordens

### Diagrama de Transicoes

```
CRIADA
  └─► AGUARDANDO_GABINETE  (automático na criação — US-003)
        ├─► AGUARDANDO_CONTROLADORIA  (autorizar — US-005)
        ├─► DEVOLVIDA_PARA_ALTERACAO  (solicitar_alteracao — US-005)
        │     └─► AGUARDANDO_GABINETE  (reenviar — US-006)
        └─► CANCELADA  (cancelar — US-005) [TERMINAL - irreversível]

AGUARDANDO_CONTROLADORIA
  ├─► AGUARDANDO_EMPENHO  (aprovar — US-007)
  ├─► COM_IRREGULARIDADE  (irregularidade — US-007) [suspensa]
  └─► AGUARDANDO_DOCUMENTACAO  (solicitar_documentacao — US-007)
        └─► AGUARDANDO_CONTROLADORIA  (após envio de docs pela Secretaria)

AGUARDANDO_EMPENHO
  └─► AGUARDANDO_EXECUCAO  (empenhar — US-008)
        [equivale a AGUARDANDO_ATESTO]

AGUARDANDO_ATESTO
  ├─► AGUARDANDO_LIQUIDACAO  (atestar — US-009)
  └─► EXECUCAO_COM_PENDENCIA  (recusar_atesto — US-009)

AGUARDANDO_LIQUIDACAO
  └─► AGUARDANDO_PAGAMENTO  (liquidar — US-010)

AGUARDANDO_PAGAMENTO
  └─► PAGA  (pagar — US-010) [TERMINAL - somente-leitura]
```

### Tabela Completa de Transicoes

| Status Atual                  | Acao                   | Perfil Responsavel  | Proximo Status               |
|-------------------------------|------------------------|---------------------|------------------------------|
| —                             | criar                  | secretaria          | AGUARDANDO_GABINETE          |
| AGUARDANDO_GABINETE           | autorizar              | gabinete            | AGUARDANDO_CONTROLADORIA     |
| AGUARDANDO_GABINETE           | solicitar_alteracao    | gabinete            | DEVOLVIDA_PARA_ALTERACAO     |
| AGUARDANDO_GABINETE           | cancelar               | gabinete            | CANCELADA                    |
| DEVOLVIDA_PARA_ALTERACAO      | reenviar               | secretaria          | AGUARDANDO_GABINETE          |
| AGUARDANDO_CONTROLADORIA      | aprovar                | controladoria       | AGUARDANDO_EMPENHO           |
| AGUARDANDO_CONTROLADORIA      | irregularidade         | controladoria       | COM_IRREGULARIDADE           |
| AGUARDANDO_CONTROLADORIA      | solicitar_documentacao | controladoria       | AGUARDANDO_DOCUMENTACAO      |
| AGUARDANDO_DOCUMENTACAO       | (envio docs)           | secretaria          | AGUARDANDO_CONTROLADORIA     |
| AGUARDANDO_EMPENHO            | empenhar               | contabilidade       | AGUARDANDO_EXECUCAO          |
| AGUARDANDO_ATESTO             | atestar                | secretaria          | AGUARDANDO_LIQUIDACAO        |
| AGUARDANDO_ATESTO             | recusar_atesto         | secretaria          | EXECUCAO_COM_PENDENCIA       |
| AGUARDANDO_LIQUIDACAO         | liquidar               | contabilidade       | AGUARDANDO_PAGAMENTO         |
| AGUARDANDO_PAGAMENTO          | pagar                  | tesouraria          | PAGA                         |

### ENUM de Status (banco de dados)

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

### Cores de Status no Front-End

| Status                        | Cor (Tailwind)    | Significado Visual   |
|-------------------------------|-------------------|----------------------|
| AGUARDANDO_*                  | Azul              | Pendente de acao     |
| DEVOLVIDA_PARA_ALTERACAO      | Amarelo           | Requer atencao       |
| COM_IRREGULARIDADE            | Vermelho          | Problema fiscal      |
| EXECUCAO_COM_PENDENCIA        | Vermelho          | Nao conformidade     |
| CANCELADA                     | Cinza/Vermelho    | Terminal negativo    |
| PAGA                          | Verde             | Concluido            |

---

## 7. Perfis e Permissoes (RBAC)

### Definicao dos Perfis

| Perfil          | Enum Value       | Descricao                                                          |
|-----------------|------------------|--------------------------------------------------------------------|
| Secretaria      | `secretaria`     | Servidor da secretaria municipal — cria e acompanha ordens         |
| Gabinete        | `gabinete`       | Equipe do Prefeito — autoriza, devolve ou cancela ordens           |
| Controladoria   | `controladoria`  | Fiscal — analisa conformidade legal e fiscal                       |
| Contabilidade   | `contabilidade`  | Empenhamento e liquidacao orcamentaria                             |
| Tesouraria      | `tesouraria`     | Efetua e confirma pagamentos                                       |
| Administrador   | `admin`          | Gestao da plataforma, usuarios, secretarias e acesso total         |

### Matriz de Permissoes por Tela

| Tela / Funcao                  | secretaria | gabinete | controladoria | contabilidade | tesouraria | admin |
|--------------------------------|:----------:|:--------:|:-------------:|:-------------:|:----------:|:-----:|
| Login                          | X          | X        | X             | X             | X          | X     |
| Dashboard simplificado         | X (proprio)| X        | —             | —             | —          | X     |
| Dashboard executivo completo   | —          | X        | —             | —             | —          | X     |
| Nova Ordem                     | X          | —        | —             | —             | —          | —     |
| Minhas Ordens                  | X          | —        | —             | —             | —          | X     |
| Devolvidas para Alteracao      | X          | —        | —             | —             | —          | X     |
| Pipeline Gabinete              | —          | X        | —             | —             | —          | X (RO)|
| Pipeline Controladoria         | —          | —        | X             | —             | —          | X (RO)|
| Pipeline Empenho               | —          | —        | —             | X             | —          | X (RO)|
| Pipeline Atesto                | X          | —        | —             | —             | —          | X (RO)|
| Pipeline Liquidacao            | —          | —        | —             | X             | —          | X (RO)|
| Pipeline Pagamento             | —          | —        | —             | —             | X          | X (RO)|
| Historico/Auditoria da Ordem   | X (propria)| X        | X             | —             | —          | X     |
| Audit Log Global               | —          | —        | —             | —             | —          | X     |
| Gestao de Usuarios             | —          | —        | —             | —             | —          | X     |
| Gestao de Secretarias          | —          | —        | —             | —             | —          | X     |

> RO = Somente Leitura

### Regras de Acesso Criticas

- O back-end **sempre valida** o perfil via token JWT em cada requisicao
- Rota nao autorizada retorna **HTTP 403** e front-end redireciona para `/acesso-negado`
- Botoes de acao ficam **ocultos** (nao apenas desabilitados) para perfis sem permissao
- Admin **nao pode remover seu proprio perfil** de administrador
- Secretaria so ve ordens da **propria secretaria** (filtro no back-end, nao no front-end)

---

## 8. Modelagem de Banco de Dados

### Tabela: `users`

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  nome_completo   VARCHAR(255) NOT NULL,
  role            role_enum NOT NULL,  -- enum dos 6 perfis
  secretaria_id   UUID REFERENCES secretarias(id),  -- nullable para perfis transversais
  is_active       BOOLEAN DEFAULT TRUE,
  first_login     BOOLEAN DEFAULT TRUE,  -- exige troca de senha no primeiro acesso
  login_attempts  INTEGER DEFAULT 0,
  locked_until    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

### Tabela: `secretarias`

```sql
CREATE TABLE secretarias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            VARCHAR(255) UNIQUE NOT NULL,
  sigla           VARCHAR(5) UNIQUE NOT NULL,
  orcamento_anual DECIMAL(15,2),
  ativo           BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

### Tabela: `ordens`

```sql
CREATE TABLE ordens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo         VARCHAR(20) UNIQUE NOT NULL,  -- OS-2026-00001
  tipo              tipo_ordem_enum NOT NULL,       -- COMPRA, SERVICO, OBRA
  prioridade        prioridade_enum NOT NULL,       -- NORMAL, ALTA, URGENTE
  secretaria_id     UUID NOT NULL REFERENCES secretarias(id),
  criado_por        UUID NOT NULL REFERENCES users(id),
  responsavel       VARCHAR(255),
  descricao         TEXT,
  valor_estimado    DECIMAL(15,2) NOT NULL CHECK (valor_estimado > 0),
  justificativa     TEXT NOT NULL,                  -- minimo 50 chars (validar no app)
  status            status_ordem NOT NULL DEFAULT 'AGUARDANDO_GABINETE',
  versao            INTEGER DEFAULT 1,              -- incrementado a cada reenvio

  -- Campos financeiros (preenchidos ao longo do fluxo)
  numero_empenho    VARCHAR(100) UNIQUE,
  valor_empenhado   DECIMAL(15,2),
  data_empenho      DATE,
  numero_nf         VARCHAR(100),
  data_atesto       TIMESTAMP,
  atestado_por      UUID REFERENCES users(id),
  valor_liquidado   DECIMAL(15,2),
  data_liquidacao   DATE,
  valor_pago        DECIMAL(15,2),
  data_pagamento    DATE,
  forma_pagamento   forma_pagamento_enum,           -- transferencia, cheque, pix

  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- Indices de performance
CREATE INDEX idx_ordens_secretaria_id ON ordens(secretaria_id);
CREATE INDEX idx_ordens_status ON ordens(status);
CREATE INDEX idx_ordens_created_at ON ordens(created_at);
```

### Tabela: `ordem_historico`

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
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
  -- SEM UPDATE ou DELETE — append-only
);

-- Indices de performance
CREATE INDEX idx_historico_ordem_id ON ordem_historico(ordem_id);
CREATE INDEX idx_historico_usuario_id ON ordem_historico(usuario_id);
CREATE INDEX idx_historico_created_at ON ordem_historico(created_at);
```

### Tabela: `audit_logs`

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,  -- LOGIN, LOGOUT, LOGIN_FAILED, etc.
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Tabela: `role_change_log`

```sql
CREATE TABLE role_change_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  old_role    role_enum NOT NULL,
  new_role    role_enum NOT NULL,
  changed_by  UUID NOT NULL REFERENCES users(id),
  changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Tabela: `notification_log`

```sql
CREATE TABLE notification_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id     UUID REFERENCES ordens(id),
  evento       VARCHAR(100) NOT NULL,
  destinatario VARCHAR(255) NOT NULL,
  status       notification_status_enum NOT NULL,  -- enviado, falhou
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Tabela: `user_notification_prefs`

```sql
CREATE TABLE user_notification_prefs (
  user_id     UUID NOT NULL REFERENCES users(id),
  evento      VARCHAR(100) NOT NULL,
  ativo       BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_id, evento)
);
```

---

## 9. Endpoints da API

### Autenticacao (`/api/auth`)

| Metodo | Endpoint                         | Descricao                            | Perfil |
|--------|----------------------------------|--------------------------------------|--------|
| POST   | `/api/auth/login`                | Login com email e senha              | Publico|
| POST   | `/api/auth/refresh`              | Renovar token com refresh token      | Publico|
| POST   | `/api/auth/logout`               | Invalidar sessao                     | Qualquer|
| GET    | `/api/auth/me`                   | Dados do usuario autenticado e perfil| Qualquer|
| POST   | `/api/auth/change-password`      | Troca de senha (primeiro acesso)     | Qualquer|

**POST /api/auth/login — Payload:**
```json
{ "email": "string", "password": "string" }
```
**Resposta:**
```json
{ "token": "string", "refreshToken": "string", "user": { "id": "uuid", "nome": "string", "role": "string", "secretaria_id": "uuid" } }
```

### Usuarios (`/api/users`)

| Metodo | Endpoint                         | Descricao                            | Perfil |
|--------|----------------------------------|--------------------------------------|--------|
| GET    | `/api/users`                     | Listar todos os usuarios             | admin  |
| POST   | `/api/users`                     | Criar novo usuario                   | admin  |
| PUT    | `/api/users/:id`                 | Editar dados do usuario              | admin  |
| PUT    | `/api/users/:id/role`            | Alterar perfil do usuario            | admin  |
| PUT    | `/api/users/me/notification-preferences` | Salvar preferencias de notificacao | Qualquer |

**PUT /api/users/:id/role — Payload:**
```json
{ "role": "secretaria|gabinete|controladoria|contabilidade|tesouraria|admin" }
```

### Secretarias (`/api/secretarias`)

| Metodo | Endpoint                           | Descricao                         | Perfil |
|--------|------------------------------------|-----------------------------------|--------|
| GET    | `/api/secretarias`                 | Listar secretarias                | Qualquer|
| POST   | `/api/secretarias`                 | Criar secretaria                  | admin  |
| PUT    | `/api/secretarias/:id`             | Editar secretaria                 | admin  |
| PATCH  | `/api/secretarias/:id/status`      | Ativar/desativar secretaria       | admin  |

**POST/PUT /api/secretarias — Payload:**
```json
{ "nome": "string", "sigla": "string", "orcamento_anual": 0.00, "ativo": true }
```

### Ordens (`/api/ordens`)

| Metodo | Endpoint                         | Descricao                              | Perfil            |
|--------|----------------------------------|----------------------------------------|-------------------|
| GET    | `/api/ordens`                    | Listar ordens (filtros via query params)| Varios (filtrado)|
| POST   | `/api/ordens`                    | Criar nova ordem                       | secretaria        |
| GET    | `/api/ordens/:id`                | Detalhe completo da ordem              | Varios            |
| PUT    | `/api/ordens/:id`                | Editar ordem devolvida                 | secretaria        |
| PATCH  | `/api/ordens/:id/acao`           | Executar acao de workflow              | Varia por acao    |
| GET    | `/api/ordens/:id/historico`      | Historico de tramitacao da ordem       | Varios            |

**GET /api/ordens — Query Params:**
```
secretaria_id, status, protocolo, page, limit, data_inicio, data_fim
```

**POST /api/ordens — Payload:**
```json
{
  "tipo": "COMPRA|SERVICO|OBRA",
  "prioridade": "NORMAL|ALTA|URGENTE",
  "responsavel": "string",
  "descricao": "string",
  "valor_estimado": 0.00,
  "justificativa": "string (min 50 chars)",
  "secretaria_id": "uuid"
}
```

**PATCH /api/ordens/:id/acao — Payloads por acao:**

```json
// Gabinete — autorizar
{ "acao": "autorizar", "observacao": "string (opcional)" }

// Gabinete — solicitar alteracao
{ "acao": "solicitar_alteracao", "observacao": "string (min 20 chars, OBRIGATORIO)" }

// Gabinete — cancelar
{ "acao": "cancelar", "observacao": "string (OBRIGATORIO)" }

// Secretaria — reenviar
{ "acao": "reenviar", "observacao": "string (opcional)" }

// Controladoria — aprovar
{ "acao": "aprovar", "observacao": "string (opcional)" }

// Controladoria — irregularidade
{ "acao": "irregularidade", "observacao": "string (min 50 chars, OBRIGATORIO)" }

// Controladoria — solicitar documentacao
{ "acao": "solicitar_documentacao", "observacao": "string (OBRIGATORIO)" }

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

### Dashboard (`/api/dashboard`)

| Metodo | Endpoint                         | Descricao                              | Perfil          |
|--------|----------------------------------|----------------------------------------|-----------------|
| GET    | `/api/dashboard/summary`         | KPIs e dados dos graficos              | gabinete, admin |
| GET    | `/api/dashboard/alertas`         | Lista de gargalos automaticos          | gabinete, admin |

**GET /api/dashboard/summary — Query Params:**
```
data_inicio (ISO 8601), data_fim (ISO 8601)
-- Periodo maximo: 12 meses
```

### Auditoria (`/api/audit-logs`)

| Metodo | Endpoint                         | Descricao                              | Perfil |
|--------|----------------------------------|----------------------------------------|--------|
| GET    | `/api/audit-logs`                | Log global de acoes                    | admin  |

**GET /api/audit-logs — Query Params:**
```
usuario_id, acao, data_inicio, data_fim, secretaria_id
```

### Notificacoes (interno)

| Metodo | Endpoint                         | Descricao                              | Perfil    |
|--------|----------------------------------|----------------------------------------|-----------|
| POST   | `/api/notifications/send`        | Disparar notificacao (chamada interna) | Interno   |

---

## 10. Convencoes de Codigo

### Back-End (Python / FastAPI)

```python
# Nomes de variaveis e funcoes: snake_case
def get_ordem_by_id(ordem_id: UUID, db: Session) -> Ordem:
    ...

# Nomes de classes: PascalCase
class OrdemService:
    ...

class OrdemCreate(BaseModel):  # schemas Pydantic
    ...

# Nomes de arquivos: snake_case
# ordem_service.py, auth_router.py, database.py

# Constantes: UPPER_SNAKE_CASE
MAX_LOGIN_ATTEMPTS = 5
TOKEN_EXPIRE_HOURS = 8

# Routers FastAPI: prefixo com /api + tag
router = APIRouter(prefix="/api/ordens", tags=["ordens"])

# Dependency Injection para autenticacao
@router.get("/")
def list_ordens(current_user: User = Depends(get_current_user)):
    ...

# Erros: sempre HTTPException com status codes corretos
raise HTTPException(status_code=403, detail="Acesso negado")
raise HTTPException(status_code=422, detail="Numero de empenho ja existente")
```

### Front-End (React / TypeScript)

```typescript
// Componentes React: PascalCase
const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ orderId }) => { ... }

// Hooks customizados: camelCase com prefixo "use"
const useOrdens = (filters: OrdensFilters) => { ... }

// Arquivos de componentes: PascalCase.tsx
// OrderDetailModal.tsx, StatusBadge.tsx, RoleGuard.tsx

// Arquivos de servicos, hooks, stores, utils: camelCase.ts
// ordensService.ts, useAuth.ts, authStore.ts, formatters.ts

// Interfaces TypeScript: PascalCase com sufixo descritivo
interface OrdemResponse { ... }
interface CreateOrdemPayload { ... }
type StatusOrdem = 'AGUARDANDO_GABINETE' | 'PAGA' | ...

// Constantes: UPPER_SNAKE_CASE
const MAX_JUSTIFICATIVA_MIN_LENGTH = 50
const DEBOUNCE_DELAY_MS = 300

// Stores Zustand: camelCase com sufixo "Store"
const useAuthStore = create<AuthState>(...)

// Servicos: funcoes nomeadas com verbo + recurso
export const fetchOrdens = async (filters: OrdensFilters) => { ... }
export const createOrdem = async (payload: CreateOrdemPayload) => { ... }
export const executeAcao = async (id: string, payload: AcaoPayload) => { ... }
```

### Padroes Gerais

- **Endpoints**: sempre em `/api/recurso` com snake_case nos parametros
- **UUIDs**: todas as PKs sao UUID v4
- **Timestamps**: ISO 8601 nas requisicoes e respostas
- **Paginacao**: `page` (1-based) e `limit` (default 20) como query params
- **Erros**: respostas de erro sempre com `{ "detail": "mensagem" }` (padrao FastAPI)
- **Autorizacao**: header `Authorization: Bearer <token>` em todas as rotas protegidas
- **Status HTTP**: 200 (sucesso), 201 (criado), 400 (dados invalidos), 401 (nao autenticado), 403 (sem permissao), 404 (nao encontrado), 422 (validacao), 500 (erro interno)

---

## 11. Fluxo de Implementacao por Sprint

### Sprint 1 — Autenticacao e RBAC (Semanas 1-2)

**Objetivo:** Sistema acessivel com login real e controle de rotas por perfil.

**Back-End:**
1. Configurar projeto FastAPI com estrutura de pastas
2. Configurar conexao com Supabase PostgreSQL (SQLAlchemy)
3. Criar migrations Alembic: tabelas `users`, `secretarias`, `audit_logs`, `role_change_log`
4. Implementar `POST /api/auth/login` com bcrypt e JWT
5. Implementar middleware de autenticacao (`get_current_user`)
6. Implementar `GET /api/auth/me`
7. Implementar CRUD de usuarios (`/api/users`) com validacao de role admin
8. Implementar `PUT /api/users/:id/role` com log de auditoria

**Front-End:**
1. Substituir mocks de autenticacao pelo servico real `authService.ts`
2. Implementar store Zustand `authStore` com token JWT
3. Configurar interceptor Axios para header `Authorization`
4. Implementar `RoleGuard.tsx` para protecao de rotas
5. Implementar redirecionamento para `/acesso-negado` em 403
6. Atualizar `SidebarMenu` para renderizacao condicional por perfil

---

### Sprint 2 — Criacao e Acompanhamento de Ordens (Semanas 3-4)

**Objetivo:** Secretarias criam e acompanham ordens reais no banco.

**Back-End:**
1. Migration: tabelas `ordens`, `ordem_historico`
2. Implementar `POST /api/ordens` com geracao de protocolo OS-ANO-SEQUENCIAL
3. Implementar `GET /api/ordens` com filtros e paginacao (scoped por secretaria)
4. Implementar `GET /api/ordens/:id` com historico

**Front-End:**
1. Substituir mock de criacao pelo `POST /api/ordens`
2. Conectar `OrderListTable` ao `GET /api/ordens`
3. Implementar paginacao real, filtros com debounce de 300ms
4. Conectar `OrderDetailModal` ao `GET /api/ordens/:id`

---

### Sprint 3 — Workflow de Aprovacao (Semanas 5-6)

**Objetivo:** Gabinete e Controladoria operam o fluxo de aprovacao real.

**Back-End:**
1. Implementar `PATCH /api/ordens/:id/acao` com maquina de estados
2. Validar perfil e status permitido para cada acao
3. Registrar `ordem_historico` em cada transicao
4. Implementar logica de reenvio (US-006) com incremento de versao

**Front-End:**
1. Conectar `ActionPanel` do Gabinete ao endpoint de acao
2. Conectar `ControladoriaWorkflowTable` e acoes
3. Implementar tela de ordens devolvidas com formulario de edicao pre-preenchido
4. Exibir motivo de devolucao com destaque visual (borda amarela)

---

### Sprint 4 — Pipeline Financeiro (Semanas 7-8)

**Objetivo:** Ciclo financeiro completo de empenho a pagamento.

**Back-End:**
1. Adicionar campos financeiros na tabela `ordens` (migration)
2. Implementar acoes: `empenhar`, `atestar`, `recusar_atesto`, `liquidar`, `pagar`
3. Validar unicidade do `numero_empenho`
4. Validar que datas de pagamento nao sejam futuras

**Front-End:**
1. Conectar `EmpenhoModal`, `AtesteModal`, `LiquidacaoModal`, `PagamentoModal`
2. Implementar alerta de valor pago diferente do liquidado
3. Tela de ordens pagas com filtros por secretaria e periodo

---

### Sprint 5 — Dashboard e Auditoria (Semanas 9-10)

**Objetivo:** Visibilidade executiva e rastreabilidade total.

**Back-End:**
1. Implementar `GET /api/dashboard/summary` com queries agregadas
2. Implementar `GET /api/dashboard/alertas` (ordens paradas > 5 dias uteis)
3. Implementar `GET /api/ordens/:id/historico`
4. Implementar `GET /api/audit-logs` com filtros

**Front-End:**
1. Conectar `KPICardGrid` ao endpoint de summary
2. Conectar graficos Recharts (FunnelChart, BarChart, StackedBar)
3. Implementar `AlertPanel` com links clicaveis
4. Implementar `DateRangePicker` e recalculo de KPIs
5. Implementar `AuditTimeline` no modal de detalhe

---

### Sprint 6 — Administracao e Notificacoes (Semanas 11-12)

**Objetivo:** Gestao da plataforma e alertas automaticos por e-mail.

**Back-End:**
1. Migration: `notification_log`, `user_notification_prefs`
2. Implementar CRUD `/api/secretarias`
3. Implementar servico de notificacao assincrono (fila)
4. Configurar disparo de e-mail apos transicoes de status criticas

**Front-End:**
1. Conectar tela de Gestao de Secretarias
2. Implementar `NotificationPreferencesPanel`
3. Conectar tela de Gestao de Usuarios ao endpoint real

---

## 12. Comandos Uteis

### Back-End

```bash
# Instalar dependencias
cd backend
pip install -r requirements.txt

# Criar ambiente virtual (recomendado)
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# Rodar servidor de desenvolvimento
uvicorn app.main:app --reload --port 8000

# Rodar com hot reload e logs detalhados
uvicorn app.main:app --reload --log-level debug

# Migrations Alembic
alembic init alembic                        # inicializar (ja feito)
alembic revision --autogenerate -m "descricao"  # criar migration
alembic upgrade head                        # aplicar migrations
alembic downgrade -1                        # reverter ultima migration
alembic history                             # ver historico de migrations

# Rodar testes
pytest
pytest -v                                   # verbose
pytest tests/test_auth.py                   # testar modulo especifico
pytest --cov=app                            # com cobertura

# Verificar API (Swagger UI)
# Acesse: http://localhost:8000/docs
# Acesse: http://localhost:8000/redoc
```

### Front-End

```bash
# Instalar dependencias
cd frontend
npm install

# Rodar servidor de desenvolvimento
npm run dev
# Acesse: http://localhost:5173

# Build para producao
npm run build

# Preview do build de producao
npm run preview

# Verificar tipos TypeScript
npm run type-check

# Lint
npm run lint

# Formatar codigo (Prettier)
npm run format
```

### Banco de Dados (Supabase / PostgreSQL)

```bash
# Conectar ao banco via psql
psql "postgresql://[user]:[password]@[host]:[port]/[database]"

# Verificar status das migrations Alembic
alembic current

# Ver todas as tabelas (dentro do psql)
\dt

# Ver estrutura de uma tabela
\d ordens

# Listar ENUMs criados
SELECT typname FROM pg_type WHERE typtype = 'e';
```

### Variaveis de Ambiente

```env
# backend/.env
DATABASE_URL=postgresql://user:password@host:port/database
SECRET_KEY=your-jwt-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_HOURS=8
REFRESH_TOKEN_EXPIRE_HOURS=24
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# Servico de e-mail (para US-014)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@prefeitura.gov.br
SMTP_PASSWORD=password
```

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME="Sistema OS Prefeitura"
```

---

## Apendice: Componentes Front-End Mapeados por US

| US      | Componentes Principais                                                                 |
|---------|----------------------------------------------------------------------------------------|
| US-001  | LoginPage, InputField, AlertBanner, LoadingSpinner                                     |
| US-002  | RoleGuard, SidebarMenu, UserManagementTable, ProfileBadge                              |
| US-003  | StepperForm, SecretariaSelect, TipoOrdemSelect, CurrencyInput, CharacterCounter, SuccessScreen |
| US-004  | OrderListTable, StatusBadge, SearchInput, FilterSelect, OrderDetailModal, EmptyState   |
| US-005  | WorkflowTable, ActionPanel, ObservacaoTextarea, ConfirmationDialog, ToastNotification  |
| US-006  | DevolvidasList, EditOrderForm, DevolucaoAlert, ConfirmationModal                       |
| US-007  | ControladoriaWorkflowTable, ActionPanel, PareceTextarea, DocumentViewer                |
| US-008  | EmpenhoWorkflowTable, EmpenhoModal, ConfirmationDialog, ToastNotification              |
| US-009  | AtesteWorkflowTable, AtesteModal, RecusaModal                                          |
| US-010  | LiquidacaoWorkflowTable, PagamentoWorkflowTable, LiquidacaoModal, PagamentoModal, PagasTable |
| US-011  | KPICardGrid, FunnelChart, BarChart, StackedBarChart, AlertPanel, DateRangePicker, AnalyticsTable |
| US-012  | AuditTimeline, AuditLogTable, FilterPanel, ExportButton                                |
| US-013  | SecretariasTable, SecretariaFormModal, ToggleDesativar                                 |
| US-014  | NotificationPreferencesPanel, EmailEventConfigTable                                    |
