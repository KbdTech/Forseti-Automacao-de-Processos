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
import type {
  FornecedorResponse,
  FornecedorListResponse,
  FornecedoresFilters,
  FornecedorResumo,
  FornecedorDocumento,
  FornecedorDocumentoDownloadUrl,
} from '@/types/fornecedor'

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

/** GET /api/fornecedores/{id}/resumo — detalhe com estatísticas financeiras. */
export async function getFornecedorResumo(id: string): Promise<FornecedorResumo> {
  const { data } = await apiClient.get<FornecedorResumo>(`/api/fornecedores/${id}/resumo`)
  return data
}

// ---------------------------------------------------------------------------
// Documentos de fornecedor — S12.2
// ---------------------------------------------------------------------------

/** GET /api/fornecedores/{id}/documentos — lista documentos do fornecedor. */
export async function listFornecedorDocumentos(
  fornecedorId: string,
): Promise<FornecedorDocumento[]> {
  const { data } = await apiClient.get<FornecedorDocumento[]>(
    `/api/fornecedores/${fornecedorId}/documentos`,
  )
  return data
}

/** POST /api/fornecedores/{id}/documentos — upload de documento (admin/compras). */
export async function uploadFornecedorDocumento(
  fornecedorId: string,
  file: File,
  descricao?: string,
): Promise<FornecedorDocumento> {
  const formData = new FormData()
  formData.append('file', file)
  if (descricao) formData.append('descricao', descricao)
  const { data } = await apiClient.post<FornecedorDocumento>(
    `/api/fornecedores/${fornecedorId}/documentos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

/** GET /api/fornecedores/documentos/{doc_id}/download-url — URL assinada. */
export async function getFornecedorDocumentoDownloadUrl(
  docId: string,
): Promise<FornecedorDocumentoDownloadUrl> {
  const { data } = await apiClient.get<FornecedorDocumentoDownloadUrl>(
    `/api/fornecedores/documentos/${docId}/download-url`,
  )
  return data
}

/** DELETE /api/fornecedores/documentos/{doc_id} — remove documento. */
export async function deleteFornecedorDocumento(docId: string): Promise<void> {
  await apiClient.delete(`/api/fornecedores/documentos/${docId}`)
}
