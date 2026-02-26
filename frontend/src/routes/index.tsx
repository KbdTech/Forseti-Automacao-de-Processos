/**
 * Configuração central de rotas — US-001 e US-002.
 *
 * Usa createBrowserRouter (React Router v6.4+) para suporte ao Data API.
 *
 * Estrutura:
 *   /login                    → LoginPage          (público)
 *   /primeiro-acesso          → PrimeiroAcessoPage  (público)
 *   /acesso-negado            → AccessDeniedPage    (público)
 *
 *   / (AppLayout)
 *     /admin/usuarios         → UserManagementPage  [admin]
 *     /admin/secretarias      → DashboardPage*      [admin]
 *     /gabinete               → AnaliseGabinetePage [gabinete, admin]
 *     /controladoria          → AnaliseControladoriaPage [controladoria, admin]
 *     /contabilidade/empenho  → EmpenhoPage          [contabilidade, admin]
 *     /contabilidade/liquidacao→DashboardPage*      [contabilidade, admin]
 *     /tesouraria/pagamento   → DashboardPage*      [tesouraria, admin]
 *     /secretaria/ordens      → DashboardPage*      [secretaria, admin]
 *     /secretaria/nova-ordem  → DashboardPage*      [secretaria]
 *     /secretaria/devolvidas  → DevolvidasPage       [secretaria, admin]
 *     /secretaria/ordens/:id/editar → EditarOrdemPage [secretaria]
 *     /secretaria/atesto      → DashboardPage*      [secretaria, admin]
 *     /dashboard              → DashboardPage*      [gabinete, admin]
 *     /audit                  → DashboardPage*      [admin]
 *
 * * Placeholder até Sprints 2–6 — substituído progressivamente.
 *
 * US-002 RN-12: RoleGuard oculta rotas não autorizadas (retorna 403 / /acesso-negado).
 */

import { createBrowserRouter, Navigate } from 'react-router-dom'

import LoginPage from '@/pages/auth/LoginPage'
import PrimeiroAcessoPage from '@/pages/auth/PrimeiroAcessoPage'
import AccessDeniedPage from '@/pages/auth/AccessDeniedPage'
import DashboardPage from '@/pages/DashboardPage'
import UserManagementPage from '@/pages/admin/UserManagementPage'
import NovaOrdemPage from '@/pages/secretaria/NovaOrdemPage'
import MinhasOrdensPage from '@/pages/secretaria/MinhasOrdensPage'
import AnaliseGabinetePage from '@/pages/gabinete/AnaliseGabinetePage'
import AnaliseControladoriaPage from '@/pages/controladoria/AnaliseControladoriaPage'
import EmpenhoPage from '@/pages/contabilidade/EmpenhoPage'
import DevolvidasPage from '@/pages/secretaria/DevolvidasPage'
import EditarOrdemPage from '@/pages/secretaria/EditarOrdemPage'
import AppLayout from '@/components/layout/AppLayout'
import RoleGuard from '@/components/layout/RoleGuard'

// ---------------------------------------------------------------------------
// Wrapper helper para reduzir repetição de RoleGuard nas rotas filhas
// ---------------------------------------------------------------------------

function Guard({
  roles,
  children,
}: {
  roles: Parameters<typeof RoleGuard>[0]['roles']
  children: React.ReactNode
}) {
  return <RoleGuard roles={roles}>{children}</RoleGuard>
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const router = createBrowserRouter([
  // -------------------------------------------------------------------------
  // Rotas públicas
  // -------------------------------------------------------------------------
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/primeiro-acesso',
    element: <PrimeiroAcessoPage />,
  },
  {
    path: '/acesso-negado',
    element: <AccessDeniedPage />,
  },

  // -------------------------------------------------------------------------
  // Rotas protegidas — envolvidas pelo AppLayout
  // -------------------------------------------------------------------------
  {
    path: '/',
    element: <AppLayout />,
    children: [
      // Redirect raiz → /login (para forçar autenticação via RoleGuard)
      { index: true, element: <Navigate to="/login" replace /> },

      // --- Admin ---
      {
        path: 'admin/usuarios',
        element: (
          <Guard roles={['admin']}>
            <UserManagementPage />
          </Guard>
        ),
      },
      {
        path: 'admin/secretarias',
        element: (
          <Guard roles={['admin']}>
            <DashboardPage />
          </Guard>
        ),
      },
      {
        path: 'audit',
        element: (
          <Guard roles={['admin']}>
            <DashboardPage />
          </Guard>
        ),
      },

      // --- Gabinete ---
      {
        path: 'gabinete',
        element: (
          <Guard roles={['gabinete', 'admin']}>
            <AnaliseGabinetePage />
          </Guard>
        ),
      },

      // --- Controladoria ---
      {
        path: 'controladoria',
        element: (
          <Guard roles={['controladoria', 'admin']}>
            <AnaliseControladoriaPage />
          </Guard>
        ),
      },

      // --- Contabilidade ---
      {
        path: 'contabilidade/empenho',
        element: (
          <Guard roles={['contabilidade', 'admin']}>
            <EmpenhoPage />
          </Guard>
        ),
      },
      {
        path: 'contabilidade/liquidacao',
        element: (
          <Guard roles={['contabilidade', 'admin']}>
            <DashboardPage />
          </Guard>
        ),
      },

      // --- Tesouraria ---
      {
        path: 'tesouraria/pagamento',
        element: (
          <Guard roles={['tesouraria', 'admin']}>
            <DashboardPage />
          </Guard>
        ),
      },

      // --- Secretaria ---
      {
        path: 'secretaria/ordens',
        element: (
          <Guard roles={['secretaria', 'admin']}>
            <MinhasOrdensPage />
          </Guard>
        ),
      },
      {
        path: 'secretaria/nova-ordem',
        element: (
          <Guard roles={['secretaria']}>
            <NovaOrdemPage />
          </Guard>
        ),
      },
      {
        path: 'secretaria/devolvidas',
        element: (
          <Guard roles={['secretaria', 'admin']}>
            <DevolvidasPage />
          </Guard>
        ),
      },
      {
        path: 'secretaria/ordens/:id/editar',
        element: (
          <Guard roles={['secretaria']}>
            <EditarOrdemPage />
          </Guard>
        ),
      },
      {
        path: 'secretaria/atesto',
        element: (
          <Guard roles={['secretaria', 'admin']}>
            <DashboardPage />
          </Guard>
        ),
      },

      // --- Dashboard executivo ---
      {
        path: 'dashboard',
        element: (
          <Guard roles={['gabinete', 'admin']}>
            <DashboardPage />
          </Guard>
        ),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Catch-all → /login
  // -------------------------------------------------------------------------
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
])
