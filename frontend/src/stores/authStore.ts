/**
 * Store de autenticação — US-001.
 *
 * Zustand 5 com persist em localStorage.
 * Expõe: user, accessToken, refreshToken, isAuthenticated.
 * Ações: setAuth(), setTokens(), clearAuth().
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { UserProfile, TokenResponse } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Interface do store
// ---------------------------------------------------------------------------

interface AuthStore {
  /** Dados do usuário autenticado. NULL quando não autenticado. */
  user: UserProfile | null
  /** JWT de acesso (8h). NULL quando não autenticado. */
  accessToken: string | null
  /** JWT de refresh (24h). NULL quando não autenticado. */
  refreshToken: string | null
  /** Atalho booleano para verificação de autenticação. */
  isAuthenticated: boolean

  // --- Ações ---

  /**
   * Persiste os dados de login (tokens + usuário) após autenticação bem-sucedida.
   * US-001 Cenário 1.
   */
  setAuth: (data: TokenResponse) => void

  /**
   * Atualiza apenas os tokens — usado pelo interceptor após refresh automático.
   * US-001 Cenário 6.
   */
  setTokens: (accessToken: string, refreshToken: string) => void

  /**
   * Atualiza campos parciais do user — usado após changePassword para marcar
   * must_change_password=false sem precisar de nova chamada à API.
   */
  patchUser: (updates: Partial<UserProfile>) => void

  /**
   * Limpa todos os dados de autenticação — usado no logout e em erros de refresh.
   * US-001 Cenário 7.
   */
  clearAuth: () => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      setAuth: (data: TokenResponse) =>
        set({
          user: data.user,
          accessToken: data.token,
          refreshToken: data.refresh_token,
          isAuthenticated: true,
        }),

      setTokens: (accessToken: string, refreshToken: string) =>
        set({ accessToken, refreshToken }),

      patchUser: (updates: Partial<UserProfile>) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      clearAuth: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'forseti-auth',
      // sessionStorage: limpo ao fechar a aba/browser (mais seguro para dados de saúde pública)
      storage: createJSONStorage(() => sessionStorage),
      // Persiste apenas os campos necessários
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)
