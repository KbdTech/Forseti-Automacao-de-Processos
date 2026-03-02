# Índice de Stories — Sistema de Gestão de OS e Compras Públicas

> **Projeto:** Forseti Automações
> **Gerado por:** Pax (PO Agent) — Synkra AIOS
> **Atualizado:** 2026-03-02
> **Total:** 32 itens (20 US + 9 melhorias/bugs + 1 agrupado/UX + 2 spikes) | 10 Sprints

---

## Sprint 1 — Autenticação e RBAC (Semanas 1–2)
**Objetivo:** Sistema acessível com login real e controle de rotas por perfil.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-001 | [S1.1-US001-login-credenciais.story.md](./S1.1-US001-login-credenciais.story.md) | Login com Credenciais Institucionais | 8 pts | Ready |
| US-002 | [S1.2-US002-rbac-perfis.story.md](./S1.2-US002-rbac-perfis.story.md) | Controle de Acesso por Perfil (RBAC) | 8 pts | Ready |

**Sprint 1 Total:** 16 pontos

---

## Sprint 2 — Criação e Acompanhamento de Ordens (Semanas 3–4)
**Objetivo:** Secretarias criam e acompanham ordens reais no banco.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-003 | [S2.1-US003-nova-ordem.story.md](./S2.1-US003-nova-ordem.story.md) | Criação de Nova Ordem de Serviço ou Compra | 13 pts | Ready |
| US-004 | [S2.2-US004-acompanhamento-ordens.story.md](./S2.2-US004-acompanhamento-ordens.story.md) | Acompanhamento de Ordens pela Secretaria | 8 pts | Ready |

**Sprint 2 Total:** 21 pontos

---

## Sprint 3 — Workflow de Aprovação (Semanas 5–6)
**Objetivo:** Gabinete e Controladoria operam o fluxo de aprovação real.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-005 | [S3.1-US005-gabinete-aprovacao.story.md](./S3.1-US005-gabinete-aprovacao.story.md) | Análise e Decisão do Gabinete do Prefeito | 13 pts | Ready |
| US-006 | [S3.2-US006-reenvio-devolvida.story.md](./S3.2-US006-reenvio-devolvida.story.md) | Reenvio de Ordem Devolvida pela Secretaria | 5 pts | Ready |
| US-007 | [S3.3-US007-controladoria-conformidade.story.md](./S3.3-US007-controladoria-conformidade.story.md) | Análise de Conformidade pela Controladoria | 8 pts | Ready |

**Sprint 3 Total:** 26 pontos

---

## Sprint 4 — Pipeline Financeiro (Semanas 7–8)
**Objetivo:** Ciclo financeiro completo de empenho a pagamento.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-008 | [S4.1-US008-empenho.story.md](./S4.1-US008-empenho.story.md) | Registro de Empenho pela Contabilidade | 8 pts | Ready |
| US-009 | [S4.2-US009-atesto-nota-fiscal.story.md](./S4.2-US009-atesto-nota-fiscal.story.md) | Atesto de Nota Fiscal pela Secretaria | 8 pts | Ready |
| US-010 | [S4.3-US010-liquidacao-pagamento.story.md](./S4.3-US010-liquidacao-pagamento.story.md) | Liquidação e Pagamento (Contabilidade/Tesouraria) | 8 pts | Ready |

**Sprint 4 Total:** 24 pontos

---

## Sprint 5 — Dashboard e Auditoria (Semanas 9–10)
**Objetivo:** Visibilidade executiva e rastreabilidade total.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-011 | [S5.1-US011-dashboard-executivo.story.md](./S5.1-US011-dashboard-executivo.story.md) | Dashboard Executivo com KPIs e Gráficos | 13 pts | Ready |
| US-012 | [S5.2-US012-audit-log.story.md](./S5.2-US012-audit-log.story.md) | Log de Auditoria e Histórico de Tramitação | 8 pts | Ready |

