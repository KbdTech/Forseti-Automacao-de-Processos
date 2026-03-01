# Índice de Stories — Sistema de Gestão de OS e Compras Públicas

> **Projeto:** Forseti Automações
> **Gerado por:** Pax (PO Agent) — Synkra AIOS
> **Atualizado:** 2026-02-28
> **Total:** 23 itens (16 US + 5 melhorias/bugs + 2 spikes) | 8 Sprints

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
| BUG-001 | [S7.1-BUG001-formatacao-valor.story.md](./S7.1-BUG001-formatacao-valor.story.md) | Formatação de campos de valor monetário | Ready |
| UX-001 | [S7.2-UX001-fechar-modal-apos-acao.story.md](./S7.2-UX001-fechar-modal-apos-acao.story.md) | Fechar modal após ação confirmada | Ready |
| US-021 | [S7.3-US021-minhas-ordens-readonly.story.md](./S7.3-US021-minhas-ordens-readonly.story.md) | Minhas Ordens: modo somente leitura | Ready |
| US-017 | [S7.4-US017-upload-documento-empenho.story.md](./S7.4-US017-upload-documento-empenho.story.md) | Upload obrigatório de documento de empenho | Ready |
| US-018 | [S7.5-US018-melhorias-atesto-nf.story.md](./S7.5-US018-melhorias-atesto-nf.story.md) | Melhorias no atesto: NF + docs extras + DLD | Ready |
| US-020 | [S7.6-US020-upload-comprovante-pagamento.story.md](./S7.6-US020-upload-comprovante-pagamento.story.md) | Upload opcional de comprovante de pagamento | Ready |

---

## Sprint 8 — Assinatura da Secretaria na Liquidação (planejada)
**Objetivo:** Novo status intermediário + pipeline de assinatura + spike de assinatura digital.

| ID | Arquivo | Título | Status |
|----|---------|--------|--------|
| US-019 | [S8.1-US019-assinatura-secretaria-liquidacao.story.md](./S8.1-US019-assinatura-secretaria-liquidacao.story.md) | Assinatura da secretaria na liquidação | Draft |

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
| S7 | BUG-001, UX-001, US-017, US-018, US-020, US-021 | Melhorias Pipeline + UX | 🔄 Em andamento |
| S8 | US-019 | Assinatura Liquidação | 📋 Planejada |

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

*Índice gerado por Pax (PO Agent) — Synkra AIOS | 2026-02-26*
