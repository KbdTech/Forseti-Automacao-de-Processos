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

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  CheckCircle,
  CloudUpload,
  Copy,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  FileText,
  ClipboardList,
  CircleDollarSign,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DocumentUploader } from '@/components/ordens/DocumentUploader'
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
import { uploadDocumento } from '@/services/documentosService'
import { listSecretarias } from '@/services/secretariasService'
import { listFornecedores } from '@/services/fornecedoresService'
import {
  TIPO_ORDEM_LABELS,
  PRIORIDADE_LABELS,
  PRIORIDADE_CONFIG,
  JUSTIFICATIVA_MIN_LENGTH,
} from '@/utils/constants'
import { extractApiError, formatCNPJ } from '@/utils/formatters'
import type { TipoOrdem, Prioridade, Ordem } from '@/types/ordem'
import type { FornecedorResponse } from '@/types/fornecedor'

// ---------------------------------------------------------------------------
// Hook de debounce — padrão interno (300ms)
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
// Schemas de validação — por etapa
// ---------------------------------------------------------------------------

const etapa1Schema = z.object({
  tipo: z.enum(['compra', 'servico', 'obra'], {
    required_error: 'Selecione o tipo de ordem.',
  }),
  prioridade: z.enum(['normal', 'alta', 'urgente'], {
    required_error: 'Selecione a prioridade.',
  }),
  responsavel: z.string().max(255).optional(),
  /** US-016: declaração de assinatura digital via GovBR. */
  assinatura_govbr: z.boolean().default(false),
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
// Validação de arquivo (US-015)
// ---------------------------------------------------------------------------

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function validatePendingFile(file: File): string | null {
  if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
    return `Tipo "${file.type || 'desconhecido'}" não permitido. Use PDF, JPEG ou PNG.`
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Arquivo muito grande (${formatBytes(file.size)}). Máximo: 10 MB.`
  }
  if (file.size === 0) return 'Arquivo vazio não é permitido.'
  return null
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

      {/* US-015: upload de documentos logo após criação */}
      <div className="w-full max-w-lg rounded-lg border p-4 text-left">
        <p className="text-sm font-medium mb-3">
          Anexar documentos à ordem (opcional)
        </p>
        <DocumentUploader ordemId={ordem.id} />
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingDragOver, setPendingDragOver] = useState(false)
  const pendingFileInputRef = useRef<HTMLInputElement>(null)

  // S11.3 — Fornecedor obrigatório
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<FornecedorResponse | null>(null)
  const [fornecedorSearch, setFornecedorSearch] = useState('')
  const debouncedFornecedorSearch = useDebounce(fornecedorSearch, 300)

  // Busca secretarias para exibir o nome da secretaria do usuário
  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 1000 * 60 * 5,
  })

  // S11.3 — Carrega fornecedores ativos filtrados por busca (is_active=true)
  const { data: fornecedoresData, isLoading: isFornecedoresLoading } = useQuery({
    queryKey: ['fornecedores-select', debouncedFornecedorSearch],
    queryFn: () => listFornecedores({ q: debouncedFornecedorSearch || undefined, is_active: true }),
    staleTime: 1000 * 60,
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
      assinatura_govbr: false,
      descricao: '',
      valor_estimado: undefined,
      justificativa: '',
    },
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const ordem = await createOrdem({
        tipo: data.tipo,
        prioridade: data.prioridade,
        responsavel: data.responsavel || undefined,
        descricao: data.descricao || undefined,
        valor_estimado: data.valor_estimado,
        justificativa: data.justificativa,
        assinatura_govbr: data.assinatura_govbr ?? false,
        // S11.3: fornecedor obrigatório — guard garante que não é null
        fornecedor_id: fornecedorSelecionado!.id,
      })
      // US-015: upload de arquivos selecionados durante o preenchimento
      if (pendingFiles.length > 0) {
        const results = await Promise.allSettled(
          pendingFiles.map((file) => uploadDocumento(ordem.id, { file })),
        )
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed > 0) {
          toast.warning(
            `${failed} documento(s) não puderam ser enviados. Tente novamente na tela da ordem.`,
          )
        }
      }
      return ordem
    },
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
    setPendingFiles([])
    setFornecedorSelecionado(null)
    setFornecedorSearch('')
  }

  function addPendingFile(file: File) {
    const error = validatePendingFile(file)
    if (error) { toast.error(error); return }
    // evita duplicatas por nome+tamanho
    if (pendingFiles.some((f) => f.name === file.name && f.size === file.size)) return
    setPendingFiles((prev) => [...prev, file])
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function handlePendingFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(addPendingFile)
    e.target.value = ''
  }

  function handlePendingDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setPendingDragOver(false)
    Array.from(e.dataTransfer.files).forEach(addPendingFile)
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

              {/* Fornecedor — S11.3: obrigatório em todas as ordens */}
              <div className="space-y-1.5">
                <Label htmlFor="forn-search">
                  Fornecedor <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="forn-search"
                  placeholder="Buscar por nome ou CNPJ…"
                  value={fornecedorSearch}
                  onChange={(e) => setFornecedorSearch(e.target.value)}
                  className="h-9 text-sm"
                />
                <Select
                  value={fornecedorSelecionado?.id ?? ''}
                  onValueChange={(id) => {
                    const f = fornecedoresData?.items.find((item) => item.id === id) ?? null
                    setFornecedorSelecionado(f)
                  }}
                >
                  <SelectTrigger
                    className={!fornecedorSelecionado ? 'border-muted-foreground/40' : ''}
                  >
                    <SelectValue placeholder="Selecionar fornecedor da licitação…" />
                  </SelectTrigger>
                  <SelectContent>
                    {isFornecedoresLoading && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        Carregando fornecedores…
                      </div>
                    )}
                    {!isFornecedoresLoading && !fornecedoresData?.items.length && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        Nenhum fornecedor disponível.
                      </div>
                    )}
                    {fornecedoresData?.items.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <span className="font-medium">{f.razao_social}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {formatCNPJ(f.cnpj)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!fornecedoresData?.items.length && !isFornecedoresLoading && (
                  <p className="text-xs text-muted-foreground">
                    Solicite ao administrador o cadastro do fornecedor antes de criar a ordem.
                  </p>
                )}
                {fornecedorSelecionado && (
                  <p className="text-xs text-muted-foreground">
                    Selecionado: <span className="font-medium">{fornecedorSelecionado.razao_social}</span>
                    {' '}— {formatCNPJ(fornecedorSelecionado.cnpj)}
                  </p>
                )}
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
                      value={field.value ?? ''}
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
                      value={field.value ?? ''}
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

              {/* Documentos de suporte — US-015 */}
              <div className="space-y-2">
                <Label>Documentos de suporte <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground">
                  Obrigatório: ao menos 1 documento antes de criar a ordem. PDF, JPEG ou PNG — máx 10 MB por arquivo.
                </p>
                {/* Zona de drop */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Clique ou arraste arquivos para selecioná-los"
                  onClick={() => pendingFileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') pendingFileInputRef.current?.click()
                  }}
                  onDrop={handlePendingDrop}
                  onDragOver={(e) => { e.preventDefault(); setPendingDragOver(true) }}
                  onDragLeave={() => setPendingDragOver(false)}
                  className={[
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer',
                    pendingDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/30 hover:border-primary hover:bg-primary/5',
                  ].join(' ')}
                >
                  <CloudUpload className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm">Arraste ou clique para selecionar arquivos</p>
                </div>
                <input
                  ref={pendingFileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  className="hidden"
                  onChange={handlePendingFileInput}
                />
                {/* Mensagem de orientação quando sem documentos */}
                {pendingFiles.length === 0 && (
                  <p className="text-xs text-destructive">
                    Anexe ao menos 1 documento para continuar.
                  </p>
                )}
                {/* Lista de arquivos selecionados */}
                {pendingFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {pendingFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate font-medium">{file.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ({formatBytes(file.size)})
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remover ${file.name}`}
                          onClick={() => removePendingFile(idx)}
                          className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assinatura digital GovBR — US-016 */}
              <Controller
                name="assinatura_govbr"
                control={control}
                render={({ field }) => (
                  <div className="flex items-start gap-3 rounded-md border p-3">
                    <input
                      id="assinatura-govbr"
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                    />
                    <Label
                      htmlFor="assinatura-govbr"
                      className="text-sm leading-snug cursor-pointer font-normal"
                    >
                      O documento anexado foi assinado digitalmente via{' '}
                      <span className="font-medium">gov.br/assinatura</span>
                    </Label>
                  </div>
                )}
              />
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
                {fornecedorSelecionado && (
                  <ReviewRow
                    label="Fornecedor"
                    value={`${fornecedorSelecionado.razao_social} — ${formatCNPJ(fornecedorSelecionado.cnpj)}`}
                  />
                )}
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

              {pendingFiles.length > 0 && (
                <>
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Documentos a anexar ({pendingFiles.length})
                    </p>
                    <div className="space-y-1">
                      {pendingFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{file.name}</span>
                          <span className="shrink-0 text-xs">({formatBytes(file.size)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

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
          <Button
            onClick={handleNext}
            className="gap-1"
            // S11.3: impede avançar da etapa 1 sem selecionar fornecedor
            disabled={step === 1 && !fornecedorSelecionado}
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={pendingFiles.length === 0 || !fornecedorSelecionado}
            className="gap-1"
          >
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
