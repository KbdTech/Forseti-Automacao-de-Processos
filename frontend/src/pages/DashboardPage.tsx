/**
 * Dashboard placeholder — Sprint 1.
 *
 * Página temporária para usuários autenticados enquanto os módulos
 * de cada perfil são implementados nas Sprints 2–6.
 *
 * Será substituída pelas telas reais conforme as US avançam:
 *   US-003/004 → SecretariaPage
 *   US-005     → GabinetePage
 *   US-007     → ControladoriaPage
 *   US-011     → DashboardExecutivoPage
 */

import { useNavigate } from 'react-router-dom'
import { LogOut, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'

const ROLE_LABEL: Record<string, string> = {
  secretaria: 'Secretaria',
  gabinete: 'Gabinete do Prefeito',
  controladoria: 'Controladoria',
  contabilidade: 'Contabilidade',
  tesouraria: 'Tesouraria',
  admin: 'Administrador',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
            <Building2 className="w-7 h-7 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Sistema OS Prefeitura
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bem-vindo, {user?.nome ?? 'Usuário'}!</CardTitle>
            <CardDescription>
              Perfil: {user ? ROLE_LABEL[user.role] : '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Autenticação JWT funcionando. As telas do sistema serão
              habilitadas progressivamente nas próximas sprints.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do sistema
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
