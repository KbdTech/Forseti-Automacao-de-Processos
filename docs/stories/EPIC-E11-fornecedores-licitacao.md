# Epic E11 — Módulo Fornecedores e Licitação

> **Tipo:** Brownfield Enhancement — Multi-Sprint
> **PM:** Morgan (Strategist) — Synkra AIOS
> **Criado em:** 2026-03-02
> **Status:** Planejado

---

## Epic Goal

Permitir que a Prefeitura cadastre empresas vencedoras de licitações, vincule fornecedores às ordens de serviço no momento da criação, pré-preencha dados bancários no pagamento e rastreie gastos mensais por fornecedor — com visibilidade segmentada por perfil de acesso (RBAC).

---

## Contexto do Sistema Existente

| Item | Detalhe |
|------|---------|
| Stack back-end | Python 3.11, FastAPI, SQLAlchemy 2.0 async, Alembic, PostgreSQL (Supabase) |
| Stack front-end | React 18, TypeScript 5, Tailwind 4, shadcn/ui, Zustand 5 |
| Arquitetura | Routes → Services → Models (3 camadas) |
| RBAC | `require_role()` em cada endpoint; RoleGuard no front |
| Ordens | Pipeline: AGUARDANDO_GABINETE → … → PAGA |
| Documentos | Upload Supabase Storage com `descricao` tipada |
| Auditoria | `ordem_historico` append-only; `audit_logs` append-only |
| Sprints concluídas | S1–S10 (91 testes backend passando, TypeScript zero erros) |

**Pontos de integração críticos:**
- `ordens` (tabela): receberá FK opcional `fornecedor_id`
- `NovaOrdemPage.tsx`: ganhará campo Select de fornecedor
- `PagamentoModal.tsx`: exibirá dados bancários do fornecedor quando vinculado
- Dashboard executivo (US-011): ganhará seção/aba de gastos por fornecedor

---

## Decisões de Produto

| Decisão | Escolha | Racional |
|---------|---------|---------|
| Escopo da licitação | Registrar apenas a empresa **vencedora** (sem gerenciar processo) | Evita complexidade regulatória; o processo é externo ao sistema |
| Fornecedor na ordem | **Obrigatório** para todos os tipos (Compra, Serviço, Obra) | Toda ordem está vinculada a uma empresa vencedora de licitação — regra de negócio confirmada |
| Dados bancários | **Pré-preenchimento** no PagamentoModal (card informativo) | Reduz erros manuais da Tesouraria; dados bancários permanecem somente-leitura no pagamento |
| Escopo de secretaria | Fornecedor com `secretaria_id = null` é **global** (todos); com `secretaria_id = X` é exclusivo da secretaria X | Suporta licitações municipais (todas) e licitações específicas por órgão |

---

## Modelo de Dados — Tabela `fornecedores`

```sql
CREATE TABLE fornecedores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social    VARCHAR(255) NOT NULL,
  nome_fantasia   VARCHAR(255),
  cnpj            VARCHAR(14) NOT NULL UNIQUE,          -- 14 dígitos, sem pontuação
  numero_processo VARCHAR(100),                          -- Nº do processo licitatório
  objeto_contrato TEXT,                                  -- Objeto resumido do contrato
  valor_contratado NUMERIC(15, 2),
  data_contrato   DATE,
  banco           VARCHAR(100),                          -- Nome ou código do banco
  agencia         VARCHAR(20),
  conta           VARCHAR(30),
  tipo_conta      VARCHAR(20) DEFAULT 'corrente',        -- corrente | poupanca
  secretaria_id   UUID REFERENCES secretarias(id),       -- NULL = global; SET = exclusivo
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_fornecedores_cnpj ON fornecedores(cnpj);
CREATE INDEX idx_fornecedores_secretaria_id ON fornecedores(secretaria_id);
CREATE INDEX idx_fornecedores_is_active ON fornecedores(is_active);
```

**Adição à tabela `ordens`:**
```sql
ALTER TABLE ordens ADD COLUMN fornecedor_id UUID REFERENCES fornecedores(id) ON DELETE SET NULL;
CREATE INDEX idx_ordens_fornecedor_id ON ordens(fornecedor_id);
```

> **Nota:** Coluna nullable no banco para preservar ordens históricas. Obrigatoriedade imposta pelo schema Pydantic `OrdemCreate` (`fornecedor_id: uuid.UUID` sem Optional) e pelo guard no frontend.

---

## RBAC — Permissões por Perfil

