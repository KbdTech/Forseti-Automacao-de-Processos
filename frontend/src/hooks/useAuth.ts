/**
 * Hook de autenticação — US-001.
 *
 * Combina o authStore (estado) com authService (chamadas API) em uma
 * interface única para os componentes. Expõe:
 *   - Estado atual: user, isAuthenticated, accessToken
 *   - Ações: login(), logout()
 *   - Helpers: isRole(), redirectPath
 */

import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import * as authService from '@/services/authService'
import type { LoginPayload, RoleEnum, TokenResponse } from '@/types/auth.types'

/**
 * Mapa de rotas padrão por perfil.
 * Usado para redirect após login (US-001 Cenário 1).
 */
const ROLE_REDIRECT: Record<RoleEnum, string> = {
  secretaria: '/secretaria/ordens',
  gabinete: '/gabinete',
  controladoria: '/controladoria',
  contabilidade: '/contabilidade',
  tesouraria: '/tesouraria',
  admin: '/admin',
}

export function useAuth() {
  const { user, accessToken, isAuthenticated, setAuth, clearAuth } =
    useAuthStore()

  /** Indica se há uma operação de login ou logout em andamento. */
  const [isLoading, setIsLoading] = useState(false)

  /**
   * Autentica o usuário e persiste os dados no store.
   *
   * @returns TokenResponse — o chamador deve navegar com base em
   *          `response.user.must_change_password` e `response.user.role`.
   * @throws AxiosError — o componente é responsável por tratar os erros.
   */
  async function login(payload: LoginPayload): Promise<TokenResponse> {
    setIsLoading(true)
    try {
      const response = await authService.login(payload)
      setAuth(response)
      return response
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Desautentica o usuário: chama o back-end (registra LOGOUT em audit_logs)
   * e limpa o store local.
   *
   * US-001 Cenário 7: falha na chamada não bloqueia o logout local.
   */
  async function logout(): Promise<void> {
    setIsLoading(true)
    try {
      await authService.logout()
    } finally {
      clearAuth()
      setIsLoading(false)
    }
  }

  /**
   * Verifica se o usuário autenticado possui um dos perfis informados.
   * US-002 RN-12: validação de perfil no front-end (complementar ao back-end).
   */
  function isRole(...roles: RoleEnum[]): boolean {
    return user !== null && roles.includes(user.role)
  }

  /** Caminho de redirect padrão para o perfil atual. */
  const redirectPath = user ? ROLE_REDIRECT[user.role] : '/login'

  return {
    user,
    accessToken,
    isAuthenticated,
    isLoading,
    login,
    logout,
    isRole,
    redirectPath,
  }
}
