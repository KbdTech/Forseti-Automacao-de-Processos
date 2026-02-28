# CLAUDE.md — Sistema de Gestão de OS e Compras Públicas

> Contexto do projeto para o Claude Code. Versão 2.0 — Fevereiro 2026 — Uso Interno

---

## 1. Contexto do Projeto

Sistema web de **Ordens de Serviço (OS) e Compras Públicas** para uma Prefeitura Municipal. Substitui processos informais por fluxo digital rastreável com RBAC, auditoria append-only e pipeline financeiro integrado (empenho → atesto → liquidação → pagamento).

**Status:** Projeto base completo — S1→S6 + US-015 (documentos) + US-016 (assinatura GovBR) implementados e testados (91 testes passando).

**Fase atual:** Recebimento e implementação de novas features.

---

## 2. Stack Tecnológica

### Back-End

| Tecnologia | Versão | Uso |
|---|---|---|
| Python | 3.11 | Linguagem principal |
| FastAPI | 0.100+ | Framework REST |
| SQLAlchemy | 2.0+ async | ORM (asyncpg) |
| Alembic | 1.12+ | Migrations |
| Pydantic | 2.0+ | Schemas/validação |
| PostgreSQL | — | Banco (via Supabase) |
| python-jose | — | JWT |
| bcrypt | — | Hash de senhas |

### Front-End

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 18 | UI |
| TypeScript | 5 (strict) | Tipagem |
| Vite | 5 | Bundler/dev server |
| Tailwind CSS | 4 | Estilização |
| shadcn/ui | — | Componentes (Radix UI) |
| Recharts | — | Gráficos |
| React Router | — | Roteamento + RoleGuard |
| Zustand | 5 | Estado global |
| Axios | — | HTTP client |
| React Hook Form + Zod | — | Formulários/validação |

---

## 3. Estrutura de Pastas

```
Forseti-Automacoes/
├── CLAUDE.md
├── backend/
│   ├── app/
│   │   ├── api/routes/          # auth, users, ordens, secretarias, dashboard,
│   │   │                        # audit, notifications, documentos
│   │   ├── core/                # config.py, database.py
│   │   ├── models/              # user, secretaria, ordem, audit, documento
│   │   ├── schemas/             # Pydantic schemas por domínio
│   │   ├── services/            # auth_service, ordem_service, notification_service,
│   │   │                        # documento_service
│   │   ├── api/deps.py          # get_current_user, require_role, get_client_ip
│   │   └── main.py              # FastAPI app + routers
│   ├── alembic/versions/        # 8 migrations (001→008)
│   ├── tests/                   # 91 testes (pytest)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── components/ui/       # shadcn/ui components
        ├── hooks/               # useAuth, useOrdens, etc.
        ├── pages/               # Uma página por rota (15 páginas)
        ├── routes/              # AppRouter.tsx, RoleGuard.tsx
        ├── services/            # apiClient.ts + *Service.ts por domínio
        ├── stores/              # authStore.ts, uiStore.ts
        ├── types/               # *.types.ts por domínio
        └── utils/               # formatters.ts, validators.ts, constants.ts
```

---

## 4. User Stories Implementadas

| US | Título | Módulo |
|---|---|---|
| US-001 | Login com Credenciais Institucionais | Auth |
| US-002 | Controle de Acesso por Perfil (RBAC) | Auth |
| US-003 | Criação de Nova Ordem | Ordens |
| US-004 | Acompanhamento de Ordens | Ordens |
| US-005 | Análise e Decisão do Gabinete | Workflow |
| US-006 | Reenvio de Ordem Devolvida | Workflow |
| US-007 | Análise de Conformidade (Controladoria) | Workflow |
| US-008 | Registro de Empenho | Pipeline Financeiro |
| US-009 | Atesto de Nota Fiscal | Pipeline Financeiro |
| US-010 | Liquidação e Pagamento | Pipeline Financeiro |
| US-011 | Dashboard Executivo com KPIs | Dashboard |
| US-012 | Log de Auditoria | Auditoria |
| US-013 | Gestão de Secretarias | Admin |
| US-014 | Notificações por E-mail | Notificações |
| US-015 | Upload e Gestão de Documentos | Documentos |
| US-016 | Assinatura Digital GovBR | Assinatura |

