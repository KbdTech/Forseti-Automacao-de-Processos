/**
 * Header — US-002.
 *
 * Barra superior do sistema com:
 *   - Botão hamburger (mobile): abre o drawer da sidebar
 *   - Título da página atual (via useMatches / rota)
 *   - ProfileBadge: nome do usuário + perfil
 *   - Dropdown: nome completo, perfil, link para sair
 *
 * US-001 Cenário 7: logout chama back-end (registra LOGOUT) e limpa store.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Menu, LogOut, User } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABEL } from '@/types/routes'
import { SidebarContent } from '@/components/layout/Sidebar'

interface HeaderProps {
  /** Título da seção atual exibido na barra. */
  title?: string
}

export default function Header({ title }: HeaderProps) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
    toast.success('Sessão encerrada com sucesso.')
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background px-4 lg:px-6">
      {/* Botão hamburger — visível apenas em mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Título da seção */}
      {title && (
        <h1 className="flex-1 text-sm font-semibold text-foreground truncate lg:text-base">
          {title}
        </h1>
      )}
      {!title && <div className="flex-1" />}

      {/* ProfileBadge + Dropdown */}
      {user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 px-2 py-1 h-auto max-w-[200px]"
              aria-label="Menu do usuário"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 shrink-0">
                <User className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <span className="hidden md:block text-sm font-medium truncate">
                {user.nome}
              </span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none truncate">{user.nome}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <Badge variant="outline" className="mt-1 w-fit text-xs">
                  {ROLE_LABEL[user.role]}
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate('/configuracoes/notificacoes')}
              className="cursor-pointer"
            >
              <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
              Preferências de notificação
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sair do sistema
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Drawer mobile da sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SidebarContent onNavClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