| Perfil | Fornecedores (CRUD) | Fornecedores (Leitura) | Gastos por Fornecedor |
|--------|:------------------:|:---------------------:|:--------------------:|
| `admin` | ✅ Completo | ✅ Todos | ✅ Todos |
| `gabinete` | — | ✅ Todos | ✅ Dashboard |
| `controladoria` | — | ✅ Todos | ✅ Relatório |
| `contabilidade` | — | ✅ Todos | ✅ Relatório |
| `tesouraria` | — | ✅ Todos | ✅ Relatório |
| `secretaria` | — | ✅ Própria secretaria + globais | ✅ Própria secretaria |

---

## Endpoints da API (Novos)

### Fornecedores (`/api/fornecedores`)

| Método | Endpoint | Perfil | Descrição |
|--------|----------|--------|-----------|
| GET | `/` | Todos | Listar com filtros (cnpj, is_active, secretaria_id) + paginação |
| POST | `/` | admin | Cadastrar nova empresa vencedora |
| GET | `/{id}` | Todos | Detalhe do fornecedor |
| PUT | `/{id}` | admin | Editar dados do fornecedor |
| PATCH | `/{id}/status` | admin | Ativar/desativar |

**Query params GET /api/fornecedores:**
`page`, `limit`, `secretaria_id`, `is_active`, `cnpj`, `q` (busca por razao_social ou nome_fantasia)

**Scoping por RBAC:**
- `secretaria`: vê apenas `fornecedor_id IS NULL OR secretaria_id = user.secretaria_id`
- Demais perfis: veem todos

---

## Endpoints Modificados

| Endpoint | Mudança |
|----------|---------|
| `POST /api/ordens` | Aceita `fornecedor_id: UUID` **obrigatório**; valida existência + is_active; HTTP 422 se ausente ou inativo |
| `GET /api/ordens/{id}` | Resposta inclui `fornecedor` (objeto nested com dados básicos) |
| `GET /api/dashboard/summary` | Novo agregado `gastos_por_fornecedor` (top 10, período configurável) |

---

## Estrutura de Stories — 3 Sprints

### Sprint 11 — Fundação (19 pts)

| ID | Título | Pts | Executor | Quality Gate |
|----|--------|-----|----------|--------------|
| S11.1 | Modelo de Dados e API de Fornecedores | 5 | @data-engineer | @dev |
| S11.2 | Gestão de Fornecedores — Tela Admin | 8 | @dev | @architect |
| S11.3 | Vínculo Fornecedor ↔ Ordem (Nova Ordem + Detalhe) | 6 | @dev | @architect |

### Sprint 12 — Pipeline e Visibilidade Operacional (16 pts)

| ID | Título | Pts | Executor | Quality Gate |
|----|--------|-----|----------|--------------|
| S12.1 | Pré-preenchimento de Dados Bancários no Pagamento | 5 | @dev | @dev |
| S12.2 | Visibilidade de Fornecedores para Perfis Operacionais | 3 | @dev | @architect |
| S12.3 | Relatório de Gastos por Fornecedor (multi-perfil) | 8 | @dev | @architect |

---

## Detalhamento por Story

### S11.1 — Modelo de Dados e API de Fornecedores (5 pts)

**Objetivo:** Criar a fundação do módulo — tabela, migration e endpoints CRUD.

**Acceptance Criteria:**
- [ ] Migration Alembic cria tabela `fornecedores` com todos os campos e índices
- [ ] Migration adiciona coluna `fornecedor_id` em `ordens` (nullable, FK com ON DELETE SET NULL)
- [ ] `GET /api/fornecedores` lista com paginação e scoping por RBAC
- [ ] `POST /api/fornecedores` valida CNPJ único (formato 14 dígitos), retorna 409 se duplicado
- [ ] `PUT /api/fornecedores/{id}` edita; `PATCH /{id}/status` ativa/desativa
- [ ] Perfil `secretaria` vê apenas fornecedores da sua secretaria + globais (secretaria_id IS NULL)
- [ ] Testes pytest: unicidade CNPJ, scoping RBAC, campos obrigatórios

**Executor:** @data-engineer | **Quality Gate:** @dev

---

### S11.2 — Gestão de Fornecedores — Tela Admin (8 pts)

**Objetivo:** Interface completa para admin cadastrar e gerir empresas vencedoras.

**Rota:** `/admin/fornecedores`

