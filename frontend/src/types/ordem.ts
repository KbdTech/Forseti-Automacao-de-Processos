/**
 * Tipos de Ordens de Serviço — US-003 a US-010.
 *
 * Sincronizado com o back-end: app/schemas/ordem.py e app/models/enums.py.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** US-003 RN-16: tipo de ordem obrigatório. Sincronizado com TipoLiteral do back-end. */
export type TipoOrdem = 'compra' | 'servico' | 'obra'

/** US-003 RN-17: prioridade obrigatória. Sincronizado com PrioridadeLiteral do back-end. */
export type Prioridade = 'normal' | 'alta' | 'urgente'

/**
 * US-003 RN-20 e seção 6 do CLAUDE.md: máquina de estados das ordens.
 * 14 status possíveis (US-019 adicionou AGUARDANDO_ASSINATURA_SECRETARIA).
 */
export type StatusOrdem =
  | 'AGUARDANDO_GABINETE'
  | 'AGUARDANDO_CONTROLADORIA'
  | 'AGUARDANDO_EMPENHO'
  | 'AGUARDANDO_EXECUCAO'
  | 'AGUARDANDO_ATESTO'
  | 'AGUARDANDO_LIQUIDACAO'
  /** US-019: status intermediário — secretaria assina documento de liquidação. */
  | 'AGUARDANDO_ASSINATURA_SECRETARIA'
  | 'AGUARDANDO_PAGAMENTO'
  | 'DEVOLVIDA_PARA_ALTERACAO'
  | 'AGUARDANDO_DOCUMENTACAO'
  | 'COM_IRREGULARIDADE'
  | 'EXECUCAO_COM_PENDENCIA'
  | 'CANCELADA'
  | 'PAGA'

// ---------------------------------------------------------------------------
// Entidades auxiliares
// ---------------------------------------------------------------------------

/**
 * Dados básicos do fornecedor vinculado a uma ordem — S11.1/S11.3.
 * Nullable no response para compatibilidade com ordens históricas sem fornecedor.
 */
export interface FornecedorBasico {
  id: string
  razao_social: string
  nome_fantasia?: string | null
  cnpj: string
  numero_processo: string | null
  valor_contratado: number | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/** Entrada do histórico de tramitação. US-012 RN-61. */
export interface OrdemHistorico {
  id: string
  ordem_id: string
  usuario_id: string
  /** Nome completo do usuário que executou a ação. */
  usuario_nome: string
  perfil: string
  acao: string
  status_anterior: StatusOrdem | null
  status_novo: StatusOrdem
  observacao: string | null
  ip_address: string | null
  created_at: string
}

/** Dados completos de uma ordem (GET /api/ordens/:id). */
export interface Ordem {
  id: string
  /** Protocolo no padrão OS-ANO-SEQUENCIAL. US-003 RN-13. */
  protocolo: string
  tipo: TipoOrdem
  prioridade: Prioridade
  secretaria_id: string
  secretaria_nome: string
  criado_por: string
  criador_nome: string
  responsavel: string | null
  descricao: string | null
  valor_estimado: number
  justificativa: string
  status: StatusOrdem
  /** Incrementado a cada reenvio. US-006 RN-35. */
  versao: number
  /** US-016: true se a OS foi assinada digitalmente via GovBR (declaração do usuário). */
  assinatura_govbr: boolean

  // Campos financeiros (nullable até preenchidos no fluxo)
  numero_empenho: string | null
  valor_empenhado: number | null
  data_empenho: string | null
  numero_nf: string | null
  data_atesto: string | null
  atestado_por: string | null
  valor_liquidado: number | null
  data_liquidacao: string | null
  valor_pago: number | null
  data_pagamento: string | null
  forma_pagamento: 'transferencia' | 'cheque' | 'pix' | null

  /** S11.1/S11.3: fornecedor vencedor da licitação (null em ordens históricas sem vínculo). */
  fornecedor?: FornecedorBasico | null

  created_at: string
  updated_at: string
}

/** Ordem com histórico completo (GET /api/ordens/:id — detail). */
export interface OrdemDetail extends Ordem {
  historico: OrdemHistorico[]
}

// ---------------------------------------------------------------------------
// Resposta paginada
// ---------------------------------------------------------------------------

export interface OrdemListResponse {
  items: Ordem[]
  total: number
  page: number
  limit: number
  pages: number
}

// ---------------------------------------------------------------------------
// Payloads de request
// ---------------------------------------------------------------------------

/**
 * POST /api/ordens
 * US-003 RN-13 a RN-20.
 */
export interface OrdemCreatePayload {
  tipo: TipoOrdem
  prioridade: Prioridade
  responsavel?: string
  descricao?: string
  /** US-003 RN-18: deve ser positivo. */
  valor_estimado: number
  /** US-003 RN-19: mínimo de 50 caracteres. */
  justificativa: string
  /** US-016: indica se a OS foi assinada via GovBR. Default: false. */
  assinatura_govbr?: boolean
  /** S11.1/S11.3: obrigatório em todas as novas ordens. */
  fornecedor_id: string
}

/**
 * PUT /api/ordens/:id
 * US-006 RN-32: apenas ordens DEVOLVIDA_PARA_ALTERACAO.
 * US-006 RN-33: protocolo e secretaria não podem ser alterados.
 */
export interface OrdemUpdatePayload {
  tipo?: TipoOrdem
  prioridade?: Prioridade
  responsavel?: string
  descricao?: string
  valor_estimado?: number
  justificativa?: string
  /** US-016: atualiza indicador de assinatura GovBR. */
  assinatura_govbr?: boolean
}

/**
 * PATCH /api/ordens/:id/acao — campo base.
 * Cada ação pode ter campos extras (veja AcaoPayload).
 */
export interface AcaoPayload {
  acao: string
  observacao?: string
  // Empenho
  numero_empenho?: string
  valor_empenhado?: number
  // Atesto
  numero_nf?: string
  // Liquidação
  valor_liquidado?: number
  data_liquidacao?: string
  // Pagamento
  valor_pago?: number
  data_pagamento?: string
  forma_pagamento?: 'transferencia' | 'cheque' | 'pix'
}

// ---------------------------------------------------------------------------
// Filtros de listagem
// ---------------------------------------------------------------------------

export interface OrdensFilters {
  page?: number
  limit?: number
  status?: StatusOrdem
  protocolo?: string
  secretaria_id?: string
  /** US-024: filtrar por prioridade (NORMAL, ALTA, URGENTE) */
  prioridade?: Prioridade
  /** US-024: filtrar por data de criação — início (YYYY-MM-DD) */
  data_inicio?: string
  /** US-024: filtrar por data de criação — fim (YYYY-MM-DD) */
  data_fim?: string
}
