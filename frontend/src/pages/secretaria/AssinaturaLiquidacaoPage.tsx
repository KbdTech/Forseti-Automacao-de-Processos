/**
 * AssinaturaLiquidacaoPage — pipeline de assinatura do documento de liquidação.
 *
 * US-019: após a contabilidade registrar a liquidação, as ordens aguardam
 * a assinatura do secretário responsável antes de ir à tesouraria.
 *
 * Features:
 *   - Lista ordens em AGUARDANDO_ASSINATURA_SECRETARIA (filtradas no back-end
 *     pela secretaria do usuário autenticado — US-019 / US-004 RN-21)
 *   - Filtro por protocolo com debounce 300ms
 *   - Clicar na linha abre OrderDetailModal (somente-leitura para docs — US-019 Cenário 4)
 *   - Botão "Assinar e Aprovar" → modal de confirmação → PATCH { acao: 'assinar_liquidacao' }
 *   - Status paginado: 20 itens por página
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PenLine,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

import { OrderDetailModal } from '@/components/orders/OrderDetailModal'
import { listOrdens, executeAcao } from '@/services/ordensService'
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
// Modal de confirmação de assinatura
// ---------------------------------------------------------------------------

interface AssinaturaConfirmModalProps {
  ordem: Ordem | null
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}

function AssinaturaConfirmModal({ ordem, onClose, onConfirm, isPending }: AssinaturaConfirmModalProps) {
  return (
    <Dialog open={ordem !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {isPending && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Processando...</p>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Assinar e Aprovar Liquidação</DialogTitle>
          <DialogDescription>
            Confirme a assinatura do documento de liquidação. Após a confirmação,
            a ordem seguirá para a Tesouraria para pagamento.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
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
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={isPending} className="gap-1.5">
            {isPending ? (
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
  const queryClient = useQueryClient()

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

  const mutation = useMutation({
    mutationFn: (orderId: string) =>
      executeAcao(orderId, { acao: 'assinar_liquidacao' }),
    onSuccess: (_, orderId) => {
      toast.success('Liquidação assinada', {
        description: 'Ordem encaminhada para pagamento.',
      })
      queryClient.invalidateQueries({ queryKey: ['ordens-assinatura'] })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      setAssinaturaOrdem(null)
    },
    onError: (error: AxiosError<{ detail: unknown }>) => {
      const msg = extractApiError(error.response?.data?.detail, 'Tente novamente.')
      toast.error('Erro ao assinar liquidação', { description: msg })
    },
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

      {/* Modal de detalhe — US-019 Cenário 4: somente-leitura (sem upload de documentos) */}
      <OrderDetailModal
        orderId={detailId}
        onClose={() => setDetailId(null)}
        readOnly
      />

      {/* Modal de confirmação de assinatura */}
      <AssinaturaConfirmModal
        ordem={assinaturaOrdem}
        onClose={() => setAssinaturaOrdem(null)}
        onConfirm={() => assinaturaOrdem && mutation.mutate(assinaturaOrdem.id)}
        isPending={mutation.isPending}
      />
    </div>
  )
}