**Acceptance Criteria:**
- [ ] Tabela com colunas: Razão Social, CNPJ (formatado XX.XXX.XXX/XXXX-XX), Nº Processo, Valor Contratado (R$), Secretaria, Status
- [ ] Filtros: busca por nome/CNPJ, filtro por secretaria, filtro por status (ativo/inativo)
- [ ] Dialog "Novo Fornecedor": todos os campos do modelo; secretaria opcional (null = global)
- [ ] Dialog "Editar Fornecedor": mesmos campos; alerta se fornecedor vinculado a ordens ativas
- [ ] Botão Ativar/Desativar com AlertDialog de confirmação
- [ ] CNPJ validado no formato (máscara + regex); erro inline se duplicado (HTTP 409)
- [ ] Campo Valor Contratado com máscara BRL (padrão BUG-001/S7)
- [ ] Skeleton loaders, empty state, toast de feedback
- [ ] Rota protegida com `RoleGuard(['admin'])`

**Executor:** @dev | **Quality Gate:** @architect

---

### S11.3 — Vínculo Fornecedor ↔ Ordem (6 pts)

**Objetivo:** Secretaria pode selecionar um fornecedor ao criar uma ordem; detalhe da ordem exibe os dados do fornecedor.

**Acceptance Criteria:**
- [ ] `NovaOrdemPage.tsx`: campo Select "Fornecedor (opcional)" carrega fornecedores ativos da secretaria + globais via `GET /api/fornecedores`
- [ ] Select com busca por nome/CNPJ (debounce 300ms)
- [ ] Ordem criada com `fornecedor_id` salvo no banco quando selecionado
- [ ] Guard de obrigatoriedade lê `FORNECEDOR_REQUIRED_FOR_TYPES` do config — se tipo da ordem estiver na lista, campo vira obrigatório (label `*`, botão desabilitado se vazio)
- [ ] `OrderDetailModal.tsx`: exibe card "Fornecedor" com razão social, CNPJ, Nº processo e valor contratado quando `fornecedor_id` presente
- [ ] `GET /api/ordens/{id}` retorna objeto `fornecedor` nested no response
- [ ] Back-end valida que fornecedor existe e está ativo (HTTP 422 se inativo)
- [ ] Testes: criação com fornecedor, criação sem fornecedor, fornecedor inativo retorna erro

**Executor:** @dev | **Quality Gate:** @architect

---

### S12.1 — Pré-preenchimento de Dados Bancários no Pagamento (5 pts)

**Objetivo:** Tesouraria vê os dados bancários do fornecedor no modal de pagamento para evitar erros.

**Acceptance Criteria:**
- [ ] `PagamentoModal.tsx`: quando a ordem tem `fornecedor`, exibir card "Dados Bancários do Fornecedor" com banco, agência, conta e tipo (somente-leitura)
- [ ] Card exibido ANTES dos campos de pagamento (valor, data, forma)
- [ ] Card com badge "Fornecedor Vinculado" mostrando razão social + CNPJ formatado
- [ ] Se ordem não tem fornecedor, o card não aparece (sem alteração do comportamento atual)
- [ ] Dados bancários são informativos — não preenchem automaticamente campos do formulário de pagamento

**Executor:** @dev | **Quality Gate:** @dev

---

### S12.2 — Visibilidade de Fornecedores para Perfis Operacionais (3 pts)

**Objetivo:** Gabinete, Controladoria, Tesouraria e Contabilidade acessam a lista de fornecedores; Secretaria vê os da sua secretaria.

**Acceptance Criteria:**
- [ ] Nova rota `/fornecedores` (read-only) no menu lateral para: `gabinete`, `controladoria`, `contabilidade`, `tesouraria`
- [ ] Mesma tela de listagem (sem botões de editar/criar/desativar)
- [ ] Secretaria acessa a mesma rota `/fornecedores` mas vê apenas fornecedores globais + os da sua secretaria
- [ ] `OrderDetailModal.tsx` para todos os perfis: exibe card do fornecedor quando vinculado à ordem
- [ ] `RoleGuard` configurado corretamente — admin vê a rota com ações; demais perfis veem read-only

**Executor:** @dev | **Quality Gate:** @architect

---

### S12.3 — Relatório de Gastos por Fornecedor (8 pts)

**Objetivo:** Todos os perfis financeiros e o gabinete têm visão consolidada de gastos por fornecedor no período.

