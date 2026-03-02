/**
 * Service de Fornecedores — S11.1/S11.2.
 *
 * Endpoints:
 *   GET    /api/fornecedores/                — listar (qualquer autenticado, com scoping)
 *   POST   /api/fornecedores/                — criar (admin)
 *   GET    /api/fornecedores/{id}            — detalhar (qualquer autenticado)
 *   PUT    /api/fornecedores/{id}            — editar (admin)
 *   PATCH  /api/fornecedores/{id}/status     — ativar/desativar (admin)
 */

import apiClient from '@/services/apiClient'
import type { FornecedorResponse, FornecedorListResponse, FornecedoresFilters } from '@/types/fornecedor'

export interface FornecedorCreate {
  razao_social: string
  nome_fantasia?: string | null
  cnpj: string
  numero_processo?: string | null
  objeto_contrato?: string | null
  valor_contratado?: number | null
  data_contrato?: string | null
  banco?: string | null
  agencia?: string | null
  conta?: string | null
  tipo_conta?: string
  secretaria_id?: string | null
}

export interface FornecedorUpdate {
  razao_social?: string
  nome_fantasia?: string | null
  numero_processo?: string | null
  objeto_contrato?: string | null
  valor_contratado?: number | null
  data_contrato?: string | null
  banco?: string | null
  agencia?: string | null
  conta?: string | null
  tipo_conta?: string
  secretaria_id?: string | null
}

/** GET /api/fornecedores — lista com filtros, scoping RBAC e paginação. */
export async function listFornecedores(
  filters: FornecedoresFilters = {},
): Promise<FornecedorListResponse> {
  const params: Record<string, unknown> = {}
  if (filters.q) params.q = filters.q
  if (filters.secretaria_id) params.secretaria_id = filters.secretaria_id
  if (filters.is_active !== undefined) params.is_active = filters.is_active
  if (filters.page) params.page = filters.page
  if (filters.limit) params.limit = filters.limit
  const { data } = await apiClient.get<FornecedorListResponse>('/api/fornecedores/', { params })
  return data
}

/** POST /api/fornecedores — cria novo fornecedor (admin). */
export async function createFornecedor(
  payload: FornecedorCreate,
): Promise<FornecedorResponse> {
  const { data } = await apiClient.post<FornecedorResponse>('/api/fornecedores/', payload)
  return data
}

/** PUT /api/fornecedores/{id} — edita dados do fornecedor (admin). CNPJ não é editável. */
export async function updateFornecedor(
  id: string,
  payload: FornecedorUpdate,
): Promise<FornecedorResponse> {
  const { data } = await apiClient.put<FornecedorResponse>(`/api/fornecedores/${id}`, payload)
  return data
}

/** PATCH /api/fornecedores/{id}/status — ativa ou desativa o fornecedor (admin). */
export async function toggleFornecedorStatus(
  id: string,
  isActive: boolean,
): Promise<FornecedorResponse> {
  const { data } = await apiClient.patch<FornecedorResponse>(
    `/api/fornecedores/${id}/status`,
    { is_active: isActive },
  )
  return data
}
