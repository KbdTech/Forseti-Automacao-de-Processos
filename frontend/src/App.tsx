/**
 * Raiz da aplicação — US-001 e US-002.
 *
 * Providers globais:
 *   - RouterProvider   : roteamento data-API (React Router v6.4+)
 *   - QueryClientProvider: cache de dados server-state (TanStack Query v5)
 *   - Toaster          : toast notifications globais (Sonner)
 *
 * O router é definido em src/routes/index.tsx.
 * O controle de acesso por perfil é realizado pelo RoleGuard em cada rota.
 *
 * US-001 Cenário 6: token expirado → interceptor do apiClient renova via
 * refresh token; se falhar, limpa o store e redireciona para /login.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Analytics } from '@vercel/analytics/react'

import { router } from '@/routes/index'

// ---------------------------------------------------------------------------
// TanStack Query client
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Revalida automaticamente ao focar a janela (padrão do TanStack Query)
      staleTime: 1000 * 60 * 5, // 5 minutos
      retry: 1,
    },
  },
})

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {/* Toast notifications globais — posição e cores configuradas uma vez */}
      <Toaster richColors position="top-right" />
      <Analytics />
    </QueryClientProvider>
  )
}
