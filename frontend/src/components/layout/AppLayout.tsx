/**
 * AppLayout — US-002.
 *
 * Layout base de todas as páginas autenticadas.
 *
 * Estrutura:
 *   ┌──────────────────────────────────┐
 *   │  Sidebar (lg+, fixa)             │
 *   │─────────────────────────────────│
 *   │  Header (sticky top)            │
 *   │─────────────────────────────────│
 *   │  <Outlet /> (conteúdo da rota)  │
 *   └──────────────────────────────────┘
 *
 * Sidebar é ocultada em mobile; o Header expõe um botão hamburger
 * que abre um Sheet (drawer) com o mesmo conteúdo da sidebar.
 */

import { Outlet } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

interface AppLayoutProps {
  /** Título exibido na barra superior. Opcional. */
  title?: string
}

export default function AppLayout({ title }: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar fixa — visível apenas em lg+ */}
      <Sidebar />

      {/* Área de conteúdo principal */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
