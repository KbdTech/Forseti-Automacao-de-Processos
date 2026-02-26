/**
 * Service de usuários — US-002.
 *
 * Encapsula as chamadas ao back-end FastAPI para CRUD de usuários:
 *   listUsers, createUser, updateUser, updateUserRole.
 *
 * Todos os endpoints requerem perfil admin (validado no back-end).
 * Usa o apiClient com interceptors JWT.
 */

import apiClient from '@/services/apiClient'
import type {
  UserCreatePayload,
  UserListResponse,
  UserResponse,
  UserRoleUpdatePayload,
  UserUpdatePayload,
} from '@/types/user.types'

// ---------------------------------------------------------------------------
// Parâmetros de listagem
// ---------------------------------------------------------------------------

export interface ListUsersParams {
  page?: number
  limit?: number
  /** Filtrar por perfil. */
  role?: string | null
  /** Filtrar por UUID de secretaria. */
  secretaria_id?: string | null
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/**
 * GET /api/users/
 *
 * US-002: listar todos os usuários com filtros e paginação.
 */
export async function listUsers(params: ListUsersParams = {}): Promise<UserListResponse> {
  // Remove parâmetros nulos/undefined para não poluir a query string
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null),
  )
  const { data } = await apiClient.get<UserListResponse>('/api/users/', {
    params: cleanParams,
  })
  return data
}

/**
 * POST /api/users/
 *
 * US-002: criar novo usuário (admin only).
 * US-001 RN-5: first_login=True no back-end → troca de senha obrigatória.
 */
export async function createUser(payload: UserCreatePayload): Promise<UserResponse> {
  const { data } = await apiClient.post<UserResponse>('/api/users/', payload)
  return data
}

/**
 * PUT /api/users/:id
 *
 * US-002: editar dados de um usuário existente (admin only).
 * Apenas os campos informados são atualizados (PATCH semântico).
 */
export async function updateUser(
  userId: string,
  payload: UserUpdatePayload,
): Promise<UserResponse> {
  const { data } = await apiClient.put<UserResponse>(`/api/users/${userId}`, payload)
  return data
}

/**
 * PUT /api/users/:id/role
 *
 * US-002 RN-9: admin não pode remover seu próprio perfil de administrador.
 * US-002 RN-10: alteração registrada em role_change_log.
 */
export async function updateUserRole(
  userId: string,
  payload: UserRoleUpdatePayload,
): Promise<UserResponse> {
  const { data } = await apiClient.put<UserResponse>(
    `/api/users/${userId}/role`,
    payload,
  )
  return data
}