---

## 5. Regras de Negócio Críticas

### Autenticação
- Máx. **5 tentativas** de login → bloqueio de **15 min**
- JWT: acesso **8h**, refresh **24h**
- **Primeiro acesso** exige troca de senha obrigatória
- Toda tentativa registrada em `audit_logs`

### RBAC
- Perfis: `secretaria` · `gabinete` · `controladoria` · `contabilidade` · `tesouraria` · `admin`
- Back-end valida role em **cada requisição** — nunca confiar só no front
- Rota não autorizada → HTTP 403 → front redireciona para `/acesso-negado`
- Botões de ação ficam **ocultos** (não desabilitados) para perfis sem permissão

### Ordens
- Protocolo: **OS-ANO-SEQUENCIAL** (ex.: `OS-2026-00001`) — gerado atomicamente
- Status inicial automático: `AGUARDANDO_GABINETE`
- Valor estimado: número positivo obrigatório
- Justificativa: mínimo **50 caracteres**
- Secretaria → vê **apenas ordens da própria secretaria** (filtro no back-end)
- Paginação padrão: **20 registros/página**

### Workflow
- Gabinete — `solicitar_alteracao`: campo `observacao` obrigatório (mín. 20 chars)
- Cancelamento é **irreversível** — só Admin pode reverter
- Reenvio incrementa **contador de versão** da ordem; protocolo original mantido
- Controladoria — irregularidade: descrição obrigatória (mín. 50 chars)
- Após empenho: ordem não pode ser cancelada sem processo especial

### Pipeline Financeiro
- `numero_empenho` deve ser **único** no sistema
- Atesto: somente usuário da **secretaria responsável** pode atestar
- Valor pago ≠ liquidado somente com **justificativa**
- Ordem `PAGA` → **somente-leitura** para todos os perfis operacionais

### Dashboard & Auditoria
- Gargalos: ordens paradas > **5 dias úteis** → alerta automático
- Secretarias com devolução/irregularidade > **20%** → alerta
- `ordem_historico` é **append-only** — sem UPDATE/DELETE
- Cada entrada: `ordem_id`, `usuario_id`, `perfil`, `acao`, `status_anterior`, `status_novo`, `observacao`, `ip_address`, `created_at`

### Notificações & Documentos
- E-mails disparados **assincronamente** — falha não bloqueia transição de status
- Secretaria desativada não recebe novas ordens, mas **mantém histórico**

---

## 6. Máquina de Estados das Ordens

```
AGUARDANDO_GABINETE
  ├─► AGUARDANDO_CONTROLADORIA  (autorizar)
  ├─► DEVOLVIDA_PARA_ALTERACAO  (solicitar_alteracao)
  │     └─► AGUARDANDO_GABINETE  (reenviar)
  └─► CANCELADA  [TERMINAL]

AGUARDANDO_CONTROLADORIA
  ├─► AGUARDANDO_EMPENHO        (aprovar)
  ├─► COM_IRREGULARIDADE        (irregularidade) [suspensa]
  └─► AGUARDANDO_DOCUMENTACAO   (solicitar_documentacao)
        └─► AGUARDANDO_CONTROLADORIA  (envio docs)

AGUARDANDO_EMPENHO → AGUARDANDO_EXECUCAO/ATESTO  (empenhar)
AGUARDANDO_ATESTO
  ├─► AGUARDANDO_LIQUIDACAO     (atestar)
  └─► EXECUCAO_COM_PENDENCIA    (recusar_atesto)

AGUARDANDO_LIQUIDACAO → AGUARDANDO_PAGAMENTO  (liquidar)
AGUARDANDO_PAGAMENTO  → PAGA  [TERMINAL]
```

