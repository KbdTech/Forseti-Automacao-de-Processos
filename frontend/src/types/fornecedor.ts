/**
 * Tipos de domínio — Fornecedores (S11.1/S11.2).
 */

export interface FornecedorResponse {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string
  numero_processo: string | null
  objeto_contrato: string | null
  valor_contratado: number | null
  data_contrato: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string
  secretaria_id: string | null
  secretaria_nome: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FornecedorListResponse {
  items: FornecedorResponse[]
  total: number
  page: number
  pages: number
}

export interface FornecedoresFilters {
  q?: string
  secretaria_id?: string
  is_active?: boolean
  page?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Resumo financeiro — GET /api/fornecedores/{id}/resumo
// ---------------------------------------------------------------------------

export interface GastoMes {
  /** Mês no formato "YYYY-MM" */
  mes: string
  total_pago: number
  count_ordens: number
}

export interface OrdemResumoItem {
  id: string
  protocolo: string
  status: string
  valor_pago: number | null
  data_pagamento: string | null
  secretaria_nome: string | null
}

export interface FornecedorResumo extends FornecedorResponse {
  /** Total já pago em ordens com status PAGA. */
  total_pago: number
  total_ordens_pagas: number
  /** Saldo disponível (valor_contratado − total_pago). */
  saldo_disponivel: number
  /** Percentual do contrato utilizado (0–100). */
  percentual_utilizado: number
  /** Dados mensais para gráfico de barras. */
  gastos_por_mes: GastoMes[]
  /** Até 10 últimas ordens pagas. */
  ultimas_ordens: OrdemResumoItem[]
}
