/**
 * Tela de Criação de Nova Ordem de Serviço — US-003.
 *
 * StepperForm de 3 etapas:
 *   Etapa 1 — Identificação: tipo, prioridade, responsável, secretaria (disabled)
 *   Etapa 2 — Detalhes: descrição, valor estimado (máscara BRL), justificativa (min 50 chars)
 *   Etapa 3 — Revisão: resumo completo + ConfirmationDialog antes de enviar
 *
 * Após criação bem-sucedida: SuccessScreen com protocolo, botão copiar e navegação.
 *
 * US-003 RN-13: protocolo gerado automaticamente no back-end.
 * US-003 RN-15: secretaria vinculada automaticamente ao usuário criador.
 * US-003 RN-18: valor_estimado deve ser positivo.
 * US-003 RN-19: justificativa mínimo de 50 caracteres.
 * US-003 RN-20: status inicial = AGUARDANDO_GABINETE (back-end).
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  CheckCircle,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  FileText,
  ClipboardList,
  CircleDollarSign,
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

import { useAuthStore } from '@/stores/authStore'
import { createOrdem } from '@/services/ordensService'
import { listSecretarias } from '@/services/secretariasService'
import {
  TIPO_ORDEM_LABELS,
  PRIORIDADE_LABELS,
  PRIORIDADE_CONFIG,
  JUSTIFICATIVA_MIN_LENGTH,
} from '@/utils/constants'
import { extractApiError } from '@/utils/formatters'
import type { TipoOrdem, Prioridade, Ordem } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Schemas de validação — por etapa
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
  /** US-003 RN-18: deve ser positivo. Valor em reais (sem centavos fracionados). */
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

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

/** Indicador do passo atual. */
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

/** Contador de caracteres com aviso visual. */
function CharacterCounter({
  current,
  min,
  label,
}: {
  current: number
  min: number
  label?: string
}) {
  const ok = current >= min
  return (
    <p className={['text-xs mt-1', ok ? 'text-muted-foreground' : 'text-destructive'].join(' ')}>
      {label ?? ''} {current}/{min} caracteres mínimos
    </p>
  )
}

/** Linha de resumo na etapa de revisão. */
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] break-words">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tela de sucesso
// ---------------------------------------------------------------------------