**Sprint 5 Total:** 21 pontos

---

## Sprint 6 — Administração e Notificações (Semanas 11–12)
**Objetivo:** Gestão da plataforma e alertas automáticos por e-mail.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-013 | [S6.1-US013-gestao-secretarias.story.md](./S6.1-US013-gestao-secretarias.story.md) | Gestão de Secretarias pelo Administrador | 5 pts | Ready |
| US-014 | [S6.2-US014-notificacoes-email.story.md](./S6.2-US014-notificacoes-email.story.md) | Notificações por E-mail em Mudança de Etapa | 8 pts | Ready |

**Sprint 6 Total:** 13 pontos

---

## Sprint 7 — Melhorias de Pipeline e UX (em andamento)
**Objetivo:** Correções de formatação, UX de modais, uploads obrigatórios e modo somente leitura.

| ID | Arquivo | Título | Status |
|----|---------|--------|--------|
| BUG-001 | [S7.1-BUG001-formatacao-valor.story.md](./S7.1-BUG001-formatacao-valor.story.md) | Formatação de campos de valor monetário | Done |
| UX-001 | [S7.2-UX001-fechar-modal-apos-acao.story.md](./S7.2-UX001-fechar-modal-apos-acao.story.md) | Fechar modal após ação confirmada | Done |
| US-021 | [S7.3-US021-minhas-ordens-readonly.story.md](./S7.3-US021-minhas-ordens-readonly.story.md) | Minhas Ordens: modo somente leitura | Done |
| US-017 | [S7.4-US017-upload-documento-empenho.story.md](./S7.4-US017-upload-documento-empenho.story.md) | Upload obrigatório de documento de empenho | Done |
| US-018 | [S7.5-US018-melhorias-atesto-nf.story.md](./S7.5-US018-melhorias-atesto-nf.story.md) | Melhorias no atesto: NF + docs extras + DLD | Done |
| US-020 | [S7.6-US020-upload-comprovante-pagamento.story.md](./S7.6-US020-upload-comprovante-pagamento.story.md) | Upload opcional de comprovante de pagamento | Done |

---

## Sprint 8 — Assinatura da Secretaria na Liquidação
**Objetivo:** Novo status intermediário + pipeline de assinatura + spike de assinatura digital.

| ID | Arquivo | Título | Status |
|----|---------|--------|--------|
| US-019 | [S8.1-US019-assinatura-secretaria-liquidacao.story.md](./S8.1-US019-assinatura-secretaria-liquidacao.story.md) | Assinatura da secretaria na liquidação | Done |

---

## Sprint 9 — Correções, UX e Estabilidade ✅
**Objetivo:** Corrigir bugs críticos de layout e formatação, tornar Documentos Extras e de suporte obrigatórios, reformular UX da assinatura na liquidação, adicionar auto-refresh no Pipeline de Pagamento e polir consistência visual (valores R$, labels, nomes de secretaria).

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| BUG-002 | [S9.1-BUG002-layout-descricao-valor-estimado.story.md](./S9.1-BUG002-layout-descricao-valor-estimado.story.md) | Layout: Descrição sobrepõe Valor Estimado em Minhas Ordens | 2 pts | Draft |
| BUG-003 | [S9.2-BUG003-formatacao-valor-estimado-reenvio.story.md](./S9.2-BUG003-formatacao-valor-estimado-reenvio.story.md) | Valor Estimado com formatação incorreta ao editar ordem devolvida | 3 pts | Draft |
| UX-002 | [S9.3-UX002-documentos-extras-obrigatorio-atesto.story.md](./S9.3-UX002-documentos-extras-obrigatorio-atesto.story.md) | Documentos Extras obrigatório no Atesto | 3 pts | Draft |
| US-022 | [S9.4-US022-reformulacao-ux-assinatura-liquidacao.story.md](./S9.4-US022-reformulacao-ux-assinatura-liquidacao.story.md) | Reformulação UX do fluxo de Assinatura na Liquidação | 8 pts | Draft |
| US-023 | [S9.5-US023-auto-refresh-pipeline-pagamento.story.md](./S9.5-US023-auto-refresh-pipeline-pagamento.story.md) | Auto-refresh e Botão de Refresh no Pipeline de Pagamento | 5 pts | Draft |
| S9.6 | [S9.6-polimentos-ui-ux.story.md](./S9.6-polimentos-ui-ux.story.md) | Polimentos UI/UX: Formatação R$, Labels, Nomes de Secretaria e Docs Obrigatórios na Nova Ordem | 8 pts | Draft |

