/**
 * Service de Ordens de Serviço — US-003 a US-010.
 *
 * Encapsula todas as chamadas à API REST /api/ordens/*.
 * Usa o apiClient com interceptors JWT.
 */

import apiClient from '@/services/apiClient'
import type {
  AcaoPayload,
  Ordem,
  OrdemCreatePayload,
  OrdemDetail,
  OrdemListResponse,
  OrdemUpdatePayload,
  OrdensFilters,
} from '@/types/ordem'

/**
 * POST /api/ordens
 *
 * US-003: somente perfil 'secretaria' pode criar.
 * US-003 RN-13: protocolo gerado automaticamente no back-end.
 * US-003 RN-20: status inicial = AGUARDANDO_GABINETE.
 */
export async function createOrdem(payload: OrdemCreatePayload): Promise<Ordem> {
  const { data } = await apiClient.post<Ordem>('/api/ordens/', payload)
  return data
}

/**
 * GET /api/ordens
 *
 * US-004 RN-21: secretaria vê apenas ordens da própria secretaria (filtro no back-end).
 * US-004 RN-24: paginação padrão de 20 registros.
 * US-004 RN-25: busca por protocolo é exata.
 */
export async function listOrdens(filters: OrdensFilters = {}): Promise<OrdemListResponse> {
  const params: Record<string, string | number> = {}

  if (filters.page) params.page = filters.page
  if (filters.limit) params.limit = filters.limit
  if (filters.status) params.status = filters.status
  if (filters.protocolo) params.protocolo = filters.protocolo
  if (filters.secretaria_id) params.secretaria_id = filters.secretaria_id

  const { data } = await apiClient.get<OrdemListResponse>('/api/ordens/', { params })
  return data
}

/**
 * GET /api/ordens/:id
 *
 * Retorna detalhe completo com histórico de tramitação.
 * US-004 RN-22: histórico em ordem cronológica.
 * US-012 RN-61: campos completos de auditoria.
 */
export async function getOrdem(id: string): Promise<OrdemDetail> {
  const { data } = await apiClient.get<OrdemDetail>(`/api/ordens/${id}`)
  return data
}

/**
 * PUT /api/ordens/:id
 *
 * US-006 RN-32: somente ordens DEVOLVIDA_PARA_ALTERACAO.
 * US-006 RN-33: protocolo e secretaria permanecem inalterados.
 */
export async function updateOrdem(id: string, payload: OrdemUpdatePayload): Promise<Ordem> {
  const { data } = await apiClient.put<Ordem>(`/api/ordens/${id}`, payload)
  return data
}

/**
 * PATCH /api/ordens/:id/acao
 *
 * Executa uma ação de workflow (autorizar, cancelar, empenhar, atestar, etc.).
 * US-005 a US-010: transições gerenciadas pelo WorkflowEngine no back-end.
 */
export async function executeAcao(id: string, payload: AcaoPayload): Promise<Ordem> {
  const { data } = await apiClient.patch<Ordem>(`/api/ordens/${id}/acao`, payload)
  return data
}
