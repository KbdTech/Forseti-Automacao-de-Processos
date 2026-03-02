/**
 * FornecedoresAdminPage — S11.2.
 *
 * Tela de Gestão de Fornecedores — exclusiva para admin.
 *
 * Funcionalidades:
 *   - Listar fornecedores com skeleton loader e empty state
 *   - Filtros: busca (debounce 300ms), secretaria e status ativo/inativo
 *   - Criar novo fornecedor (Dialog com 12 campos + validação Zod)
 *   - Editar fornecedor (Dialog — CNPJ readOnly)
 *   - Ativar / desativar (AlertDialog de confirmação)
 *   - Toast de feedback em todas as ações
 *   - Erro 409 no CNPJ → mensagem inline no campo
 */

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { AxiosError } from 'axios'
import { Plus, Pencil, Loader2, Store } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { listSecretarias } from '@/services/secretariasService'
import {
  listFornecedores,
  createFornecedor,
  updateFornecedor,
  toggleFornecedorStatus,
} from '@/services/fornecedoresService'
import type { FornecedorCreate, FornecedorUpdate } from '@/services/fornecedoresService'
import type { FornecedorResponse } from '@/types/fornecedor'
import { formatBRL, parseBRL, formatCurrencyInput, formatCNPJ, parseCNPJ } from '@/utils/formatters'

// ---------------------------------------------------------------------------
// Hook de debounce (300ms) — padrão interno do projeto
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractApiError(error: unknown): string {
  const axiosErr = error as AxiosError<{ detail?: string }>
  return axiosErr.response?.data?.detail ?? 'Erro inesperado. Tente novamente.'
}

function getApiStatus(error: unknown): number | null {
  const axiosErr = error as AxiosError
  return axiosErr.response?.status ?? null
}

// ---------------------------------------------------------------------------
// Schema Zod — criar / editar fornecedor
// ---------------------------------------------------------------------------

const fornecedorSchema = z.object({
  razao_social: z
    .string()
    .min(2, 'Mínimo 2 caracteres.')
    .max(255, 'Máximo 255 caracteres.'),
  nome_fantasia: z.string().max(255, 'Máximo 255 caracteres.').optional(),
  cnpj: z
    .string()
    .min(1, 'CNPJ obrigatório.')
    .refine(
      (v) => parseCNPJ(v).length === 14,
      'CNPJ deve ter 14 dígitos.',
    ),
  numero_processo: z.string().max(100, 'Máximo 100 caracteres.').optional(),
  objeto_contrato: z.string().max(1000, 'Máximo 1000 caracteres.').optional(),
  valor_contratado: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === '' || parseBRL(v) >= 0,
      'Valor inválido.',
    ),
  data_contrato: z.string().optional(),
  banco: z.string().max(100, 'Máximo 100 caracteres.').optional(),
  agencia: z.string().max(20, 'Máximo 20 caracteres.').optional(),
  conta: z.string().max(20, 'Máximo 20 caracteres.').optional(),
  tipo_conta: z.enum(['corrente', 'poupanca']),
  secretaria_id: z.string().optional(),
})

type FornecedorFormData = z.infer<typeof fornecedorSchema>

function buildPayload(data: FornecedorFormData): FornecedorCreate | FornecedorUpdate {
  return {
    razao_social: data.razao_social,
    nome_fantasia: data.nome_fantasia?.trim() || null,
    cnpj: parseCNPJ(data.cnpj),
    numero_processo: data.numero_processo?.trim() || null,
    objeto_contrato: data.objeto_contrato?.trim() || null,
    valor_contratado: data.valor_contratado?.trim() ? parseBRL(data.valor_contratado) : null,
    data_contrato: data.data_contrato?.trim() || null,
    banco: data.banco?.trim() || null,
    agencia: data.agencia?.trim() || null,
    conta: data.conta?.trim() || null,
    tipo_conta: data.tipo_conta,
    secretaria_id: data.secretaria_id && data.secretaria_id !== 'GLOBAL'
      ? data.secretaria_id
      : null,
  }
}