**Sprint 9 Total:** 29 pontos

---

## Resumo Geral

| Sprint | Items | Objetivo | Status |
|--------|-------|----------|--------|
| S1 | US-001, US-002 | Autenticação + RBAC | ✅ Done |
| S2 | US-003, US-004 | Criação + Acompanhamento | ✅ Done |
| S3 | US-005, US-006, US-007 | Workflow de Aprovação | ✅ Done |
| S4 | US-008, US-009, US-010 | Pipeline Financeiro | ✅ Done |
| S5 | US-011, US-012 | Dashboard + Auditoria | ✅ Done |
| S6 | US-013, US-014 | Admin + Notificações | ✅ Done |
| S7 | BUG-001, UX-001, US-017, US-018, US-020, US-021 | Melhorias Pipeline + UX | ✅ Done |
| S8 | US-019 | Assinatura Liquidação | ✅ Done |
| S9 | BUG-002, BUG-003, UX-002, US-022, US-023, S9.6 | Correções, UX e Estabilidade | ✅ Done |
| S10 | US-024, US-025, UX-004 | Filtros, Admin e Comprovante Obrigatório | ✅ Done |
| S11 | S11.1, S11.2, S11.3 | Módulo Fornecedores — Fundação | 🔜 Planejada |
| S12 | S12.1, S12.2, S12.3 | Módulo Fornecedores — Pipeline e Relatórios | ✅ Done |
| S13 | S13.1, S13.2 | Perfil `compras` — Setor de Compras/Licitações | 📋 Draft |

---

## Mapa de Dependências

```
US-001 ──► US-002 ──► US-003 ──► US-004
                               │
                               ▼
                US-005 ──► US-006
                  │
                  ▼
                US-007 ──► US-008 ──► US-009 ──► US-010
                  │                     │
                  ▼                     ▼
                US-011 ◄──────────── US-011
                US-012
                  │
           US-001─┘

US-001, US-002 ──► US-013
US-005, US-007, US-009 ──► US-014
```

---

## Checklist Global de Qualidade

Todo story deve ter estes itens antes de ser marcado como Done:

- [ ] Todos os cenários Gherkin cobertos e testados
- [ ] Regras de negócio implementadas no back-end (nunca só no front-end)
- [ ] Validação de role no endpoint (`require_role`)
- [ ] Transição de status validada pelo workflow engine
- [ ] Registro em `ordem_historico` após toda transição
- [ ] Tratamento de erros com mensagens em pt-BR
- [ ] Loading states e empty states no front-end
- [ ] Modal de confirmação antes de ações críticas
- [ ] Responsividade básica (mobile-friendly)
- [ ] Testes pytest para regras de negócio críticas

---

---

## Sprint 10 — Filtros, Admin e Comprovante Obrigatório ✅
**Objetivo:** Adicionar filtros de busca em Minhas Ordens, mecanismo de reset de senha pelo admin e tornar o comprovante de pagamento obrigatório.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| US-024 | [S10.1-US024-filtros-minhas-ordens.story.md](./S10.1-US024-filtros-minhas-ordens.story.md) | Filtros em Minhas Ordens: Período e Prioridade | 8 pts | Done |
| US-025 | [S10.2-US025-admin-resetar-senha.story.md](./S10.2-US025-admin-resetar-senha.story.md) | Admin: Resetar Senha de Usuário | 5 pts | Done |
| UX-004 | [S10.3-UX004-comprovante-pagamento-obrigatorio.story.md](./S10.3-UX004-comprovante-pagamento-obrigatorio.story.md) | Comprovante de Pagamento Obrigatório | 3 pts | Done |

