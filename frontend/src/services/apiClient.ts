/**
 * Cliente HTTP base — US-001.
 *
 * Configuração Axios com dois interceptors:
 *   Request:  injeta Bearer token em todas as requisições autenticadas.
 *   Response: ao receber 401, tenta renovar via refresh_token e repete a
 *             requisição original. Se o refresh falhar, faz logout e
 *             redireciona para /login.
 *
 * US-001 Cenário 6: renovação automática de token pelo interceptor.
 *
 * NOTA: a chamada de refresh usa `axios` puro (não este cliente) para
 * evitar loop infinito no interceptor de resposta.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/authStore'

// ---------------------------------------------------------------------------
// Configuração base
// ---------------------------------------------------------------------------

/**
 * Em desenvolvimento, o proxy do Vite (vite.config.ts) encaminha /api →
 * http://localhost:8000, portanto baseURL pode ser vazia.
 * Em produção, VITE_API_BASE_URL deve ser definido no .env.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ---------------------------------------------------------------------------
// Helpers para refresh com suporte a requisições concorrentes
// ---------------------------------------------------------------------------

type QueueEntry = {
  resolve: (token: string) => void
  reject: (error: unknown) => void
}

let isRefreshing = false
let failedQueue: QueueEntry[] = []

function processQueue(error: unknown, token: string | null = null): void {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token!)
  })
  failedQueue = []
}

// Marca que a requisição já tentou refresh — evita loop
interface RetryableRequest extends InternalAxiosRequestConfig {
  _retry?: boolean
}

// ---------------------------------------------------------------------------
// Interceptor de request — injeta Bearer token
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

// ---------------------------------------------------------------------------
// Interceptor de response — renova token ao receber 401
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequest | undefined

    // Só tenta refresh em erros 401, e apenas uma vez por requisição
    if (
      error.response?.status !== 401 ||
      originalRequest === undefined ||
      originalRequest._retry
    ) {
      return Promise.reject(error)
    }

    const { refreshToken, setTokens, clearAuth } = useAuthStore.getState()

    // Sem refresh token → logout imediato
    if (!refreshToken) {
      clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Se já há um refresh em andamento, enfileira esta requisição
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      })
        .then((newToken) => {
          originalRequest._retry = true
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return apiClient(originalRequest)
        })
        .catch((err) => Promise.reject(err))
    }

    // Inicia o refresh
    originalRequest._retry = true
    isRefreshing = true

    try {
      // Usa axios puro para não acionar este próprio interceptor.
      // O endpoint /api/auth/refresh retorna apenas { token } (novo access token).
      // O refresh token existente é reutilizado — não é rotacionado.
      const { data } = await axios.post<{ token: string }>(
        `${BASE_URL}/api/auth/refresh`,
        { refresh_token: refreshToken },
      )

      setTokens(data.token, refreshToken)
      processQueue(null, data.token)

      originalRequest.headers.Authorization = `Bearer ${data.token}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      clearAuth()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  },
)

export default apiClient
