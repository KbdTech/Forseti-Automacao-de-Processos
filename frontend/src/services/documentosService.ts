/**
 * Service de Documentos — US-015.
 *
 * Encapsula todas as chamadas à API REST /api/ordens/:id/documentos e
 * /api/documentos/:id/*.
 *
 * Usa o apiClient com interceptors JWT.
 *
 * US-015 RN: storage_path nunca é exposto. Acesso ao conteúdo apenas via
 * /download-url que retorna uma URL assinada com TTL de 900s.
 */

import apiClient from '@/services/apiClient'
import type {
  Documento,
  DocumentoListResponse,
  DocumentoUploadPayload,
  DownloadUrlResponse,
} from '@/types/documento'

/**
 * POST /api/ordens/:ordemId/documentos
 *
 * US-015: somente perfis 'secretaria' e 'admin'.
 * Tipos aceitos: application/pdf, image/jpeg, image/png. Máx 10 MB.
 * Imutável após AGUARDANDO_CONTROLADORIA.
 */
export async function uploadDocumento(
  ordemId: string,
  payload: DocumentoUploadPayload,
): Promise<Documento> {
  const form = new FormData()
  form.append('file', payload.file)
  if (payload.descricao) {
    form.append('descricao', payload.descricao)
  }
  form.append('assinado_govbr', String(payload.assinado_govbr ?? false))

  const { data } = await apiClient.post<Documento>(
    `/api/ordens/${ordemId}/documentos`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  )
  return data
}

/**
 * GET /api/ordens/:ordemId/documentos
 *
 * Disponível para qualquer perfil autenticado.
 * Retorna lista em ordem cronológica sem storage_path.
 */
export async function listDocumentos(ordemId: string): Promise<DocumentoListResponse> {
  const { data } = await apiClient.get<DocumentoListResponse>(
    `/api/ordens/${ordemId}/documentos`,
  )
  return data
}

/**
 * GET /api/documentos/:docId/download-url
 *
 * Gera URL assinada temporária (TTL 15 min) para download.
 * US-015 RN: storage_path nunca exposto — acesso somente via esta URL.
 */
export async function getDownloadUrl(docId: string): Promise<DownloadUrlResponse> {
  const { data } = await apiClient.get<DownloadUrlResponse>(
    `/api/documentos/${docId}/download-url`,
  )
  return data
}

/**
 * DELETE /api/documentos/:docId
 *
 * Somente o uploader original (secretaria) ou admin podem remover.
 * Proibido para ordens em status imutável (após AGUARDANDO_CONTROLADORIA).
 */
export async function deleteDocumento(docId: string): Promise<void> {
  await apiClient.delete(`/api/documentos/${docId}`)
}
