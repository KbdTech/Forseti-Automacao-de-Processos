/**
 * Service de autenticação — US-001.
 *
 * Encapsula as chamadas ao back-end FastAPI para:
 *   login, refresh, logout, me, change-password.
 *
 * Usa o apiClient com interceptors JWT.
 */

import apiClient from '@/services/apiClient'
import type {
  ChangePasswordPayload,
  LoginPayload,
  MessageResponse,
  TokenResponse,
  UserProfile,
} from '@/types/auth.types'

/**
 * POST /api/auth/login
 *
 * US-001 Cenário 1: credenciais válidas retornam tokens.
 * US-001 Cenário 2: credenciais inválidas → AxiosError 401.
 * US-001 Cenário 3: conta bloqueada → AxiosError 423.
 */
export async function login(payload: LoginPayload): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>('/api/auth/login', payload)
  return data
}

/**
 * POST /api/auth/refresh
 *
 * US-001 Cenário 6: chamado pelo interceptor ou manualmente.
 * Retorna apenas o novo access token — o refresh token não é rotacionado.
 */
export async function refreshToken(refresh_token: string): Promise<{ token: string }> {
  const { data } = await apiClient.post<{ token: string }>('/api/auth/refresh', {
    refresh_token,
  })
  return data
}

/**
 * POST /api/auth/logout
 *
 * US-001 Cenário 7: registra LOGOUT em audit_logs.
 * A limpeza do store é responsabilidade do chamador (useAuth).
 */
export async function logout(): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>('/api/auth/logout')
  return data
}

/**
 * GET /api/auth/me
 *
 * Retorna os dados do usuário autenticado.
 * Usado para re-hidratar o store após reload de página.
 */
export async function getMe(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>('/api/auth/me')
  return data
}

/**
 * POST /api/auth/change-password
 *
 * US-001 RN-5: obrigatório no primeiro acesso (first_login = True).
 */
export async function changePassword(
  payload: ChangePasswordPayload,
): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>(
    '/api/auth/change-password',
    payload,
  )
  return data
}
