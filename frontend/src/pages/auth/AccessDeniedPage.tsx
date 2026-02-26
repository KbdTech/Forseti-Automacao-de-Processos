/**
 * AccessDeniedPage — US-002.
 *
 * Página 403 exibida quando o usuário autenticado tenta acessar
 * uma rota sem o perfil necessário (US-002 RN-12).
 *
 * Botão "Voltar ao início" redireciona para a rota padrão do perfil.
 */

import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { DEFAULT_ROUTE } from '@/types/routes'

export default function AccessDeniedPage() {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  function handleBack() {
    if (isAuthenticated && user) {
      navigate(DEFAULT_ROUTE[user.role], { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 mx-auto mb-4">
              <ShieldAlert
                className="w-7 h-7 text-destructive"
                aria-hidden="true"
              />
            </div>
            <CardTitle className="text-xl">Acesso Negado</CardTitle>
            <CardDescription>
              Você não tem permissão para acessar esta área do sistema.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Caso acredite que deveria ter acesso, entre em contato com o
              administrador do sistema.
            </p>
            <Button className="w-full" onClick={handleBack}>
              Voltar ao início
            </Button>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          HTTP 403 — Forbidden
        </p>
      </div>
    </div>
  )
}
