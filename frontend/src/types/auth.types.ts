/**
 * Tipos de autenticação — US-001.
 *
 * Sincronizado com o back-end: app/schemas/auth.py e app/schemas/user.py.
 *
 * Mapeamento de nomes (spec CLAUDE.md seção 9):
 *   token            (não access_token) — JWT de acesso, 8h
 *   nome             (não nome_completo) — nome do servidor
 *   must_change_password (não first_login) — exige troca de senha
 */

// ---------------------------------------------------------------------------
// Enums e unions
// ---------------------------------------------------------------------------

/** US-002 RN-7: perfis disponíveis. Sincronizado com RoleLiteral do back-end. */
export type RoleEnum =
  | 'secretaria'
  | 'gabinete'
  | 'controladoria'
  | 'contabilidade'
  | 'tesouraria'
  | 'admin'

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/** Dados do usuário autenticado retornados junto com os tokens. */
export interface UserProfile {
  id: string
  /** Nome completo do servidor (mapeado de nome_completo no ORM). */
  nome: string
  email: string
  role: RoleEnum
  secretaria_id: string | null
  is_active: boolean
  /** US-001 RN-5: TRUE exige troca de senha antes de acessar outras rotas. */
  must_change_password: boolean
  created_at: string
}

// ---------------------------------------------------------------------------
// Payloads de request
// ---------------------------------------------------------------------------

/** POST /api/auth/login */
export interface LoginPayload {
  email: string
  password: string
}

/** POST /api/auth/refresh */
export interface RefreshPayload {
  refresh_token: string
}

/** POST /api/auth/change-password */
export interface ChangePasswordPayload {
  old_password: string
  new_password: string
  confirm_password: string
}

// ---------------------------------------------------------------------------
// Payloads de response
// ---------------------------------------------------------------------------

/**
 * Resposta do POST /api/auth/login.
 *
 * US-001 RN-2: token expira em 8h.
 * US-001 RN-3: refresh_token expira em 24h.
 */
export interface TokenResponse {
  /** JWT de acesso (8h). Enviar como Bearer no header Authorization. */
  token: string
  refresh_token: string
  user: UserProfile
}

/** Resposta genérica de mensagem do back-end (detail = formato FastAPI). */
export interface MessageResponse {
  detail: string
}
