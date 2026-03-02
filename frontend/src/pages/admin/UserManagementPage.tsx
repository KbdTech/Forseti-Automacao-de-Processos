/**
 * UserManagementPage — US-002.
 *
 * Tela de Gestão de Usuários — exclusiva para admin.
 *
 * Funcionalidades:
 *   - Listar usuários com filtro por perfil e paginação (20/página)
 *   - Criar novo usuário (dialog)
 *   - Editar dados do usuário: nome, email, is_active (dialog)
 *   - Alterar perfil do usuário (dialog separado — US-002 RN-9/10)
 *   - Skeleton loaders durante carregamento
 *   - Toast de feedback em todas as ações
 *
 * Regras de negócio:
 *   US-002 RN-9:  admin não pode remover seu próprio perfil de administrador
 *   US-002 RN-10: alterações de perfil registradas em role_change_log
 *   US-001 RN-5:  novo usuário criado com first_login=True (troca de senha obrigatória)
 */

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, ShieldCheck, Loader2, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'

import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABEL } from '@/types/routes'
import type { RoleEnum } from '@/types/auth.types'
import type { UserResponse } from '@/types/user.types'
import {
  listUsers,
  createUser,
  updateUser,
  updateUserRole,
  resetUserPassword,
} from '@/services/userService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLES: RoleEnum[] = [
  'secretaria',
  'gabinete',
  'controladoria',
  'contabilidade',
  'tesouraria',
  'admin',
]

function extractError(error: unknown): string {
  const axiosErr = error as AxiosError<{ detail?: string }>
  return axiosErr.response?.data?.detail ?? 'Erro inesperado. Tente novamente.'
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'default' : 'secondary'}>
      {isActive ? 'Ativo' : 'Inativo'}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Schema — criar usuário
// ---------------------------------------------------------------------------