function getFormValues(target: FornecedorResponse): FornecedorFormData {
  return {
    razao_social: target.razao_social,
    nome_fantasia: target.nome_fantasia ?? '',
    cnpj: formatCNPJ(target.cnpj),
    numero_processo: target.numero_processo ?? '',
    objeto_contrato: target.objeto_contrato ?? '',
    valor_contratado: target.valor_contratado != null
      ? formatCurrencyInput(target.valor_contratado)
      : '',
    data_contrato: target.data_contrato ?? '',
    banco: target.banco ?? '',
    agencia: target.agencia ?? '',
    conta: target.conta ?? '',
    tipo_conta: (target.tipo_conta as 'corrente' | 'poupanca') ?? 'corrente',
    secretaria_id: target.secretaria_id ?? 'GLOBAL',
  }
}

// ---------------------------------------------------------------------------
// Dialog — Criar / Editar Fornecedor
// ---------------------------------------------------------------------------

interface FornecedorDialogProps {
  target: FornecedorResponse | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}

function FornecedorDialog({ target, open, onOpenChange, onSuccess }: FornecedorDialogProps) {
  const isEdit = target !== null

  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 5 * 60 * 1000,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FornecedorFormData>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: { tipo_conta: 'corrente' },
    values: target ? getFormValues(target) : undefined,
  })

  async function onSubmit(data: FornecedorFormData) {
    try {
      const payload = buildPayload(data)
      if (isEdit) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { cnpj: _cnpj, ...updatePayload } = payload as FornecedorCreate
        await updateFornecedor(target.id, updatePayload as FornecedorUpdate)
        toast.success('Fornecedor atualizado com sucesso.')
      } else {
        await createFornecedor(payload as FornecedorCreate)
        toast.success('Fornecedor cadastrado com sucesso.')
      }
      reset()
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      const status = getApiStatus(error)
      if (status === 409) {
        setError('cnpj', { message: 'CNPJ já cadastrado no sistema.' })
      } else {
        toast.error(extractApiError(error))
      }
    }
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize os dados do fornecedor. O CNPJ não pode ser alterado após o cadastro.'
              : 'Preencha os dados do fornecedor vencedor da licitação. CNPJ deve ser único.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* --- Dados básicos --- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Razão Social */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="forn-razao">
                Razão Social <span className="text-destructive">*</span>
              </Label>
              <Input
                id="forn-razao"
                placeholder="Empresa Ltda."
                disabled={isSubmitting}
                {...register('razao_social')}
              />
              {errors.razao_social && (
                <p className="text-xs text-destructive">{errors.razao_social.message}</p>
              )}
            </div>

            {/* Nome Fantasia */}
            <div className="space-y-1.5">
              <Label htmlFor="forn-fantasia">
                Nome Fantasia
                <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="forn-fantasia"
                placeholder="Nome comercial"
                disabled={isSubmitting}
                {...register('nome_fantasia')}
              />
            </div>

            {/* CNPJ */}
            <div className="space-y-1.5">
              <Label htmlFor="forn-cnpj">
                CNPJ <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="cnpj"
                control={control}
                render={({ field }) => (
                  <Input
                    id="forn-cnpj"
                    placeholder="00.000.000/0000-00"
                    readOnly={isEdit}
                    disabled={isSubmitting && !isEdit}
                    className={isEdit ? 'bg-muted cursor-not-allowed' : undefined}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      const masked = formatCNPJ(e.target.value)
                      field.onChange(masked)
                    }}
                  />
                )}
              />
              {errors.cnpj && (
                <p className="text-xs text-destructive">{errors.cnpj.message}</p>
              )}
            </div>
          </div>

          {/* --- Dados licitatórios --- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Nº Processo */}
            <div className="space-y-1.5">
              <Label htmlFor="forn-processo">
                Nº Processo Licitatório
                <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="forn-processo"
                placeholder="Ex: 001/2024"
                disabled={isSubmitting}
                {...register('numero_processo')}
              />
              {errors.numero_processo && (
                <p className="text-xs text-destructive">{errors.numero_processo.message}</p>
              )}
            </div>

            {/* Valor Contratado — padrão BUG-001 */}
            <div className="space-y-1.5">
              <Label htmlFor="forn-valor">
                Valor Contratado (R$)
                <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="forn-valor"
                type="text"
                placeholder="Ex: 150.000,00"
                disabled={isSubmitting}
                {...register('valor_contratado')}
              />
              {errors.valor_contratado && (
                <p className="text-xs text-destructive">{errors.valor_contratado.message}</p>
              )}
            </div>

            {/* Data do Contrato */}
            <div className="space-y-1.5">
              <Label htmlFor="forn-data">
                Data do Contrato
                <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="forn-data"
                type="date"
                disabled={isSubmitting}
                {...register('data_contrato')}
              />
            </div>

            {/* Secretaria */}
            <div className="space-y-1.5">
              <Label>
                Secretaria vinculada
                <span className="ml-1 text-xs text-muted-foreground">(vazio = Global)</span>
              </Label>
              <Controller
                name="secretaria_id"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? 'GLOBAL'}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Global (sem vínculo)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GLOBAL">Global (sem vínculo)</SelectItem>
                      {secretarias?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.sigla} — {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Objeto do Contrato */}
          <div className="space-y-1.5">
            <Label htmlFor="forn-objeto">
              Objeto do Contrato
              <span className="ml-1 text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="forn-objeto"
              placeholder="Descrição do objeto licitado..."
              rows={3}
              disabled={isSubmitting}
              {...register('objeto_contrato')}
            />
            {errors.objeto_contrato && (
              <p className="text-xs text-destructive">{errors.objeto_contrato.message}</p>
            )}
          </div>

          {/* --- Dados bancários --- */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Dados Bancários (opcional)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="forn-banco">Banco</Label>
                <Input
                  id="forn-banco"
                  placeholder="Ex: Bradesco"
                  disabled={isSubmitting}
                  {...register('banco')}
                />
                {errors.banco && (
                  <p className="text-xs text-destructive">{errors.banco.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="forn-agencia">Agência</Label>
                <Input
                  id="forn-agencia"
                  placeholder="0001-x"
                  disabled={isSubmitting}
                  {...register('agencia')}
                />
                {errors.agencia && (
                  <p className="text-xs text-destructive">{errors.agencia.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="forn-conta">Conta</Label>
                <Input
                  id="forn-conta"
                  placeholder="00000-0"
                  disabled={isSubmitting}
                  {...register('conta')}
                />
                {errors.conta && (
                  <p className="text-xs text-destructive">{errors.conta.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de Conta</Label>
                <Controller
                  name="tipo_conta"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corrente">Corrente</SelectItem>
                        <SelectItem value="poupanca">Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? 'Salvando…' : 'Cadastrando…'}
                </>
              ) : isEdit ? (
                'Salvar'
              ) : (
                'Cadastrar fornecedor'
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
  target: FornecedorResponse | null
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

function ToggleStatusConfirm({ target, onConfirm, onCancel, isPending }: ToggleConfirmProps) {
  if (!target) return null
  const action = target.is_active ? 'desativar' : 'ativar'

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target.is_active ? 'Desativar' : 'Ativar'} fornecedor?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target.is_active ? (
              <>
                Deseja desativar <strong>{target.razao_social}</strong>?{' '}
                Ele não poderá ser selecionado em novas ordens.
              </>
            ) : (
              <>
                Deseja reativar <strong>{target.razao_social}</strong>?{' '}
                Ele voltará a estar disponível para seleção em novas ordens.
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
            className={target.is_active ? 'bg-destructive hover:bg-destructive/90' : undefined}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {target.is_active ? 'Desativando…' : 'Ativando…'}
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
          <TableCell><Skeleton className="h-4 w-52" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
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

export default function FornecedoresAdminPage() {
  const queryClient = useQueryClient()

  // Filtros
  const [searchQuery, setSearchQuery] = useState('')
  const [secretariaFilter, setSecretariaFilter] = useState('TODAS')
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo' | 'TODOS'>('TODOS')

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FornecedorResponse | null>(null)
  const [toggleTarget, setToggleTarget] = useState<FornecedorResponse | null>(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  // Secretarias para o filtro
  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 5 * 60 * 1000,
  })

  // Query principal
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fornecedores', debouncedQuery, secretariaFilter, statusFilter],
    queryFn: () =>
      listFornecedores({
        q: debouncedQuery || undefined,
        secretaria_id:
          secretariaFilter !== 'TODAS' ? secretariaFilter : undefined,
        is_active:
          statusFilter === 'ativo'
            ? true
            : statusFilter === 'inativo'
              ? false
              : undefined,
      }),
  })

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
  }

  // Mutation — toggle status
  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleFornecedorStatus(id, isActive),
    onSuccess: (updated) => {
      toast.success(updated.is_active ? 'Fornecedor ativado.' : 'Fornecedor desativado.')
      setToggleTarget(null)
      invalidate()
    },
    onError: (error) => {
      toast.error(extractApiError(error))
      setToggleTarget(null)
    },
  })

  const fornecedores = data?.items ?? []
  const total = data?.total ?? 0
  const hasActiveFilters =
    debouncedQuery !== '' || secretariaFilter !== 'TODAS' || statusFilter !== 'TODOS'

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gestão de Fornecedores</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Carregando…' : `${total} fornecedor(es) encontrado(s)`}
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Novo Fornecedor
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Buscar por razão social ou CNPJ…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sm:max-w-xs"
        />

        <Select value={secretariaFilter} onValueChange={setSecretariaFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Secretaria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas as secretarias</SelectItem>
            {secretarias?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.sigla} — {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'ativo' | 'inativo' | 'TODOS')}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razão Social</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Nº Processo</TableHead>
              <TableHead>Valor Contratado</TableHead>
              <TableHead>Secretaria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableSkeleton />}

            {isError && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive py-8">
                  Erro ao carregar fornecedores. Tente recarregar a página.
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && fornecedores.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12">
                  <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <Store className="h-10 w-10 opacity-30" aria-hidden="true" />
                    <p className="text-sm">Nenhum fornecedor encontrado.</p>
                    {!hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Cadastrar Primeiro Fornecedor
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {fornecedores.map((f) => (
              <TableRow key={f.id} className={f.is_active ? undefined : 'opacity-60'}>
                <TableCell className="font-medium max-w-[200px]">
                  <span className="block truncate" title={f.razao_social}>
                    {f.razao_social}
                  </span>
                  {f.nome_fantasia && (
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      title={f.nome_fantasia}
                    >
                      {f.nome_fantasia}
                    </span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap">
                  {formatCNPJ(f.cnpj)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {f.numero_processo ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                  {formatBRL(f.valor_contratado)}
                </TableCell>
                <TableCell className="text-sm">
                  {f.secretaria_nome ? (
                    <span title={f.secretaria_nome}>{f.secretaria_nome}</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">Global</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={f.is_active ? 'default' : 'secondary'}>
                    {f.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditTarget(f)}
                      aria-label={`Editar ${f.razao_social}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant={f.is_active ? 'outline' : 'default'}
                      size="sm"
                      onClick={() => setToggleTarget(f)}
                      aria-label={
                        f.is_active
                          ? `Desativar ${f.razao_social}`
                          : `Ativar ${f.razao_social}`
                      }
                    >
                      {f.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog — criar */}
      <FornecedorDialog
        target={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={invalidate}
      />

      {/* Dialog — editar */}
      <FornecedorDialog
        target={editTarget}
        open={editTarget !== null}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null)
        }}
        onSuccess={invalidate}
      />

      {/* AlertDialog — confirmar toggle */}
      {toggleTarget && (
        <ToggleStatusConfirm
          target={toggleTarget}
          isPending={toggleStatus.isPending}
          onConfirm={() =>
            toggleStatus.mutate({ id: toggleTarget.id, isActive: !toggleTarget.is_active })
          }
          onCancel={() => setToggleTarget(null)}
        />
      )}
    </div>
  )
}