**Acceptance Criteria:**
- [ ] Novo endpoint `GET /api/dashboard/gastos-fornecedor?data_inicio=&data_fim=&secretaria_id=` retorna lista com: `fornecedor_id`, `razao_social`, `cnpj`, `total_pago`, `count_ordens`, `secretaria_nome`
- [ ] Apenas ordens com status `PAGA` são contabilizadas (usa `valor_pago`)
- [ ] Scoping: secretaria vê apenas ordens da própria secretaria; demais perfis veem todas
- [ ] Dashboard Gabinete (US-011): nova aba/seção "Gastos por Fornecedor" com tabela + gráfico de barras (Recharts) por mês
- [ ] Tela Controladoria, Tesouraria, Contabilidade: link "Gastos por Fornecedor" no menu → página de relatório com filtros período + secretaria
- [ ] Filtros: período (data início/fim), secretaria (para perfis globais)
- [ ] Exportação: botão "Exportar CSV" com nome, CNPJ, total, nº ordens
- [ ] Skeleton loaders, empty state quando não há dados no período

**Executor:** @dev | **Quality Gate:** @architect

---

## Compatibilidade e Riscos

### Compatibilidade
- [ ] `fornecedor_id` em `ordens` é nullable no banco — ordens históricas não são afetadas
- [ ] `ON DELETE SET NULL` na FK — desativar fornecedor não quebra ordens históricas
- [ ] `GET /api/ordens` e schemas Pydantic: campo `fornecedor` é opcional no response — clientes existentes não quebram
- [ ] UI: novo campo "Fornecedor *" em NovaOrdemPage é obrigatório — botão desabilitado sem seleção

### Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| CNPJ inválido cadastrado | Baixa | Validação de formato + dígitos verificadores no backend |
| Fornecedor desativado vinculado a ordem em andamento | Média | Backend rejeita novas criações; ordens existentes mantêm vínculo histórico |
| Performance da query de gastos em volume alto | Baixa | Índices em `ordens(fornecedor_id, status, created_at)`; query com período obrigatório |
| Dados bancários exibidos indevidamente | Baixa | Dados bancários só aparecem no PagamentoModal (perfil tesouraria) |

### Rollback
- Remover `fornecedor_id` de `ordens` via migration reversa (dados perdidos apenas se campo preenchido)
- Desativar rotas via feature flag temporária em `main.py`

---

## Definition of Done (Global)

- [ ] Todos os stories completados com ACs verificados
- [ ] 0 regressões nos 91 testes existentes
- [ ] Novos testes adicionados para cada regra de negócio crítica
- [ ] TypeScript: zero erros (`npx tsc --noEmit`)
- [ ] RBAC validado em todos os endpoints novos/modificados
- [ ] Ordem histórica mantida intacta (append-only)
- [ ] INDEX.md atualizado com Sprints 11 e 12
- [ ] Migrations Alembic reversíveis e documentadas

---

## Handoff para @sm (Story Manager)

"River, por favor crie os 6 stories deste epic para o sistema de Gestão de OS e Compras Públicas da Prefeitura Municipal. Contexto crítico:

- **Sistema brownfield maduro** — FastAPI + SQLAlchemy async + React 18 + TypeScript strict. 91 testes passando. Arquitetura 3 camadas (Routes → Services → Models).
- **Padrão de upload de documentos**: `uploadDocumento(orderId, { file, descricao })` onde `descricao` é o tipo de negócio.
- **Padrão RBAC**: `Depends(require_role(RoleEnum.X))` no backend; `RoleGuard` + botões ocultos (não desabilitados) no frontend.
- **Padrão de valor monetário**: `type='text'` com `parseBRL`/`formatCurrencyInput` de `utils/formatters.ts` (BUG-001).
- **Padrão de append-only**: `ordem_historico` e `audit_logs` nunca sofrem UPDATE/DELETE.
- **fornecedor_id em ordens**: nullable no banco (preservar histórico), mas **obrigatório no schema Pydantic** `OrdemCreate` — toda nova ordem deve ter fornecedor.
- **Sem `FORNECEDOR_REQUIRED_FOR_TYPES`**: campo é sempre obrigatório para todos os tipos (Compra, Serviço, Obra) — confirmado pelo cliente.
- **Scoping de secretaria em fornecedores**: `secretaria_id IS NULL` = global (todos veem); `secretaria_id = X` = apenas secretaria X.

Sequência obrigatória: S11.1 → S11.2 → S11.3 → S12.1 → S12.2 → S12.3. Cada story depende do anterior."

---

*Epic E11 criado por Morgan (Strategist) — Synkra AIOS | 2026-03-02*
