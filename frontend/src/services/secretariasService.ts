/**
 * Service de Secretarias — US-013.
 *
 * Endpoints:
 *   GET    /api/secretarias/        — lista todas (ativas e inativas)
 *   POST   /api/secretarias/        — criar secretaria (admin)
 *   PUT    /api/secretarias/{id}    — editar secretaria (admin)
 *   PATCH  /api/secretarias/{id}/status — ativar/desativar (admin)
 */

import apiClient from '@/services/apiClient'

export interface SecretariaResponse {
  id: string
  nome: string
  sigla: string
  orcamento_anual: number | null
  ativo: boolean
  created_at: string
}

export interface SecretariaCreatePayload {
  nome: string
  sigla: string
  orcamento_anual?: number | null
}

export interface SecretariaUpdatePayload {
  nome?: string
  sigla?: string
  orcamento_anual?: number | null
}

/** GET /api/secretarias — lista todas (ativas e inativas), ordenadas por nome. */
export async function listSecretarias(): Promise<SecretariaResponse[]> {
  const { data } = await apiClient.get<SecretariaResponse[]>('/api/secretarias/')
  return data
}

/** POST /api/secretarias — cria nova secretaria (admin). */
export async function createSecretaria(
  payload: SecretariaCreatePayload,
): Promise<SecretariaResponse> {
  const { data } = await apiClient.post<SecretariaResponse>('/api/secretarias/', payload)
  return data
}

/** PUT /api/secretarias/{id} — edita dados da secretaria (admin). */
export async function updateSecretaria(
  id: string,
  payload: SecretariaUpdatePayload,
): Promise<SecretariaResponse> {
  const { data } = await apiClient.put<SecretariaResponse>(`/api/secretarias/${id}`, payload)
  return data
}

/**
 * PATCH /api/secretarias/{id}/status — ativa ou desativa secretaria (admin).
 * US-013 RN-68: não é possível excluir — apenas desativar.
 */
export async function toggleSecretariaStatus(
  id: string,
  ativo: boolean,
): Promise<SecretariaResponse> {
  const { data } = await apiClient.patch<SecretariaResponse>(
    `/api/secretarias/${id}/status`,
    { ativo },
  )
  return data
}
