/**
 * Configuração central de rotas — US-001 a US-014.
 *
 * Usa createBrowserRouter (React Router v6.4+) para suporte ao Data API.
 *
 * Estrutura:
 *   /login                    → LoginPage                  (público)
 *   /primeiro-acesso          → PrimeiroAcessoPage         (público)
 *   /acesso-negado            → AccessDeniedPage           (público)
 *
 *   / (AppLayout)
 *     /admin/usuarios         → UserManagementPage         [admin]
 *     /admin/secretarias      → SecretariaManagementPage   [admin]
 *     /gabinete               → AnaliseGabinetePage        [gabinete, admin]
 *     /controladoria          → AnaliseControladoriaPage   [controladoria, admin]
 *     /contabilidade/empenho  → EmpenhoPage                [contabilidade, admin]
 *     /contabilidade/liquidacao→ LiquidacaoPage            [contabilidade, admin]
 *     /tesouraria/pagamento   → PagamentoPage              [tesouraria, admin]
 *     /tesouraria/pagas       → OrdensPagasPage            [tesouraria, contabilidade, admin]
 *     /secretaria/ordens      → MinhasOrdensPage           [secretaria, admin]
 *     /secretaria/nova-ordem  → NovaOrdemPage              [secretaria]
 *     /secretaria/devolvidas  → DevolvidasPage             [secretaria, admin]
 *     /secretaria/ordens/:id/editar → EditarOrdemPage      [secretaria]
 *     /secretaria/atesto      → AtestoPage                 [secretaria, admin]
 *     /dashboard              → DashboardExecutivoPage     [gabinete, admin]
 *     /audit                  → AuditPage                  [admin]
 *     /configuracoes/notificacoes → NotificationPreferencesPage [todos]
 *
 * US-002 RN-12: RoleGuard oculta rotas não autorizadas (retorna 403 / /acesso-negado).
 */

import { createBrowserRouter, Navigate } from 'react-router-dom'

import LoginPage from '@/pages/auth/LoginPage'
import PrimeiroAcessoPage from '@/pages/auth/PrimeiroAcessoPage'
import AccessDeniedPage from '@/pages/auth/AccessDeniedPage'
import DashboardExecutivoPage from '@/pages/dashboard/DashboardPage'
import UserManagementPage from '@/pages/admin/UserManagementPage'
import SecretariaManagementPage from '@/pages/admin/SecretariaManagementPage'
import AuditPage from '@/pages/admin/AuditPage'
import NovaOrdemPage from '@/pages/secretaria/NovaOrdemPage'
import MinhasOrdensPage from '@/pages/secretaria/MinhasOrdensPage'
import AnaliseGabinetePage from '@/pages/gabinete/AnaliseGabinetePage'
import AnaliseControladoriaPage from '@/pages/controladoria/AnaliseControladoriaPage'
import EmpenhoPage from '@/pages/contabilidade/EmpenhoPage'
import DevolvidasPage from '@/pages/secretaria/DevolvidasPage'
import EditarOrdemPage from '@/pages/secretaria/EditarOrdemPage'
import AtestoPage from '@/pages/secretaria/AtestoPage'
import LiquidacaoPage from '@/pages/contabilidade/LiquidacaoPage'
import PagamentoPage from '@/pages/tesouraria/PagamentoPage'
import OrdensPagasPage from '@/pages/tesouraria/OrdensPagasPage'
import AppLayout from '@/components/layout/AppLayout'
import RoleGuard from '@/components/layout/RoleGuard'
import NotificationPreferencesPage from '@/pages/settings/NotificationPreferencesPage'

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
            <SecretariaManagementPage />
          </Guard>
        ),
      },
      {
        path: 'audit',
        element: (
          <Guard roles={['admin']}>
            <AuditPage />
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
            <LiquidacaoPage />
          </Guard>
        ),
      },

      // --- Tesouraria ---
      {
        path: 'tesouraria/pagamento',
        element: (
          <Guard roles={['tesouraria', 'admin']}>
            <PagamentoPage />
          </Guard>
        ),
      },
      {
        path: 'tesouraria/pagas',
        element: (
          <Guard roles={['tesouraria', 'contabilidade', 'admin']}>
            <OrdensPagasPage />
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
            <AtestoPage />
          </Guard>
        ),
      },

      // --- Dashboard executivo (US-011) — somente gabinete e admin (CLAUDE.md §7) ---
      {
        path: 'dashboard',
        element: (
          <Guard roles={['gabinete', 'admin']}>
            <DashboardExecutivoPage />
          </Guard>
        ),
      },

      // --- Configurações (US-014) — acessível por qualquer usuário autenticado ---
      {
        path: 'configuracoes/notificacoes',
        element: (
          <Guard roles={['secretaria', 'gabinete', 'controladoria', 'contabilidade', 'tesouraria', 'admin']}>
            <NotificationPreferencesPage />
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
], { future: { v7_startTransition: true } })
