/**
 * Sidebar — US-002.
 *
 * Sidebar responsiva do sistema:
 *   - Desktop (lg+): sidebar fixa à esquerda (240px)
 *   - Mobile: drawer via Sheet do shadcn/ui
 *
 * Itens de menu filtrados pelo perfil do usuário autenticado.
 * Rota ativa destacada via NavLink (isActive).
 *
 * US-002 RN-12: itens inacessíveis são OCULTADOS, não apenas desabilitados.
 */

import { NavLink } from 'react-router-dom'
import {
  Banknote,
  Building2,
  CheckSquare,
  CreditCard,
  FilePlus,
  FileText,
  Landmark,
  LayoutDashboard,
  Receipt,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { SIDEBAR_ITEMS, ROLE_LABEL } from '@/types/routes'
import type { SidebarIconKey } from '@/types/routes'
import { Badge } from '@/components/ui/badge'

// ---------------------------------------------------------------------------
// Mapa de ícones
// ---------------------------------------------------------------------------

const ICON_MAP: Record<SidebarIconKey, LucideIcon> = {
  FileText,
  FilePlus,
  RotateCcw,
  CheckSquare,
  Building2,
  ShieldCheck,
  Receipt,
  Banknote,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Users,
  Landmark,
}

// ---------------------------------------------------------------------------
// Sub-componente: item de menu
// ---------------------------------------------------------------------------

interface NavItemProps {
  path: string
  label: string
  iconKey: SidebarIconKey
  onClick?: () => void
}

function NavItem({ path, label, iconKey, onClick }: NavItemProps) {
  const Icon = ICON_MAP[iconKey]

  return (
    <NavLink
      to={path}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

// ---------------------------------------------------------------------------
// Componente principal — conteúdo da sidebar (reutilizado no desktop e drawer)
// ---------------------------------------------------------------------------

interface SidebarContentProps {
  /** Callback chamado ao clicar em um item (fechar drawer no mobile). */
  onNavClick?: () => void
}

export function SidebarContent({ onNavClick }: SidebarContentProps) {
  const { user } = useAuth()

  const visibleItems = user
    ? SIDEBAR_ITEMS.filter((item) => item.roles.includes(user.role))
    : []

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho da sidebar */}
      <div className="flex items-center gap-2 px-4 py-5 border-b">
        <Building2 className="h-6 w-6 text-primary shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">Sistema OS</p>
          <p className="text-xs text-muted-foreground truncate">Prefeitura Municipal</p>
        </div>
      </div>

      {/* Menu de navegação */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Menu principal">
        {visibleItems.map((item) => (
          <NavItem
            key={item.key}
            path={item.path}
            label={item.label}
            iconKey={item.iconKey}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* Rodapé: perfil do usuário */}
      {user && (
        <div className="border-t px-4 py-4">
          <p className="text-xs font-medium text-foreground truncate">{user.nome}</p>
          <Badge variant="outline" className="mt-1 text-xs">
            {ROLE_LABEL[user.role]}
          </Badge>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar desktop (fixa, visível em lg+)
// ---------------------------------------------------------------------------

export default function Sidebar() {
  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 border-r bg-background h-screen sticky top-0"
      aria-label="Sidebar"
    >
      <SidebarContent />
    </aside>
  )
}