function SuccessScreen({
  ordem,
  onNova,
  onVerOrdens,
}: {
  ordem: Ordem
  onNova: () => void
  onVerOrdens: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(ordem.protocolo).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-10 w-10 text-green-600" />
      </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-bold">Ordem criada com sucesso!</h2>
        <p className="text-muted-foreground">
          Sua ordem foi registrada e encaminhada ao Gabinete para análise.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 pb-4">
          <p className="text-xs text-muted-foreground mb-1">Número de Protocolo</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl font-mono font-bold tracking-wider">
              {ordem.protocolo}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-7 w-7"
              title="Copiar protocolo"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Guarde este número para acompanhar sua ordem.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onVerOrdens}>
          Ver Minhas Ordens
        </Button>
        <Button onClick={onNova}>Criar Nova Ordem</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function NovaOrdemPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [step, setStep] = useState(1)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [valorInput, setValorInput] = useState('')
  const [ordemCriada, setOrdemCriada] = useState<Ordem | null>(null)

  // Busca secretarias para exibir o nome da secretaria do usuário
  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 1000 * 60 * 5,
  })

  const secretariaNome =
    secretarias?.find((s) => s.id === user?.secretaria_id)?.nome ?? user?.secretaria_id ?? '—'

  const {
    register,
    control,
    trigger,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tipo: undefined,
      prioridade: undefined,
      responsavel: '',
      descricao: '',
      valor_estimado: undefined,
      justificativa: '',
    },
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      createOrdem({
        tipo: data.tipo,
        prioridade: data.prioridade,
        responsavel: data.responsavel || undefined,
        descricao: data.descricao || undefined,
        valor_estimado: data.valor_estimado,
        justificativa: data.justificativa,
      }),
    onSuccess: (ordem) => {
      setOrdemCriada(ordem)
      setConfirmOpen(false)
      toast.success('Ordem criada com sucesso!', {
        description: `Protocolo: ${ordem.protocolo}`,
      })
    },
    onError: (error: AxiosError<{ detail: unknown }>) => {
      setConfirmOpen(false)
      const msg = extractApiError(error.response?.data?.detail, 'Erro ao criar ordem. Tente novamente.')
      toast.error('Erro ao criar ordem', { description: msg })
    },
  })

  // Avança para próxima etapa após validar campos da etapa atual
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

  function handleNova() {
    setOrdemCriada(null)
    setStep(1)
    setValorInput('')
  }

  const values = getValues()

  // -------------------------------------------------------------------------
  // Tela de sucesso
  // -------------------------------------------------------------------------
  if (ordemCriada) {
    return (
      <div className="container max-w-2xl mx-auto py-8 px-4">
        <SuccessScreen
          ordem={ordemCriada}
          onNova={handleNova}
          onVerOrdens={() => navigate('/secretaria/ordens')}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Alerta de orçamento (revisão)
  // -------------------------------------------------------------------------
  const secretaria = secretarias?.find((s) => s.id === user?.secretaria_id)
  const showBudgetAlert =
    step === 3 &&
    secretaria?.orcamento_anual != null &&
    values.valor_estimado > secretaria.orcamento_anual

  // -------------------------------------------------------------------------
  // Render principal
  // -------------------------------------------------------------------------
  return (
    <div className="container max-w-2xl mx-auto py-8 px-4">
      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Nova Ordem de Serviço</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Preencha os dados da ordem para encaminhar ao Gabinete.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between mb-8">
        {[
          { n: 1, label: 'Identificação', Icon: FileText },
          { n: 2, label: 'Detalhes', Icon: ClipboardList },
          { n: 3, label: 'Revisão', Icon: CircleDollarSign },
        ].map(({ n, label, Icon }, idx, arr) => (
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
            {idx < arr.length - 1 && (
              <div className="flex-1 h-px bg-border mx-3 mb-5" />
            )}
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
            {step === 1 && 'Classifique a ordem e informe o responsável.'}
            {step === 2 && 'Descreva o objeto e o valor estimado.'}
            {step === 3 && 'Confirme os dados antes de enviar ao Gabinete.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* ----------------------------------------------------------------
              ETAPA 1 — Identificação
          ---------------------------------------------------------------- */}
          {step === 1 && (
            <>
              {/* Secretaria (somente leitura — US-003 RN-15) */}
              <div className="space-y-1.5">
                <Label>Secretaria</Label>
                <Input value={secretariaNome} disabled className="bg-muted/40 cursor-not-allowed" />
                <p className="text-xs text-muted-foreground">
                  Vinculada automaticamente ao seu perfil.
                </p>
              </div>

              {/* Tipo de Ordem */}
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

              {/* Responsável (opcional) */}
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
              {/* Descrição */}
              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva brevemente o objeto desta ordem (opcional)."
                  rows={3}
                  {...register('descricao')}
                />
              </div>

              {/* Valor Estimado com máscara BRL */}
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

              {/* Justificativa com contador de caracteres */}
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
              {showBudgetAlert && (
                <Alert variant="destructive" className="mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    O valor estimado supera o orçamento anual da secretaria (
                    {secretaria!.orcamento_anual!.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                    ). Verifique antes de enviar.
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border bg-muted/20 px-4 py-2 divide-y">
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
                {values.descricao && (
                  <ReviewRow label="Descrição" value={values.descricao} />
                )}
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
                  {values.justificativa}
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
          onClick={handleVoltar}
          disabled={step === 1}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>

        {step < 3 ? (
          <Button onClick={handleNext} className="gap-1">
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} className="gap-1">
            Enviar ao Gabinete
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Modal de confirmação antes de enviar */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio</DialogTitle>
            <DialogDescription>
              A ordem será encaminhada ao Gabinete do Prefeito para análise. Após o envio, não
              será possível editar os dados até que ela seja devolvida para alteração.
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
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
