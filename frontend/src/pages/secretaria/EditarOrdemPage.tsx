/**
 * EditarOrdemPage — edição e reenvio de ordem devolvida — US-006.
 *
 * Rota: /secretaria/ordens/:id/editar
 *
 * Features:
 *   - Carrega a ordem e valida status DEVOLVIDA_PARA_ALTERACAO
 *   - DevolucaoAlert no topo com o motivo de devolução do Gabinete
 *   - StepperForm de 3 etapas com dados pré-preenchidos
 *   - Secretaria e Protocolo são somente-leitura (US-006 RN-33/34)
 *   - Etapa 3: revisão com contador de versão (v{n} → v{n+1})
 *   - Confirmação antes de reenviar
 *   - PUT /ordens/:id → PATCH /ordens/:id/acao {acao:'reenviar'}
 *
 * US-006 RN-32: somente DEVOLVIDA_PARA_ALTERACAO podem ser editadas.
 * US-006 RN-33: protocolo e secretaria permanecem inalterados.
 * US-006 RN-34: protocolo original mantido — não gera novo número.
 * US-006 RN-35: versao é incrementada no back-end.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import { getOrdem, updateOrdem, executeAcao } from '@/services/ordensService'
import { listSecretarias } from '@/services/secretariasService'
import {
  TIPO_ORDEM_LABELS,
  PRIORIDADE_LABELS,
  PRIORIDADE_CONFIG,
  JUSTIFICATIVA_MIN_LENGTH,
} from '@/utils/constants'
import type { OrdemHistorico, TipoOrdem, Prioridade } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const etapa1Schema = z.object({
  tipo: z.enum(['COMPRA', 'SERVICO', 'OBRA'], {
    required_error: 'Selecione o tipo de ordem.',
  }),
  prioridade: z.enum(['NORMAL', 'ALTA', 'URGENTE'], {
    required_error: 'Selecione a prioridade.',
  }),
  responsavel: z.string().max(255).optional(),
})

const etapa2Schema = z.object({
  descricao: z.string().max(1000).optional(),
  /** US-003 RN-18: deve ser positivo. */
  valor_estimado: z
    .number({ invalid_type_error: 'Informe um valor válido.' })
    .positive('O valor estimado deve ser positivo.'),
  /** US-003 RN-19: mínimo 50 caracteres. */
  justificativa: z
    .string()
    .min(
      JUSTIFICATIVA_MIN_LENGTH,
      `A justificativa deve ter pelo menos ${JUSTIFICATIVA_MIN_LENGTH} caracteres.`,
    ),
})

const formSchema = etapa1Schema.merge(etapa2Schema)
type FormData = z.infer<typeof formSchema>

// ---------------------------------------------------------------------------
// Helpers — máscara de moeda brasileira (R$ 1.234,56)
// ---------------------------------------------------------------------------

