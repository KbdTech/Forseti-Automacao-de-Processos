/**
 * Service do Log de Auditoria — US-012.
 *
 * Encapsula chamadas à API REST /api/audit-logs.
 * US-012 RN-60: log append-only — somente leitura no front-end.
 * US-012 RN-62: acesso exclusivo para admin.
 */

import apiClient from '@/services/apiClient'

// ---------------------------------------------------------------------------
// Tipos de resposta
// ---------------------------------------------------------------------------

export interface AuditLogItem {
  id: string
  user_id: string | null
  /** Nome completo do usuário (null se usuário não existir). */
  user_nome: string | null
  /** Ação auditada: login_success, logout, login_failed_*, etc. */
  action: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface PaginatedAuditLog {
  items: AuditLogItem[]
  total: number
  page: number
  limit: number
  pages: number
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export interface AuditLogFilters {
  usuario_id?: string
  /** Nome exato da ação (login_success, logout, etc.). */
  acao?: string
  /** Início do período (YYYY-MM-DD). */
  data_inicio?: string
  /** Fim do período (YYYY-MM-DD). */
  data_fim?: string
  secretaria_id?: string
  page?: number
  limit?: number
}

// ---------------------------------------------------------------------------
// Funções de acesso à API
// ---------------------------------------------------------------------------

/**
 * GET /api/audit-logs
 *
 * US-012 RN-62: acesso exclusivo para admin.
 * US-012 RN-60: log append-only — somente leitura.
 */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<PaginatedAuditLog> {
  const params: Record<string, string | number> = {}

  if (filters.usuario_id) params.usuario_id = filters.usuario_id
  if (filters.acao) params.acao = filters.acao
  if (filters.data_inicio) params.data_inicio = filters.data_inicio
  if (filters.data_fim) params.data_fim = filters.data_fim
  if (filters.secretaria_id) params.secretaria_id = filters.secretaria_id
  if (filters.page) params.page = filters.page
  if (filters.limit) params.limit = filters.limit

  const { data } = await apiClient.get<PaginatedAuditLog>('/api/audit-logs', { params })
  return data
}
