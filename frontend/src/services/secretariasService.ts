/**
 * Service de Secretarias — US-013.
 *
 * Usado para popular selects e exibir o nome da secretaria do usuário.
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

/** GET /api/secretarias — lista todas (ativas e inativas), ordenadas por nome. */
export async function listSecretarias(): Promise<SecretariaResponse[]> {
  const { data } = await apiClient.get<SecretariaResponse[]>('/api/secretarias/')
  return data
}