### Transições Completas

| Status Atual | Ação | Perfil | Próximo Status |
|---|---|---|---|
| — | criar | secretaria | AGUARDANDO_GABINETE |
| AGUARDANDO_GABINETE | autorizar | gabinete | AGUARDANDO_CONTROLADORIA |
| AGUARDANDO_GABINETE | solicitar_alteracao | gabinete | DEVOLVIDA_PARA_ALTERACAO |
| AGUARDANDO_GABINETE | cancelar | gabinete | CANCELADA |
| DEVOLVIDA_PARA_ALTERACAO | reenviar | secretaria | AGUARDANDO_GABINETE |
| AGUARDANDO_CONTROLADORIA | aprovar | controladoria | AGUARDANDO_EMPENHO |
| AGUARDANDO_CONTROLADORIA | irregularidade | controladoria | COM_IRREGULARIDADE |
| AGUARDANDO_CONTROLADORIA | solicitar_documentacao | controladoria | AGUARDANDO_DOCUMENTACAO |
| AGUARDANDO_DOCUMENTACAO | (envio docs) | secretaria | AGUARDANDO_CONTROLADORIA |
| AGUARDANDO_EMPENHO | empenhar | contabilidade | AGUARDANDO_EXECUCAO |
| AGUARDANDO_ATESTO | atestar | secretaria | AGUARDANDO_LIQUIDACAO |
| AGUARDANDO_ATESTO | recusar_atesto | secretaria | EXECUCAO_COM_PENDENCIA |
| AGUARDANDO_LIQUIDACAO | liquidar | contabilidade | AGUARDANDO_PAGAMENTO |
| AGUARDANDO_PAGAMENTO | pagar | tesouraria | PAGA |

### Cores de Status (Tailwind)

| Status | Cor |
|---|---|
| AGUARDANDO_* | Azul |
| DEVOLVIDA_PARA_ALTERACAO | Amarelo |
| COM_IRREGULARIDADE / EXECUCAO_COM_PENDENCIA | Vermelho |
| CANCELADA | Cinza/Vermelho |
| PAGA | Verde |

---

## 7. Perfis e Permissões (RBAC)

| Tela | secretaria | gabinete | controladoria | contabilidade | tesouraria | admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard executivo | — | X | — | — | — | X |
| Nova Ordem | X | — | — | — | — | — |
| Minhas Ordens | X | — | — | — | — | X |
| Devolvidas | X | — | — | — | — | X |
| Pipeline Gabinete | — | X | — | — | — | RO |
| Pipeline Controladoria | — | — | X | — | — | RO |
| Pipeline Empenho | — | — | — | X | — | RO |
| Pipeline Atesto | X | — | — | — | — | RO |
| Pipeline Liquidação | — | — | — | X | — | RO |
| Pipeline Pagamento | — | — | — | — | X | RO |
| Auditoria/Histórico | X (própria) | X | X | — | — | X |
| Audit Log Global | — | — | — | — | — | X |
| Gestão Usuários | — | — | — | — | — | X |
| Gestão Secretarias | — | — | — | — | — | X |

> RO = Somente Leitura

---

## 8. Banco de Dados — Tabelas

| Tabela | Campos-chave |
|---|---|
| `users` | id (UUID PK), email, password_hash, nome_completo, role, secretaria_id, is_active, first_login, login_attempts, locked_until |
| `secretarias` | id, nome (unique), sigla (unique, max 5), orcamento_anual, ativo |
| `ordens` | id, protocolo (OS-ANO-SEQ), tipo, prioridade, secretaria_id, criado_por, status, versao, valor_estimado, justificativa + campos financeiros (numero_empenho, valor_empenhado, numero_nf, data_atesto, valor_liquidado, valor_pago, forma_pagamento) |
| `ordem_historico` | id, ordem_id, usuario_id, perfil, acao, status_anterior, status_novo, observacao, ip_address, created_at — **APPEND-ONLY** |
| `audit_logs` | id, user_id, action (LOGIN/LOGOUT/etc.), ip_address, user_agent, created_at |
| `role_change_log` | id, user_id, old_role, new_role, changed_by, changed_at |
| `notification_log` | id, ordem_id, evento, destinatario, status (enviado/falhou), created_at |
| `user_notification_prefs` | user_id, evento, ativo — PK composta |
| `documentos` | id, ordem_id, nome_arquivo, tipo_mime, tamanho_bytes, storage_path, uploaded_by, created_at |

