/**
 * SecretariaManagementPage — US-013.
 *
 * Tela de Gestão de Secretarias — exclusiva para admin.
 *
 * Funcionalidades:
 *   - Listar secretarias com skeleton loader e empty state
 *   - Criar nova secretaria (dialog com validação Zod)
 *   - Editar dados: nome, sigla, orçamento anual (dialog)
 *   - Ativar / desativar secretaria (toggle — sem exclusão)
 *   - Toast de feedback em todas as ações
 *
 * Regras de negócio:
 *   US-013 RN-65: nome e sigla únicos no sistema
 *   US-013 RN-66: secretaria inativa mantém histórico
 *   US-013 RN-68: não é possível excluir — apenas desativar
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

import {
  listSecretarias,
  createSecretaria,
  updateSecretaria,
  toggleSecretariaStatus,
} from '@/services/secretariasService'
import type { SecretariaResponse } from '@/services/secretariasService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractError(error: unknown): string {
  const axiosErr = error as AxiosError<{ detail?: string }>
  return axiosErr.response?.data?.detail ?? 'Erro inesperado. Tente novamente.'
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------------------------------------------------------------------------
// Schema — criar / editar secretaria
// ---------------------------------------------------------------------------

const secretariaSchema = z.object({
  nome: z.string().min(2, 'Mínimo 2 caracteres.').max(255, 'Máximo 255 caracteres.'),
  sigla: z
    .string()
    .min(2, 'Mínimo 2 caracteres.')
    .max(5, 'Máximo 5 caracteres.'),
  orcamento_anual: z
    .string()
    .optional()
    .refine((v) => {
      if (!v || v.trim() === '') return true
      const n = parseFloat(v.replace(',', '.'))
      return !isNaN(n) && n > 0
    }, 'Orçamento deve ser um número positivo.'),
})

type SecretariaFormData = z.infer<typeof secretariaSchema>

function parseOrcamento(raw: string | undefined): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw.replace(',', '.'))
  return isNaN(n) ? null : n
}

// ---------------------------------------------------------------------------
// Dialog — Criar / Editar Secretaria
// ---------------------------------------------------------------------------

interface SecretariaDialogProps {
  target: SecretariaResponse | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

function SecretariaDialog({ target, open, onOpenChange, onSuccess }: SecretariaDialogProps) {
  const isEdit = target !== null

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SecretariaFormData>({
    resolver: zodResolver(secretariaSchema),
    values: target
      ? {
          nome: target.nome,
          sigla: target.sigla,
          orcamento_anual: target.orcamento_anual != null
            ? String(target.orcamento_anual)
            : '',
        }
      : undefined,
  })

  async function onSubmit(data: SecretariaFormData) {
    const payload = {
      nome: data.nome,
      sigla: data.sigla.toUpperCase(),
      orcamento_anual: parseOrcamento(data.orcamento_anual),
    }
    try {
      if (isEdit) {
        await updateSecretaria(target.id, payload)
        toast.success('Secretaria atualizada com sucesso.')
      } else {
        await createSecretaria(payload)
        toast.success('Secretaria criada com sucesso.')
      }
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
          <DialogTitle>{isEdit ? 'Editar Secretaria' : 'Nova Secretaria'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados da secretaria. Nome e sigla devem ser únicos no sistema.'
              : 'Preencha os dados da nova secretaria. Nome e sigla devem ser únicos.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="sec-nome">Nome da secretaria</Label>
            <Input
              id="sec-nome"
              placeholder="Secretaria Municipal de Saúde"
              disabled={isSubmitting}
              {...register('nome')}
            />
            {errors.nome && (
              <p className="text-xs text-destructive">{errors.nome.message}</p>
            )}
          </div>

          {/* Sigla */}
          <div className="space-y-1.5">
            <Label htmlFor="sec-sigla">Sigla (máx. 5 chars)</Label>
            <Input
              id="sec-sigla"
              placeholder="SMS"
              maxLength={5}
              className="uppercase"
              disabled={isSubmitting}
              {...register('sigla')}
            />
            {errors.sigla && (
              <p className="text-xs text-destructive">{errors.sigla.message}</p>
            )}
          </div>

          {/* Orçamento anual (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="sec-orcamento">
              Orçamento anual (R$)
              <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="sec-orcamento"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0,00"
              disabled={isSubmitting}
              {...register('orcamento_anual')}
            />
            {errors.orcamento_anual && (
              <p className="text-xs text-destructive">{errors.orcamento_anual.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? 'Salvando…' : 'Criando…'}
                </>
              ) : isEdit ? (
                'Salvar'
              ) : (
                'Criar secretaria'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// AlertDialog — Confirmar toggle de status
// ---------------------------------------------------------------------------

interface ToggleConfirmProps {
  target: SecretariaResponse | null
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function ToggleStatusConfirm({ target, onConfirm, onCancel, isPending }: ToggleConfirmProps) {
  if (!target) return null
  const action = target.ativo ? 'desativar' : 'ativar'

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target.ativo ? 'Desativar' : 'Ativar'} secretaria?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target.ativo ? (
              <>
                A secretaria <strong>{target.nome}</strong> será desativada e não poderá
                receber novas ordens. O histórico existente é mantido.
              </>
            ) : (
              <>
                A secretaria <strong>{target.nome}</strong> será reativada e poderá
                receber novas ordens.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className={target.ativo ? 'bg-destructive hover:bg-destructive/90' : undefined}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {target.ativo ? 'Desativando…' : 'Ativando…'}
              </>
            ) : (
              `Sim, ${action}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------------------------------------------------------------------------
// Skeleton da tabela
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-20 rounded" />
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

export default function SecretariaManagementPage() {
  const queryClient = useQueryClient()

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SecretariaResponse | null>(null)
  const [toggleTarget, setToggleTarget] = useState<SecretariaResponse | null>(null)

  // Query
  const { data: secretarias, isLoading, isError } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['secretarias'] })
  }

  // Mutation — toggle status (ativar / desativar)
  const toggleStatus = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      toggleSecretariaStatus(id, ativo),
    onSuccess: (updated) => {
      toast.success(
        `Secretaria ${updated.ativo ? 'ativada' : 'desativada'} com sucesso.`,
      )
      setToggleTarget(null)
      invalidate()
    },
    onError: (error) => {
      toast.error(extractError(error))
      setToggleTarget(null)
    },
  })

  return (
    <div className="space-y-6">
      {/* Cabeçalho da página */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gestão de Secretarias</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {secretarias
              ? `${secretarias.length} secretaria(s) cadastrada(s)`
              : 'Carregando…'}
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nova Secretaria
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Sigla</TableHead>
              <TableHead>Orçamento Anual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton />}

            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive py-8">
                  Erro ao carregar secretarias. Tente recarregar a página.
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && secretarias?.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-8"
                >
                  Nenhuma secretaria cadastrada.
                </TableCell>
              </TableRow>
            )}

            {secretarias?.map((s) => (
              <TableRow key={s.id} className={s.ativo ? undefined : 'opacity-60'}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.sigla}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCurrency(s.orcamento_anual)}
                </TableCell>
                <TableCell>
                  <Badge variant={s.ativo ? 'default' : 'secondary'}>
                    {s.ativo ? 'Ativa' : 'Inativa'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {/* Editar */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTarget(s)}
                      aria-label={`Editar ${s.nome}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Ativar / Desativar — US-013 RN-68: sem exclusão */}
                    <Button
                      variant={s.ativo ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => setToggleTarget(s)}
                      aria-label={s.ativo ? `Desativar ${s.nome}` : `Ativar ${s.nome}`}
                    >
                      {s.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog — criar / editar */}
      <SecretariaDialog
        target={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={invalidate}
      />

      <SecretariaDialog
        target={editTarget}
        open={editTarget !== null}
        onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        onSuccess={invalidate}
      />

      {/* Confirmação de toggle de status */}
      {toggleTarget && (
        <ToggleStatusConfirm
          target={toggleTarget}
          isPending={toggleStatus.isPending}
          onConfirm={() =>
            toggleStatus.mutate({ id: toggleTarget.id, ativo: !toggleTarget.ativo })
          }
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}
