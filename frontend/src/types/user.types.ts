/**
 * Tipos de usuário — US-002.
 *
 * Sincronizados com os schemas Pydantic do back-end:
 *   UserResponse, UserCreate, UserUpdate, UserRoleUpdate, UserListResponse
 *   em backend/app/schemas/user.py
 */

import type { RoleEnum } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

/** Representação pública de um usuário retornada pela API. */
export interface UserResponse {
  id: string
  email: string
  /** Nome completo do servidor (mapeado de nome_completo no ORM). */
  nome: string
  role: RoleEnum
  secretaria_id: string | null
  is_active: boolean
  /** US-001 RN-5: true = troca de senha obrigatória no primeiro acesso. */
  must_change_password: boolean
  created_at: string
}

/** Resposta paginada de GET /api/users/. */
export interface UserListResponse {
  items: UserResponse[]
  total: number
  page: number
  limit: number
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

/** POST /api/users/ — exclusivo para admin (US-002). */
export interface UserCreatePayload {
  email: string
  nome: string
  /** US-001 RN-4: mín. 8 chars, letras e números. */
  password: string
  role: RoleEnum
  /** Obrigatório quando role='secretaria'. */
  secretaria_id?: string | null
}

/** PUT /api/users/:id — todos os campos opcionais (PATCH semântico). */
export interface UserUpdatePayload {
  nome?: string
  email?: string
  is_active?: boolean
  secretaria_id?: string | null
}

/** PUT /api/users/:id/role — US-002 RN-9/10. */
export interface UserRoleUpdatePayload {
  role: RoleEnum
}
