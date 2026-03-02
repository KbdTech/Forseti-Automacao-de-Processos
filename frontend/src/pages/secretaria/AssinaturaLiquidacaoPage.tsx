/**
 * AssinaturaLiquidacaoPage — pipeline de assinatura do documento de liquidação.
 *
 * US-019: após a contabilidade registrar a liquidação, as ordens aguardam
 * a assinatura do secretário responsável antes de ir à tesouraria.
 *
 * US-022: reformulação UX — o modal de assinatura agora exibe:
 *   - Lista de documentos da ordem (somente-leitura)
 *   - Campo de upload do documento assinado (obrigatório, descricao='ASSINATURA_LIQUIDACAO')
 *   - Checkbox de confirmação (obrigatório)
 *   Botão habilitado apenas quando ambos estão preenchidos.
 *   Upload é feito antes de executeAcao('assinar_liquidacao').
 *
 * Features:
 *   - Lista ordens em AGUARDANDO_ASSINATURA_SECRETARIA (filtradas no back-end
 *     pela secretaria do usuário autenticado — US-019 / US-004 RN-21)
 *   - Filtro por protocolo com debounce 300ms
 *   - Clicar na linha abre OrderDetailModal (somente-leitura para docs)
 *   - Botão "Assinar" → modal expandido → PATCH { acao: 'assinar_liquidacao' }
 *   - Status paginado: 20 itens por página
 */

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

import { DocumentList } from '@/components/ordens/DocumentList'
import { OrderDetailModal } from '@/components/orders/OrderDetailModal'
import { listOrdens, executeAcao } from '@/services/ordensService'
import { uploadDocumento } from '@/services/documentosService'
import { extractApiError } from '@/utils/formatters'
import {
  TIPO_ORDEM_LABELS,
  PRIORIDADE_CONFIG,
  PRIORIDADE_LABELS,
  DEFAULT_PAGE_SIZE,
  DEBOUNCE_DELAY_MS,
} from '@/utils/constants'
import type { TipoOrdem, Prioridade, Ordem } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Hook de debounce
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

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return iso
  }
}

