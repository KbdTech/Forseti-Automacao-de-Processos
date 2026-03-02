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
