/**
 * RoleGuard — US-002.
 *
 * HOC/wrapper que protege rotas por perfil de acesso (RBAC).
 *
 * Comportamento (US-002 RN-12):
 *   1. Usuário não autenticado → redireciona para /login (salva `from` no state)
 *   2. Usuário autenticado sem o perfil necessário → redireciona para /acesso-negado
 *   3. Perfil autorizado → renderiza os filhos normalmente
 *
 * IMPORTANTE: a validação de perfil no back-end é a fonte de verdade.
 * Este guard apenas melhora a UX — nunca substitui a segurança do back-end.
 */

import { Navigate, useLocation } from 'react-router-dom'
import type { RoleEnum } from '@/types/auth.types'
import { useAuth } from '@/hooks/useAuth'

interface RoleGuardProps {
  /** Perfis que têm acesso à rota protegida. */
  roles: RoleEnum[]
  children: React.ReactNode
}

export default function RoleGuard({ roles, children }: RoleGuardProps) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  // Não autenticado → preserva a rota atual para redirecionar após login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Autenticado mas sem o perfil necessário → acesso negado
  if (user && !roles.includes(user.role)) {
    return <Navigate to="/acesso-negado" replace />
  }

  return <>{children}</>
}