**Sprint 10 Total:** 16 pontos

---

---

## Sprint 11 — Módulo Fornecedores: Fundação (planejada)
**Objetivo:** Criar o modelo de dados, API CRUD e telas de gestão de fornecedores vencedores de licitação.
**Epic:** [EPIC-E11-fornecedores-licitacao.md](./EPIC-E11-fornecedores-licitacao.md)

| ID | Arquivo | Título | Estimativa | Executor | Status |
|----|---------|--------|-----------|---------|--------|
| S11.1 | [S11.1-modelo-dados-api-fornecedores.story.md](./S11.1-modelo-dados-api-fornecedores.story.md) | Modelo de Dados e API de Fornecedores | 5 pts | @data-engineer | Draft |
| S11.2 | [S11.2-gestao-fornecedores-tela-admin.story.md](./S11.2-gestao-fornecedores-tela-admin.story.md) | Gestão de Fornecedores — Tela Admin | 8 pts | @dev | Draft |
| S11.3 | [S11.3-vinculo-fornecedor-ordem.story.md](./S11.3-vinculo-fornecedor-ordem.story.md) | Vínculo Fornecedor ↔ Ordem (Nova Ordem + Detalhe) | 6 pts | @dev | Draft |

**Sprint 11 Total:** 19 pontos

---

## Sprint 12 — Módulo Fornecedores: Pipeline e Relatórios (planejada)
**Objetivo:** Pré-preencher dados bancários no pagamento, expor fornecedores a todos os perfis e criar relatório de gastos.
**Epic:** [EPIC-E11-fornecedores-licitacao.md](./EPIC-E11-fornecedores-licitacao.md)

| ID | Arquivo | Título | Estimativa | Executor | Status |
|----|---------|--------|-----------|---------|--------|
| S12.1 | [S12.1-preenchimento-dados-bancarios-pagamento.story.md](./S12.1-preenchimento-dados-bancarios-pagamento.story.md) | Pré-preenchimento de Dados Bancários no Pagamento | 5 pts | @dev | Draft |
| S12.2 | [S12.2-visibilidade-fornecedores-perfis-operacionais.story.md](./S12.2-visibilidade-fornecedores-perfis-operacionais.story.md) | Visibilidade de Fornecedores para Perfis Operacionais | 3 pts | @dev | Draft |
| S12.3 | [S12.3-relatorio-gastos-fornecedor.story.md](./S12.3-relatorio-gastos-fornecedor.story.md) | Relatório de Gastos por Fornecedor (multi-perfil) | 8 pts | @dev | Draft |

**Sprint 12 Total:** 16 pontos

---

---

## Sprint 13 — Perfil `compras` — Setor de Compras/Licitações (planejada)
**Objetivo:** Criar perfil de acesso exclusivo para o Setor de Compras gerenciar fornecedores sem participar do fluxo de ordens.

| ID | Arquivo | Título | Estimativa | Status |
|----|---------|--------|-----------|--------|
| S13.1 | [S13.1-perfil-compras-backend.story.md](./S13.1-perfil-compras-backend.story.md) | Backend: enum `compras` + migration + RBAC em fornecedores | 3 pts | Draft |
| S13.2 | [S13.2-perfil-compras-frontend.story.md](./S13.2-perfil-compras-frontend.story.md) | Frontend: role guard, sidebar e rota para perfil `compras` | 3 pts | Draft |

**Sprint 13 Total:** 6 pontos

---

*Índice gerado por Pax (PO Agent) — Synkra AIOS | 2026-03-02*
