/**
 * Tipos de Documentos anexados às Ordens — US-015.
 *
 * Sincronizado com o back-end: app/schemas/documento.py e app/models/documento.py.
 */

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/**
 * Metadados de um documento (GET /api/ordens/:id/documentos).
 *
 * US-015 RN: storage_path NUNCA é retornado pela API.
 * Acesso ao conteúdo somente via /download-url.
 */
export interface Documento {
  id: string
  ordem_id: string
  uploaded_by: string
  nome_arquivo: string
  tipo_mime: string
  tamanho_bytes: number
  descricao: string | null
  hash_sha256: string
  /** US-015: documento pode ser assinado digitalmente via gov.br. */
  assinado_govbr: boolean
  versao: number
  created_at: string
}

/** Resposta paginada de listagem (GET /api/ordens/:id/documentos). */
export interface DocumentoListResponse {
  documentos: Documento[]
  total: number
}

/** Resposta do endpoint de URL assinada (GET /api/documentos/:id/download-url). */
export interface DownloadUrlResponse {
  /** URL temporária para download direto. TTL: 900s (15 min). */
  signed_url: string
  /** Segundos restantes até a URL expirar. */
  expires_in: number
}

// ---------------------------------------------------------------------------
// Payloads de request
// ---------------------------------------------------------------------------

/**
 * FormData para POST /api/ordens/:id/documentos.
 *
 * Enviado como multipart/form-data (não JSON).
 */
export interface DocumentoUploadPayload {
  file: File
  descricao?: string
  /** true = documento já foi assinado via gov.br/assinatura. */
  assinado_govbr?: boolean
}