const createSchema = z.object({
  nome: z.string().min(2, 'Mínimo 2 caracteres.'),
  email: z.string().email('Informe um e-mail válido.'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres.')
    .refine((v) => /[a-zA-Z]/.test(v), 'Deve conter ao menos uma letra.')
    .refine((v) => /\d/.test(v), 'Deve conter ao menos um número.'),
  role: z.enum([
    'secretaria',
    'gabinete',
    'controladoria',
    'contabilidade',
    'tesouraria',
    'admin',
  ] as const),
  secretaria_id: z.string().uuid('UUID inválido.').nullable().optional(),
})

type CreateFormData = z.infer<typeof createSchema>

// ---------------------------------------------------------------------------
// Schema — editar usuário
// ---------------------------------------------------------------------------

const editSchema = z.object({
  nome: z.string().min(2, 'Mínimo 2 caracteres.'),
  email: z.string().email('Informe um e-mail válido.'),
  is_active: z.boolean(),
})

type EditFormData = z.infer<typeof editSchema>

// ---------------------------------------------------------------------------
// Schema — alterar perfil
// ---------------------------------------------------------------------------

const roleSchema = z.object({
  role: z.enum([
    'secretaria',
    'gabinete',
    'controladoria',
    'contabilidade',
    'tesouraria',
    'admin',
  ] as const),
})

type RoleFormData = z.infer<typeof roleSchema>

// ---------------------------------------------------------------------------
// Dialog — Criar Usuário
// ---------------------------------------------------------------------------

interface CreateDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormData>({ resolver: zodResolver(createSchema) })

  const selectedRole = watch('role')

  async function onSubmit(data: CreateFormData) {
    try {
      await createUser({
        ...data,
        secretaria_id: data.secretaria_id ?? null,
      })
      toast.success('Usuário criado com sucesso. Senha provisória definida.')
      reset()
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(extractError(error))
    }
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
          <DialogDescription>
            Preencha os dados do novo servidor. Será necessário trocar a senha
            no primeiro acesso.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="new-nome">Nome completo</Label>
            <Input
              id="new-nome"
              placeholder="João da Silva"
              disabled={isSubmitting}
              {...register('nome')}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label htmlFor="new-email">E-mail institucional</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="servidor@prefeitura.gov.br"
              disabled={isSubmitting}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Senha provisória */}
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Senha provisória</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Mín. 8 chars, letras e números"
              disabled={isSubmitting}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* Perfil */}
          <div className="space-y-1.5">
            <Label htmlFor="new-role">Perfil</Label>
            <Select
              onValueChange={(v) => setValue('role', v as RoleEnum)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="new-role">
                <SelectValue placeholder="Selecione o perfil" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-xs text-destructive">{errors.role.message}</p>
            )}
          </div>

          {/* Secretaria (obrigatório apenas para role=secretaria) */}
          {selectedRole === 'secretaria' && (
            <div className="space-y-1.5">
              <Label htmlFor="new-secretaria">UUID da Secretaria</Label>
              <Input
                id="new-secretaria"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                disabled={isSubmitting}
                {...register('secretaria_id')}
              />
              {errors.secretaria_id && (
                <p className="text-xs text-destructive">
                  {errors.secretaria_id.message}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando…
                </>
              ) : (
                'Criar usuário'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog — Editar Usuário
// ---------------------------------------------------------------------------

interface EditDialogProps {
  user: UserResponse | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

function EditUserDialog({ user, open, onOpenChange, onSuccess }: EditDialogProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    values: user
      ? { nome: user.nome, email: user.email, is_active: user.is_active }
      : undefined,
  })

  const isActive = watch('is_active')

  async function onSubmit(data: EditFormData) {
    if (!user) return
    try {
      await updateUser(user.id, data)
      toast.success('Usuário atualizado com sucesso.')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(extractError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Usuário</DialogTitle>
          <DialogDescription>
            Atualize os dados do servidor. Para alterar o perfil, use o botão
            "Alterar Perfil".
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-nome">Nome completo</Label>
            <Input
              id="edit-nome"
              disabled={isSubmitting}
              {...register('nome')}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          {/* E-mail */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">E-mail institucional</Label>
            <Input
              id="edit-email"
              type="email"
              disabled={isSubmitting}
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Status da conta</Label>
            <Select
              value={isActive ? 'true' : 'false'}
              onValueChange={(v) => setValue('is_active', v === 'true')}
              disabled={isSubmitting}
            >
              <SelectTrigger id="edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Ativo</SelectItem>
                <SelectItem value="false">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false) }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Dialog — Alterar Perfil
// ---------------------------------------------------------------------------

interface RoleDialogProps {
  user: UserResponse | null
  currentUserId: string | undefined
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

function ChangeRoleDialog({
  user,
  currentUserId,
  open,
  onOpenChange,
  onSuccess,
}: RoleDialogProps) {
  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    values: user ? { role: user.role } : undefined,
  })

  const selectedRole = watch('role')

  // US-002 RN-9: admin não pode remover seu próprio perfil de administrador
  const isSelf = user?.id === currentUserId
  const blockedAdminRemoval = isSelf && selectedRole !== 'admin' && user?.role === 'admin'

  async function onSubmit(data: RoleFormData) {
    if (!user) return
    try {
      await updateUserRole(user.id, data)
      toast.success('Perfil atualizado com sucesso.')
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(extractError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Alterar Perfil</DialogTitle>
          <DialogDescription>
            {user?.nome ? (
              <>
                Alterando perfil de <strong>{user.nome}</strong>.
              </>
            ) : null}{' '}
            A alteração é registrada em log de auditoria.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-select">Novo perfil</Label>
            <Select
              value={selectedRole}
              onValueChange={(v) => setValue('role', v as RoleEnum)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Aviso: admin não pode se rebaixar (US-002 RN-9) */}
          {blockedAdminRemoval && (
            <p className="text-xs text-destructive">
              Você não pode remover seu próprio perfil de administrador.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false) }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || blockedAdminRemoval}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                'Alterar perfil'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Tabela — Skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function UserManagementPage() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()

  // Filtros
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserResponse | null>(null)
  const [roleTarget, setRoleTarget] = useState<UserResponse | null>(null)
  const [resetTarget, setResetTarget] = useState<UserResponse | null>(null)

  // Query
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', { page, role: roleFilter === 'all' ? null : roleFilter }],
    queryFn: () =>
      listUsers({
        page,
        limit: 20,
        role: roleFilter === 'all' ? null : roleFilter,
      }),
  })

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  // US-025: mutation de reset de senha
  const resetMutation = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: () => {
      toast.success('Senha resetada.', {
        description: 'O usuário precisará criar nova senha no próximo login.',
      })
      setResetTarget(null)
      invalidate()
    },
    onError: (error: AxiosError<{ detail?: string }>) => {
      toast.error(extractError(error))
    },
  })


  return (
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gestão de Usuários</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.total} usuário(s) encontrado(s)` : 'Carregando…'}
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Novo Usuário
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="w-52">
          <Select
            value={roleFilter}
            onValueChange={(v) => { setRoleFilter(v); setPage(1) }}
          >
            <SelectTrigger aria-label="Filtrar por perfil">
              <SelectValue placeholder="Todos os perfis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os perfis</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton />}

            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive py-8">
                  Erro ao carregar usuários. Tente recarregar a página.
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && data?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  Nenhum usuário encontrado para os filtros aplicados.
                </TableCell>
              </TableRow>
            )}

            {data?.items.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABEL[u.role]}</Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge isActive={u.is_active} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {/* Editar dados */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTarget(u)}
                      aria-label={`Editar ${u.nome}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Alterar perfil */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRoleTarget(u)}
                      aria-label={`Alterar perfil de ${u.nome}`}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </Button>

                    {/* Resetar senha — US-025 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setResetTarget(u)}
                      aria-label={`Resetar senha de ${u.nome}`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={invalidate}
      />

      <EditUserDialog
        user={editTarget}
        open={editTarget !== null}
        onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        onSuccess={invalidate}
      />

      <ChangeRoleDialog
        user={roleTarget}
        currentUserId={currentUser?.id}
        open={roleTarget !== null}
        onOpenChange={(v) => { if (!v) setRoleTarget(null) }}
        onSuccess={invalidate}
      />

      {/* AlertDialog — Resetar Senha (US-025) */}
      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(v) => { if (!v) setResetTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar senha de {resetTarget?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso obrigará o usuário a criar uma nova senha no próximo acesso.
              A conta será desbloqueada caso esteja bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetTarget && resetMutation.mutate(resetTarget.id)}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetando…
                </>
              ) : (
                'Confirmar reset'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