**ENUMs PostgreSQL:** `status_ordem`, `tipo_ordem` (COMPRA/SERVICO/OBRA), `prioridade_enum` (NORMAL/ALTA/URGENTE), `role_enum`, `forma_pagamento_enum` (transferencia/cheque/pix)

**Índices obrigatórios:** `ordens(secretaria_id, status)`, `ordem_historico(ordem_id, created_at)`, `audit_logs(user_id, created_at)`

---

## 9. Endpoints da API

### Auth (`/api/auth`)
| Método | Endpoint | Perfil |
|---|---|---|
| POST | `/login` | Público |
| POST | `/refresh` | Público |
| POST | `/logout` | Qualquer |
| GET | `/me` | Qualquer |
| POST | `/change-password` | Qualquer |

### Users (`/api/users`)
| Método | Endpoint | Perfil |
|---|---|---|
| GET/POST | `/` | admin |
| PUT | `/{id}` | admin |
| PUT | `/{id}/role` | admin |
| PUT | `/me/notification-preferences` | Qualquer |

### Secretarias (`/api/secretarias`)
| Método | Endpoint | Perfil |
|---|---|---|
| GET | `/` | Qualquer |
| POST | `/` | admin |
| PUT | `/{id}` | admin |
| PATCH | `/{id}/status` | admin |

### Ordens (`/api/ordens`)
| Método | Endpoint | Perfil |
|---|---|---|
| GET | `/` | Vários (filtrado) |
| POST | `/` | secretaria |
| GET/PUT | `/{id}` | Vários |
| PATCH | `/{id}/acao` | Varia por ação |
| GET | `/{id}/historico` | Vários |
| POST/GET | `/{id}/documentos` | Vários |
| GET | `/documentos/{doc_id}/download-url` | Vários |
| DELETE | `/documentos/{doc_id}` | Vários |

**Query params GET /ordens:** `secretaria_id`, `status`, `protocolo`, `page`, `limit`, `data_inicio`, `data_fim`

**PATCH /{id}/acao — payloads principais:**
```json
{ "acao": "autorizar", "observacao": "string" }
{ "acao": "solicitar_alteracao", "observacao": "string (min 20, obrigatório)" }
{ "acao": "cancelar", "observacao": "string (obrigatório)" }
{ "acao": "irregularidade", "observacao": "string (min 50, obrigatório)" }
{ "acao": "empenhar", "numero_empenho": "string", "valor_empenhado": 0.00 }
{ "acao": "atestar", "numero_nf": "string" }
{ "acao": "liquidar", "valor_liquidado": 0.00, "data_liquidacao": "YYYY-MM-DD" }
{ "acao": "pagar", "valor_pago": 0.00, "data_pagamento": "YYYY-MM-DD", "forma_pagamento": "pix|transferencia|cheque" }
```

### Dashboard (`/api/dashboard`)
| Método | Endpoint | Perfil |
|---|---|---|
| GET | `/summary?data_inicio=&data_fim=` | gabinete, admin |
| GET | `/alertas` | gabinete, admin |

### Auditoria & Notificações
| Método | Endpoint | Perfil |
|---|---|---|
| GET | `/api/audit-logs` | admin |
| GET/PUT | `/api/notifications/preferences` | Qualquer |

---

## 10. Convenções de Código

