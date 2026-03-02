/**
 * Service do Dashboard Executivo — US-011.
 *
 * Encapsula chamadas à API REST /api/dashboard/*.
 * US-011 RN-58: dados agregados pelo back-end — nunca calcular no front-end.
 * US-011 RN-59: atualização a cada 5 minutos ou via refresh manual.
 */

import apiClient from '@/services/apiClient'

// ---------------------------------------------------------------------------
// Tipos de resposta
// ---------------------------------------------------------------------------

export interface KPIs {
  total_ordens: number
  valor_total: number
  em_aberto: number
  pagas: number
  taxa_reprovacao: number
  tempo_medio_dias: number
}

export interface PorEtapa {
  status: string
  count: number
}

export interface PorSecretaria {
  secretaria_nome: string
  valor_estimado_total: number
  valor_pago_total: number
}

export interface StatusPorSecretaria {
  secretaria_nome: string
  status: string
  count: number
}

export interface DashboardSummary {
  kpis: KPIs
  por_etapa: PorEtapa[]
  por_secretaria: PorSecretaria[]
  status_por_secretaria: StatusPorSecretaria[]
}

export interface Gargalo {
  ordem_id: string
  protocolo: string
  secretaria_nome: string
  status: string
  dias_na_etapa: number
}

export interface SecretariaAtencao {
  secretaria_nome: string
  total_ordens: number
  com_problema: number
  percentual: number
}

export interface DashboardAlertas {
  gargalos: Gargalo[]
  secretarias_atencao: SecretariaAtencao[]
}

// ---------------------------------------------------------------------------
// Funções de acesso à API
// ---------------------------------------------------------------------------

/**
 * GET /api/dashboard/summary
 *
 * US-011 RN-55: KPIs calculados no banco — query agregada.
 * US-011 RN-58: dados servidos por endpoint agregado.
 *
 * @param dataInicio ISO 8601 date string (YYYY-MM-DD)
 * @param dataFim    ISO 8601 date string (YYYY-MM-DD)
 * @param secretariaId UUID da secretaria (opcional — admin/gabinete podem filtrar)
 */
export async function getSummary(
  dataInicio: string,
  dataFim: string,
  secretariaId?: string,
): Promise<DashboardSummary> {
  const params: Record<string, string> = {
    data_inicio: dataInicio,
    data_fim: dataFim,
  }
  if (secretariaId) params.secretaria_id = secretariaId

  const { data } = await apiClient.get<DashboardSummary>('/api/dashboard/summary', { params })
  return data
}

// ---------------------------------------------------------------------------
// S12.3 — Gastos por fornecedor
// ---------------------------------------------------------------------------

export interface GastoFornecedorItem {
  fornecedor_id: string
  razao_social: string
  cnpj: string
  total_pago: number
  count_ordens: number
  secretaria_nome: string | null
}

/**
 * GET /api/dashboard/gastos-fornecedor
 *
 * S12.3: gastos consolidados por fornecedor (ordens PAGAS no período).
 * Scoping automático pelo backend:
 *   - secretaria: vê apenas própria secretaria.
 *   - demais: veem tudo (ou filtram por secretaria_id).
 *
 * @param data_inicio YYYY-MM-DD (padrão: 1º dia do mês atual)
 * @param data_fim    YYYY-MM-DD (padrão: hoje)
 * @param secretaria_id UUID (opcional — perfis globais)
 */
export async function getGastosFornecedor(params: {
  data_inicio?: string
  data_fim?: string
  secretaria_id?: string
}): Promise<GastoFornecedorItem[]> {
  const query: Record<string, string> = {}
  if (params.data_inicio) query.data_inicio = params.data_inicio
  if (params.data_fim) query.data_fim = params.data_fim
  if (params.secretaria_id) query.secretaria_id = params.secretaria_id

  const { data } = await apiClient.get<GastoFornecedorItem[]>(
    '/api/dashboard/gastos-fornecedor',
    { params: query },
  )
  return data
}

/**
 * GET /api/dashboard/alertas
 *
 * US-011 RN-56: gargalos = ordens paradas > 5 dias úteis.
 * US-011 RN-57: secretarias com taxa devolução/irregularidade > 20%.
 *
 * Acesso restrito: gabinete e admin.
 */
export async function getAlertas(): Promise<DashboardAlertas> {
  const { data } = await apiClient.get<DashboardAlertas>('/api/dashboard/alertas')
  return data
}