function formatBRL(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const num = parseInt(digits, 10) / 100
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseBRL(formatted: string): number {
  const cleaned = formatted.replace(/[R$\s.]/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}

/** Encontra a última entrada de 'solicitar_alteracao' no histórico. */
function getDevolucaoEntry(historico: OrdemHistorico[]): OrdemHistorico | undefined {
  return [...historico].reverse().find((h) => h.acao === 'solicitar_alteracao')
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function StepIndicator({ step, current }: { step: number; current: number }) {
  const done = step < current
  const active = step === current
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={[
          'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
          done
            ? 'border-primary bg-primary text-primary-foreground'
            : active
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-muted-foreground/30 text-muted-foreground',
        ].join(' ')}
      >
        {done ? <Check className="h-4 w-4" /> : step}
      </div>
    </div>
  )
}

function CharacterCounter({ current, min }: { current: number; min: number }) {
  const ok = current >= min
  return (
    <p className={['text-xs mt-1', ok ? 'text-muted-foreground' : 'text-destructive'].join(' ')}>
      {current}/{min} caracteres mínimos
    </p>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] break-words">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function EditarOrdemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(1)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [valorInput, setValorInput] = useState('')

  const { data: ordem, isLoading: ordemLoading } = useQuery({
    queryKey: ['ordem', id],
    queryFn: () => getOrdem(id!),
    enabled: !!id,
    staleTime: 1000 * 30,
  })

  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 1000 * 60 * 5,
  })

  const secretariaNome =
    secretarias?.find((s) => s.id === ordem?.secretaria_id)?.nome ??
    ordem?.secretaria_nome ??
    '—'

  const {
    register,
    control,
    trigger,
    getValues,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
  })

  const justificativa = watch('justificativa') ?? ''

  // Pré-preenchimento do formulário quando a ordem carregar — US-006 RN-32
  useEffect(() => {
    if (!ordem) return

    if (ordem.status !== 'DEVOLVIDA_PARA_ALTERACAO') {
      toast.error('Ordem não disponível para edição', {
        description: 'Apenas ordens devolvidas pelo Gabinete podem ser editadas.',
      })
      navigate('/secretaria/devolvidas')
      return
    }

    // Formata valor para máscara BRL
    const formatted = ordem.valor_estimado.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
    setValorInput(formatted)

    reset({
      tipo: ordem.tipo,
      prioridade: ordem.prioridade,
      responsavel: ordem.responsavel ?? '',
      descricao: ordem.descricao ?? '',
      valor_estimado: ordem.valor_estimado,
      justificativa: ordem.justificativa,
    })
  }, [ordem, reset, navigate])

  const devolucaoEntry = ordem?.historico ? getDevolucaoEntry(ordem.historico) : null

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Primeiro: atualiza os dados da ordem — US-006 RN-33 (protocolo/secretaria mantidos)
      await updateOrdem(id!, {
        tipo: data.tipo,
        prioridade: data.prioridade,
        responsavel: data.responsavel || undefined,
        descricao: data.descricao || undefined,
        valor_estimado: data.valor_estimado,
        justificativa: data.justificativa,
      })
      // Segundo: executa ação de reenvio — US-006 RN-35 (versao incrementada no back-end)
      return executeAcao(id!, { acao: 'reenviar' })
    },
    onSuccess: (ordemAtualizada) => {
      toast.success('Ordem reenviada com sucesso!', {
        description: `${ordemAtualizada.protocolo} encaminhada ao Gabinete para nova análise.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', id] })
      setConfirmOpen(false)
      navigate('/secretaria/devolvidas')
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      setConfirmOpen(false)
      const msg = error.response?.data?.detail ?? 'Erro ao reenviar a ordem. Tente novamente.'
      toast.error('Erro ao reenviar', { description: msg })
    },
  })

  async function handleNext() {
    const fields =
      step === 1
        ? (['tipo', 'prioridade', 'responsavel'] as const)
        : (['descricao', 'valor_estimado', 'justificativa'] as const)

    const valid = await trigger(fields)
    if (valid) setStep((s) => s + 1)
  }

  function handleVoltar() {
    setStep((s) => s - 1)
  }

  function handleConfirm() {
    mutation.mutate(getValues())
  }

  const values = getValues()

  // Skeleton enquanto carrega a ordem
  if (ordemLoading) {
    return (
      <div className="container max-w-2xl mx-auto py-8 px-4 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      {/* Cabeçalho */}
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Editar e Reenviar Ordem</h1>
          {ordem && (
            <Badge variant="secondary" className="font-mono text-sm">
              {ordem.protocolo}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Realize as alterações solicitadas pelo Gabinete e reenvie para nova análise.
        </p>
      </div>

      {/* Alerta de devolução — motivo do Gabinete */}
      {devolucaoEntry && (
        <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4 space-y-2 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5 shrink-0" />
            <div className="space-y-1 flex-1">
              <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">
                Motivo da Devolução — {devolucaoEntry.usuario_nome}
              </p>
              <blockquote className="text-sm text-yellow-900 italic border-l-2 border-yellow-400 pl-3">
                {devolucaoEntry.observacao ?? 'Sem observação informada.'}
              </blockquote>
              <p className="text-xs text-yellow-700">
                Devolvida em {formatDate(devolucaoEntry.created_at)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-between mb-8">
        {[
          { n: 1, label: 'Identificação', Icon: FileText },
          { n: 2, label: 'Detalhes', Icon: ClipboardList },
          { n: 3, label: 'Revisão', Icon: CircleDollarSign },
        ].map(({ n, label }, idx, arr) => (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1">
              <StepIndicator step={n} current={step} />
              <span
                className={[
                  'text-xs font-medium',
                  n === step ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {idx < arr.length - 1 && <div className="flex-1 h-px bg-border mx-3 mb-5" />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && 'Etapa 1 — Identificação'}
            {step === 2 && 'Etapa 2 — Detalhes'}
            {step === 3 && 'Etapa 3 — Revisão'}
          </CardTitle>
          <CardDescription>
            {step === 1 && 'Verifique a classificação da ordem.'}
            {step === 2 && 'Atualize o objeto e o valor estimado conforme solicitado.'}
            {step === 3 && 'Confirme os dados antes de reenviar ao Gabinete.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* ----------------------------------------------------------------
              ETAPA 1 — Identificação
          ---------------------------------------------------------------- */}
          {step === 1 && (
            <>
              {/* Protocolo somente leitura — US-006 RN-33/34 */}
              <div className="space-y-1.5">
                <Label>Protocolo</Label>
                <Input
                  value={ordem?.protocolo ?? ''}
                  disabled
                  className="bg-muted/40 cursor-not-allowed font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  O protocolo original é mantido — US-006 RN-34.
                </p>
              </div>

              {/* Secretaria somente leitura — US-006 RN-33 */}
              <div className="space-y-1.5">
                <Label>Secretaria</Label>
                <Input
                  value={secretariaNome}
                  disabled
                  className="bg-muted/40 cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  A secretaria não pode ser alterada.
                </p>
              </div>

              {/* Tipo */}
              <div className="space-y-1.5">
                <Label htmlFor="tipo">
                  Tipo de Ordem <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="tipo"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(v) => field.onChange(v as TipoOrdem)}
                      value={field.value}
                    >
                      <SelectTrigger
                        id="tipo"
                        aria-invalid={!!errors.tipo}
                        className={errors.tipo ? 'border-destructive' : ''}
                      >
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(TIPO_ORDEM_LABELS) as TipoOrdem[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {TIPO_ORDEM_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.tipo && (
                  <p className="text-xs text-destructive">{errors.tipo.message}</p>
                )}
              </div>

              {/* Prioridade */}
              <div className="space-y-1.5">
                <Label htmlFor="prioridade">
                  Prioridade <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="prioridade"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(v) => field.onChange(v as Prioridade)}
                      value={field.value}
                    >
                      <SelectTrigger
                        id="prioridade"
                        aria-invalid={!!errors.prioridade}
                        className={errors.prioridade ? 'border-destructive' : ''}
                      >
                        <SelectValue placeholder="Selecione a prioridade" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORIDADE_LABELS) as Prioridade[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {PRIORIDADE_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.prioridade && (
                  <p className="text-xs text-destructive">{errors.prioridade.message}</p>
                )}
              </div>

              {/* Responsável */}
              <div className="space-y-1.5">
                <Label htmlFor="responsavel">Responsável</Label>
                <Input
                  id="responsavel"
                  placeholder="Nome do responsável (opcional)"
                  {...register('responsavel')}
                />
              </div>
            </>
          )}

          {/* ----------------------------------------------------------------
              ETAPA 2 — Detalhes
          ---------------------------------------------------------------- */}
          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva brevemente o objeto desta ordem (opcional)."
                  rows={3}
                  {...register('descricao')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valor_estimado">
                  Valor Estimado <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="valor_estimado"
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  value={valorInput}
                  aria-invalid={!!errors.valor_estimado}
                  className={errors.valor_estimado ? 'border-destructive' : ''}
                  onChange={(e) => {
                    const formatted = formatBRL(e.target.value)
                    setValorInput(formatted)
                    setValue('valor_estimado', parseBRL(formatted), {
                      shouldValidate: true,
                    })
                  }}
                />
                {errors.valor_estimado && (
                  <p className="text-xs text-destructive">{errors.valor_estimado.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="justificativa">
                  Justificativa <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="justificativa"
                  control={control}
                  render={({ field }) => (
                    <>
                      <Textarea
                        id="justificativa"
                        placeholder={`Descreva a necessidade desta ordem (mínimo ${JUSTIFICATIVA_MIN_LENGTH} caracteres).`}
                        rows={5}
                        aria-invalid={!!errors.justificativa}
                        className={errors.justificativa ? 'border-destructive' : ''}
                        {...field}
                      />
                      <CharacterCounter
                        current={field.value?.length ?? 0}
                        min={JUSTIFICATIVA_MIN_LENGTH}
                      />
                    </>
                  )}
                />
                {errors.justificativa && (
                  <p className="text-xs text-destructive">{errors.justificativa.message}</p>
                )}
              </div>
            </>
          )}

          {/* ----------------------------------------------------------------
              ETAPA 3 — Revisão
          ---------------------------------------------------------------- */}
          {step === 3 && (
            <>
              {/* Aviso de reenvio com contador de versão — US-006 RN-35 */}
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertTriangle className="h-4 w-4 text-yellow-700" />
                <AlertDescription className="text-yellow-800">
                  Ao confirmar, a ordem será reenviada ao Gabinete para nova análise. A versão será
                  incrementada de{' '}
                  <Badge variant="secondary" className="font-mono text-xs mx-1">
                    v{ordem?.versao}
                  </Badge>
                  para{' '}
                  <Badge variant="outline" className="font-mono text-xs mx-1">
                    v{(ordem?.versao ?? 0) + 1}
                  </Badge>
                  .
                </AlertDescription>
              </Alert>

              <div className="rounded-lg border bg-muted/20 px-4 py-2 divide-y">
                <ReviewRow label="Protocolo" value={ordem?.protocolo ?? '—'} />
                <ReviewRow label="Secretaria" value={secretariaNome} />
                <ReviewRow
                  label="Tipo"
                  value={TIPO_ORDEM_LABELS[values.tipo as TipoOrdem] ?? '—'}
                />
                <ReviewRow
                  label="Prioridade"
                  value={PRIORIDADE_LABELS[values.prioridade as Prioridade] ?? '—'}
                />
                {values.responsavel && (
                  <ReviewRow label="Responsável" value={values.responsavel} />
                )}
                {values.descricao && <ReviewRow label="Descrição" value={values.descricao} />}
                <ReviewRow
                  label="Valor Estimado"
                  value={
                    values.valor_estimado
                      ? values.valor_estimado.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })
                      : '—'
                  }
                />
              </div>

              <Separator />

              <div>
                <p className="text-sm font-medium mb-1">Justificativa</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {justificativa}
                </p>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <Badge
                  className={[
                    PRIORIDADE_CONFIG[values.prioridade as Prioridade]?.bg ?? '',
                    PRIORIDADE_CONFIG[values.prioridade as Prioridade]?.text ?? '',
                    'border-0',
                  ].join(' ')}
                >
                  {PRIORIDADE_LABELS[values.prioridade as Prioridade] ?? '—'}
                </Badge>
                <Badge variant="outline">
                  {TIPO_ORDEM_LABELS[values.tipo as TipoOrdem] ?? '—'}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Navegação entre etapas */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={step === 1 ? () => navigate('/secretaria/devolvidas') : handleVoltar}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          {step === 1 ? 'Cancelar' : 'Voltar'}
        </Button>

        {step < 3 ? (
          <Button onClick={handleNext} className="gap-1">
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} className="gap-1.5">
            <RotateCcw className="h-4 w-4" />
            Reenviar ao Gabinete
          </Button>
        )}
      </div>

      {/* Diálogo de confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Reenvio</DialogTitle>
            <DialogDescription>
              Confirma o reenvio da ordem{' '}
              <span className="font-mono font-semibold">{ordem?.protocolo}</span> ao Gabinete para
              nova análise?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={mutation.isPending} className="gap-1.5">
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Reenvio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
