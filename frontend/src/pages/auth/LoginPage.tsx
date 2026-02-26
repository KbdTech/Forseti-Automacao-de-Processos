/**
 * Tela de Login — US-001.
 *
 * Features:
 *   - Formulário com React Hook Form + Zod
 *   - Estado de loading com spinner no botão (sem tela em branco — regra 15 do CLAUDE.md)
 *   - Alert de erro para credenciais inválidas (401), conta bloqueada (423) e falha de rede
 *   - Redirect automático após login: first_login → /primeiro-acesso, senão → rota do perfil
 *   - Se já autenticado, redireciona direto para o dashboard do perfil
 *
 * US-001 Cenário 1: login válido → redirect por perfil
 * US-001 Cenário 2: credenciais inválidas → alert com mensagem
 * US-001 Cenário 3: conta bloqueada → alert com lock icon
 * US-001 Cenário 5: first_login → redirect para /primeiro-acesso
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, Loader2, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { useAuth } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Schema de validação — US-001 RN-4 (mínimo 1 char para não revelar formato)
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail obrigatório.')
    .email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Senha obrigatória.'),
})

type LoginFormData = z.infer<typeof loginSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ApiErrorData {
  detail?: string
}

/** Extrai a mensagem de erro retornada pelo FastAPI ({ detail: "..." }). */
function extractErrorMessage(error: unknown): string {
  const axiosErr = error as AxiosError<ApiErrorData>
  return (
    axiosErr.response?.data?.detail ??
    'Erro de conexão. Verifique sua internet e tente novamente.'
  )
}

/** Detecta se é um erro de conta bloqueada (HTTP 423). */
function isLockedError(error: unknown): boolean {
  const axiosErr = error as AxiosError
  return axiosErr.response?.status === 423
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated, redirectPath } = useAuth()

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLocked, setIsLocked] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Se já autenticado (ex.: reload de página), redireciona direto
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectPath, { replace: true })
    }
  }, [isAuthenticated, navigate, redirectPath])

  // --- Submit ---

  async function onSubmit(data: LoginFormData) {
    setErrorMessage(null)
    setIsLocked(false)

    try {
      const response = await login(data)

      // US-001 RN-5: primeiro acesso → troca de senha obrigatória
      if (response.user.must_change_password) {
        navigate('/primeiro-acesso', { replace: true })
        return
      }

      // Redirect por perfil (US-001 Cenário 1)
      const roleRoutes: Record<string, string> = {
        secretaria: '/secretaria/ordens',
        gabinete: '/gabinete',
        controladoria: '/controladoria',
        contabilidade: '/contabilidade/empenho',
        tesouraria: '/tesouraria/pagamento',
        admin: '/admin/usuarios',
      }
      navigate(roleRoutes[response.user.role] ?? '/dashboard', { replace: true })
    } catch (error) {
      setIsLocked(isLockedError(error))
      setErrorMessage(extractErrorMessage(error))
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        {/* Cabeçalho institucional */}
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
            <Building2 className="w-7 h-7 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Sistema OS Prefeitura
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestão de Ordens de Serviço e Compras Públicas
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Acesso Institucional</CardTitle>
            <CardDescription>
              Informe suas credenciais para continuar.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            {/* Alert de erro — exibido após falha no login */}
            {errorMessage && (
              <Alert variant="destructive" className="mb-5">
                {isLocked ? (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                <AlertTitle>
                  {isLocked ? 'Conta bloqueada' : 'Falha no acesso'}
                </AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-5"
            >
              {/* Campo e-mail */}
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail institucional</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@prefeitura.gov.br"
                  autoFocus
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Campo senha */}
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    disabled={isSubmitting}
                    aria-invalid={!!errors.password}
                    className="pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Botão de submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Autenticando…
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Sistema de uso exclusivo de servidores municipais autorizados.
        </p>
      </div>
    </div>
  )
}
