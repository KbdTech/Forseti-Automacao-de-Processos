/**
 * Tela de Primeiro Acesso — US-001 RN-5.
 *
 * Exibida quando first_login = true após o login bem-sucedido.
 * O usuário deve redefinir sua senha antes de acessar qualquer outra rota.
 *
 * US-001 Cenário 5: não é possível acessar outra rota sem concluir esta tela.
 * US-001 RN-4: nova senha validada pelo Zod (mín. 8 chars, letras + números).
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { AxiosError } from 'axios'
import { toast } from 'sonner'

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

import { changePassword } from '@/services/authService'
import { useAuth } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Schema — US-001 RN-4: mín. 8 chars, letras e números
// ---------------------------------------------------------------------------

const changePasswordSchema = z
  .object({
    old_password: z.string().min(1, 'Senha atual obrigatória.'),
    new_password: z
      .string()
      .min(8, 'A nova senha deve ter no mínimo 8 caracteres.')
      .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
        message: 'A senha deve conter letras e números.',
      }),
    confirm_password: z.string().min(1, 'Confirmação de senha obrigatória.'),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'As senhas não conferem.',
    path: ['confirm_password'],
  })

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function PrimeiroAcessoPage() {
  const navigate = useNavigate()
  const { redirectPath, patchUser } = useAuth()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  })

  async function onSubmit(data: ChangePasswordFormData) {
    setErrorMessage(null)
    try {
      await changePassword(data)
      // Atualiza o store para refletir que a senha foi trocada (US-001 RN-5)
      patchUser({ must_change_password: false })
      toast.success('Senha definida com sucesso! Bem-vindo ao sistema.')
      navigate(redirectPath, { replace: true })
    } catch (error) {
      const axiosErr = error as AxiosError<{ detail?: string }>
      setErrorMessage(
        axiosErr.response?.data?.detail ??
          'Erro ao alterar a senha. Tente novamente.',
      )
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
            <KeyRound className="w-7 h-7 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Primeiro Acesso
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Redefina sua senha antes de continuar.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Redefinição de Senha</CardTitle>
            <CardDescription>
              Por segurança, sua senha provisória deve ser alterada no primeiro
              acesso.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4">
            <Alert className="mb-5">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Requisitos da nova senha</AlertTitle>
              <AlertDescription>
                Mínimo de 8 caracteres, contendo letras e números.
              </AlertDescription>
            </Alert>

            {errorMessage && (
              <Alert variant="destructive" className="mb-5">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <Label htmlFor="old_password">Senha atual (provisória)</Label>
                <Input
                  id="old_password"
                  type="password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.old_password}
                  {...register('old_password')}
                />
                {errors.old_password && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.old_password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new_password">Nova senha</Label>
                <Input
                  id="new_password"
                  type="password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.new_password}
                  {...register('new_password')}
                />
                {errors.new_password && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.new_password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm_password">Confirmar nova senha</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.confirm_password}
                  {...register('confirm_password')}
                />
                {errors.confirm_password && (
                  <p className="text-xs text-destructive" role="alert">
                    {errors.confirm_password.message}
                  </p>
                )}
              </div>

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
                    Salvando…
                  </>
                ) : (
                  'Definir nova senha e entrar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