function formatBRL(value: number | null | undefined): string {
  if (value == null) return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------------------------------------------------------------------------
// Skeleton de loading
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-8 w-28" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Modal expandido de assinatura — US-022
// ---------------------------------------------------------------------------

interface AssinaturaConfirmModalProps {
  ordem: Ordem | null
  onClose: () => void
  onSuccess: () => void
}

function AssinaturaConfirmModal({ ordem, onClose, onSuccess }: AssinaturaConfirmModalProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [documentoAssinado, setDocumentoAssinado] = useState<File | null>(null)
  const [confirmacaoLida, setConfirmacaoLida] = useState(false)

  const podeConfirmar = documentoAssinado !== null && confirmacaoLida

  function handleClose() {
    setDocumentoAssinado(null)
    setConfirmacaoLida(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // Resetar ao abrir com nova ordem
  useEffect(() => {
    if (ordem) {
      setDocumentoAssinado(null)
      setConfirmacaoLida(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [ordem?.id])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ordem) return
      // US-022 passo 1 — upload do documento assinado
      if (documentoAssinado) {
        await uploadDocumento(ordem.id, {
          file: documentoAssinado,
          descricao: 'ASSINATURA_LIQUIDACAO',
        })
      }
      // Passo 2 — executar a transição de status
      return executeAcao(ordem.id, { acao: 'assinar_liquidacao' })
    },
    onSuccess: () => {
      if (!ordem) return
      toast.success('Liquidação assinada', {
        description: 'Ordem encaminhada para pagamento.',
      })
      queryClient.invalidateQueries({ queryKey: ['ordens-assinatura'] })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', ordem.id] })
      handleClose()
      onSuccess()
    },
    onError: (error: AxiosError<{ detail: unknown }>) => {
      const msg = extractApiError(error.response?.data?.detail, 'Tente novamente.')
      toast.error('Erro ao assinar liquidação', { description: msg })
    },
  })

  return (
    <Dialog open={ordem !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        {mutation.isPending && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Processando...</p>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Assinar e Aprovar Liquidação</DialogTitle>
          <DialogDescription>
            Revise os documentos, anexe o documento assinado e confirme sua aprovação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Resumo da ordem */}
          {ordem && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocolo</span>
                <span className="font-mono font-medium">{ordem.protocolo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Secretaria</span>
                <span>{ordem.secretaria_nome}</span>
              </div>
              {ordem.valor_liquidado != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Liquidado</span>
                  <span className="font-medium">{formatBRL(ordem.valor_liquidado)}</span>
                </div>
              )}
              {ordem.data_liquidacao && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data da Liquidação</span>
                  <span>{formatDate(ordem.data_liquidacao)}</span>
                </div>
              )}
            </div>
          )}

          {/* Documentos da ordem — somente-leitura */}
          {ordem && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Documentos da Ordem</p>
              <DocumentList ordemId={ordem.id} readOnly />
            </div>
          )}

          {/* Upload do documento assinado — US-022 (obrigatório) */}
          <div className="space-y-1.5">
            <Label>
              Documento Assinado <span className="text-destructive">*</span>
            </Label>
            <div
              className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              style={mutation.isPending ? { opacity: 0.5, pointerEvents: 'none' } : {}}
              onClick={() => !documentoAssinado && fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className={documentoAssinado ? 'text-foreground flex-1 truncate' : 'text-muted-foreground flex-1'}>
                {documentoAssinado
                  ? documentoAssinado.name
                  : 'Clique para selecionar (PDF, JPEG, PNG — máx 10 MB)'}
              </span>
              {documentoAssinado && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDocumentoAssinado(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  disabled={mutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remover documento assinado"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setDocumentoAssinado(e.target.files?.[0] ?? null)}
              disabled={mutation.isPending}
            />
            {!documentoAssinado && (
              <p className="text-xs text-destructive">
                Anexe o documento assinado para continuar.
              </p>
            )}
          </div>

          {/* Checkbox de confirmação */}
          <div className="flex items-start gap-3 rounded-md border p-3">
            <input
              id="confirmacao-assinatura"
              type="checkbox"
              checked={confirmacaoLida}
              onChange={(e) => setConfirmacaoLida(e.target.checked)}
              disabled={mutation.isPending}
              className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
            />
            <Label
              htmlFor="confirmacao-assinatura"
              className="text-sm leading-snug cursor-pointer font-normal"
            >
              Confirmo que li e assinei o documento de liquidação e autorizo o
              encaminhamento da ordem para pagamento.
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!podeConfirmar || mutation.isPending}
            className="gap-1.5"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Confirmar Assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AssinaturaLiquidacaoPage() {
  const [protocolo, setProtocolo] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [assinaturaOrdem, setAssinaturaOrdem] = useState<Ordem | null>(null)

  // US-004 RN-25: debounce de 300ms na busca por protocolo
  const debouncedProtocolo = useDebounce(protocolo, DEBOUNCE_DELAY_MS)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ordens-assinatura', page, debouncedProtocolo],
    queryFn: () =>
      listOrdens({
        page,
        limit: DEFAULT_PAGE_SIZE,
        status: 'AGUARDANDO_ASSINATURA_SECRETARIA',
        protocolo: debouncedProtocolo || undefined,
      }),
    staleTime: 1000 * 30,
  })

  const totalPages = data?.pages ?? 1
  const from = data ? (page - 1) * DEFAULT_PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * DEFAULT_PAGE_SIZE, data.total) : 0

  function handleProtocoloChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProtocolo(e.target.value)
    setPage(1)
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Liquidações para Assinar</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ordens aguardando sua assinatura no documento de liquidação antes do pagamento.
        </p>
      </div>

      {/* Barra de filtros */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por protocolo..."
          value={protocolo}
          onChange={handleProtocoloChange}
          className="pl-8"
        />
      </div>

      {/* Estado de erro */}
      {isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between">
            <span>Erro ao carregar as ordens. Verifique sua conexão.</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1 h-7">
              <RefreshCw className="h-3 w-3" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabela */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">Protocolo</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Secretaria</TableHead>
              <TableHead className="font-semibold text-right">Valor Liquidado</TableHead>
              <TableHead className="font-semibold">Prioridade</TableHead>
              <TableHead className="font-semibold">Data Liquidação</TableHead>
              <TableHead className="font-semibold" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <PenLine className="h-10 w-10 text-muted-foreground/40" />
                    <div className="text-center">
                      <p className="font-medium">Nenhuma ordem aguardando assinatura</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {protocolo
                          ? 'Tente remover o filtro para ver todas as ordens.'
                          : 'Não há documentos de liquidação aguardando sua assinatura.'}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((ordem) => (
                <TableRow
                  key={ordem.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setDetailId(ordem.id)}
                >
                  {/* Protocolo */}
                  <TableCell className="font-mono text-sm font-medium text-primary">
                    {ordem.protocolo}
                  </TableCell>

                  {/* Tipo */}
                  <TableCell className="text-sm">
                    {TIPO_ORDEM_LABELS[ordem.tipo as TipoOrdem] ?? ordem.tipo}
                  </TableCell>

                  {/* Secretaria */}
                  <TableCell className="text-sm">{ordem.secretaria_nome}</TableCell>

                  {/* Valor liquidado */}
                  <TableCell className="text-sm text-right whitespace-nowrap font-medium">
                    {formatBRL(ordem.valor_liquidado)}
                  </TableCell>

                  {/* Prioridade */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={[
                        PRIORIDADE_CONFIG[ordem.prioridade as Prioridade]?.bg ?? '',
                        PRIORIDADE_CONFIG[ordem.prioridade as Prioridade]?.text ?? '',
                        'border-0 text-xs',
                      ].join(' ')}
                    >
                      {PRIORIDADE_LABELS[ordem.prioridade as Prioridade] ?? ordem.prioridade}
                    </Badge>
                  </TableCell>

                  {/* Data de liquidação */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {ordem.data_liquidacao ? formatDate(ordem.data_liquidacao) : '—'}
                  </TableCell>

                  {/* Ação */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      className="gap-1.5 whitespace-nowrap"
                      onClick={() => setAssinaturaOrdem(ordem)}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      Assinar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            Exibindo {from}–{to} de {data.total} resultado{data.total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de detalhe — somente-leitura para docs */}
      <OrderDetailModal
        orderId={detailId}
        onClose={() => setDetailId(null)}
        readOnly
      />

      {/* Modal expandido de assinatura — US-022 */}
      <AssinaturaConfirmModal
        ordem={assinaturaOrdem}
        onClose={() => setAssinaturaOrdem(null)}
        onSuccess={() => setAssinaturaOrdem(null)}
      />
    </div>
  )
}