**Back-End (Python):** `snake_case` variáveis/funções · `PascalCase` classes/schemas · `UPPER_SNAKE_CASE` constantes · arquivos em `snake_case.py` · routers com prefixo `/api/recurso` · erros como `HTTPException` com status correto

**Front-End (TypeScript):** `PascalCase` componentes/interfaces · `camelCase` hooks (`useXxx`)/stores (`useXxxStore`)/services · `UPPER_SNAKE_CASE` constantes · tipagem `strict: true` sem `any` · componentes funcionais com hooks

**Geral:** UUIDs como PK · timestamps ISO 8601 / TIMESTAMPTZ · paginação `page` (1-based) + `limit` (default 20) · erros com `{ "detail": "mensagem" }` · header `Authorization: Bearer <token>`

---

## 11. Comandos Úteis

```bash
# Backend (a partir de backend/)
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/alembic upgrade head
.venv/bin/alembic revision --autogenerate -m "descricao"
.venv/bin/pytest -v
# Swagger: http://localhost:8000/api/docs

# Frontend (a partir de frontend/)
npm run dev        # http://localhost:5173
npm run build
npm run lint

# Credencial de dev: admin@prefeitura.gov.br / Admin123
```

**Variáveis de ambiente (.env em backend/):**
```
DATABASE_URL · SECRET_KEY · ALGORITHM=HS256 · ACCESS_TOKEN_EXPIRE_HOURS=8
REFRESH_TOKEN_EXPIRE_HOURS=24 · MAX_LOGIN_ATTEMPTS=5 · LOCKOUT_DURATION_MINUTES=15
SMTP_HOST · SMTP_PORT · SMTP_USER · SMTP_PASSWORD
SUPABASE_URL · SUPABASE_SERVICE_KEY  (para storage de documentos)
```

---

## 12. Instruções Operacionais

### Papel do Agente
Arquiteto e desenvolvedor principal. Implemente sempre seguindo as regras abaixo. Para novas features, defina US no mesmo formato da seção 4 antes de implementar.

### Regras Inegociáveis

**Back-End:**
1. Arquitetura em 3 camadas: Routes → Services → Models
2. Validação de role via `Depends(require_role(...))` em **cada endpoint** protegido
3. Workflow engine valida transições — rejeitar inválidas com HTTP 422
4. `ordem_historico`: **somente INSERT** — nunca UPDATE/DELETE
5. Protocolo OS-ANO-SEQ gerado **atomicamente** no banco
6. Notificações via **BackgroundTasks** — falha não bloqueia resposta
7. Nunca hardcode secrets — sempre `.env`

**Front-End:**
8. Componentes funcionais com hooks — sem class components
9. `strict: true` no tsconfig — sem `any`
10. `RoleGuard` para proteção de rotas — **esconder** (não desabilitar) ações sem permissão
11. **Debounce 300ms** em buscas/filtros
12. **Skeleton loaders** durante carregamento — sem tela em branco
13. **Modal de confirmação** antes de ações destrutivas ou transições de status
14. **Toast notifications** para feedback de sucesso/erro

**Banco:**
15. UUIDs como PK em todas as tabelas
16. `ON DELETE RESTRICT` em FKs de auditoria — nunca CASCADE
17. RLS do Supabase como camada adicional; validação principal no FastAPI

### Fluxo para Nova US
1. Definir US (título, critérios, regras de negócio, perfil)
2. Criar models/schemas no back-end
3. Criar migration Alembic
4. Implementar endpoints + service
5. Implementar componentes React + conectar via service
6. Escrever testes para regras críticas

### Checklist de Qualidade (por US)
- [ ] Validação de role no endpoint
- [ ] Transição de status validada pelo workflow engine
- [ ] Registro em `ordem_historico` após transição
- [ ] Tratamento de erros com mensagens em pt-BR
- [ ] Loading states e empty states no front
- [ ] Modal de confirmação antes de ações críticas
- [ ] Testes para regras de negócio críticas

— Pax, equilibrando prioridades 🎯
