# PO Agent Memory (Pax)

## Active Patterns
<!-- Current, verified patterns used by this agent -->

### Responsibilities
- Story validation (`*validate-story-draft`) — 10-point checklist
- Backlog management and prioritization
- Story lifecycle: Draft → Ready transition (MUST update status)
- Epic context tracking

### Validation Checklist (10 Points)
1. Clear title
2. Complete description
3. Testable AC (Given/When/Then)
4. Defined scope (IN/OUT)
5. Dependencies mapped
6. Complexity estimate
7. Business value
8. Risks documented
9. Criteria of Done
10. PRD/Epic alignment

### Story File Permissions
- CAN edit: QA Results section (when reviewing)
- MUST update: Status field (Draft → Ready on GO)
- CANNOT modify: AC, Scope, Title, Dev Notes, Testing

### Delegation
- Story creation → @sm (`*draft`)
- Epic creation → @pm (`*create-epic`)
- Course correction → @aios-master

### Key Locations
- Stories: `docs/stories/`
- Backlog: `docs/stories/backlog/`
- Templates: `.aios-core/development/templates/story-tmpl.yaml`

## Backlog Alinhado

### US-016 — Indicador de Assinatura GovBR na Ordem de Serviço
**Status:** Ready for Dev | **Sprint:** S4-complemento | **Prioridade:** Alta

**Contexto do alinhamento (2026-02-27):**
O campo `assinado_govbr` já existe na tabela `documentos` (US-015), mas NÃO na tabela `ordens`.
O requisito é: na própria OS deve haver um indicador booleano `assinatura_govbr` que registra
se o documento da OS foi assinado digitalmente via GovBR — o processo de assinatura em si é
EXTERNO (gov.br/assinatura) e NÃO integrado ao sistema. O campo é informado pelo usuário da
Secretaria no momento de criação ou edição da OS.

**Regras de Negócio:**
- RN-01: `assinatura_govbr` é `boolean`, default `false`
- RN-02: Campo disponível desde a criação da OS (Etapa 1 do StepperForm)
- RN-03: Também editável no formulário de reenvio de ordem devolvida (`EditarOrdemPage`)
- RN-04: O sistema NÃO valida nem integra com o GovBR — apenas registra a declaração do usuário
- RN-05: Deve ser visível (badge/ícone) em todos os painéis onde a OS aparece

**Impacto Backend:**
- `backend/app/models/ordem.py` — adicionar `assinatura_govbr: Mapped[bool] = mapped_column(Boolean, default=False)`
- `backend/app/schemas/ordem.py` — adicionar campo em `OrdemCreate`, `OrdemUpdate`, `OrdemResponse`
- Nova migration Alembic: `008_add_assinatura_govbr_to_ordens.py`

**Impacto Frontend:**
- `src/types/ordem.ts` — adicionar `assinatura_govbr: boolean` em `OrdemResponse` e `OrdemCreate`
- `src/pages/secretaria/NovaOrdemPage.tsx` — checkbox na Etapa 1 (Identificação)
- `src/pages/secretaria/EditarOrdemPage.tsx` — mesmo checkbox no formulário de edição
- `src/components/orders/OrderDetailModal.tsx` — badge "Assinatura GovBR ✓" na seção de dados
- `src/components/workflow/WorkflowTable.tsx` — coluna ou badge na listagem de ordens
- `src/pages/secretaria/MinhasOrdensPage.tsx` — badge opcional na tabela

## Promotion Candidates
<!-- Patterns seen across 3+ agents — candidates for CLAUDE.md or .claude/rules/ -->
<!-- Format: - **{pattern}** | Source: {agent} | Detected: {YYYY-MM-DD} -->

## Archived
<!-- Patterns no longer relevant — kept for history -->
<!-- Format: - ~~{pattern}~~ | Archived: {YYYY-MM-DD} | Reason: {reason} -->
