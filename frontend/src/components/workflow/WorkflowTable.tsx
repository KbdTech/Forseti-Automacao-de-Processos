/**
 * WorkflowTable — tabela genérica de fila de workflow.
 *
 * Reutilizável em todas as páginas de fluxo: Gabinete, Controladoria,
 * Contabilidade, Tesouraria, etc.
 *
 * Props:
 *   statusFilter         — status(es) para filtrar as ordens (API usa o primeiro)
 *   title                — título acima dos filtros (usado pela página pai)
 *   emptyMessage         — mensagem quando não há ordens na fila
 *   showSecretariaColumn — oculta coluna Secretaria quando false (default: true)
 *   renderActions        — slot injetado no OrderDetailModal (ActionPanel da página)
 *
 * Funcionalidades:
 *   - Busca por protocolo com debounce 300ms
 *   - Filtro por secretaria (select carregado da API)
 *   - Paginação de 20 itens por página
 *   - Coluna "Dias na etapa" com alerta visual (≥3 amarelo, ≥5 vermelho)
 *   - Skeleton loader, empty state e error state
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { StatusBadge } from '@/components/workflow/StatusBadge'
import { OrderDetailModal } from '@/components/orders/OrderDetailModal'
import { listOrdens } from '@/services/ordensService'
import { listSecretarias } from '@/services/secretariasService'
import {
  TIPO_ORDEM_LABELS,
  PRIORIDADE_CONFIG,
  PRIORIDADE_LABELS,
  DEFAULT_PAGE_SIZE,
  DEBOUNCE_DELAY_MS,
} from '@/utils/constants'
import type { StatusOrdem, TipoOrdem, Prioridade } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Hook de debounce (300ms — CLAUDE.md regra 12)
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

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—'
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Calcula dias desde a última atualização — proxy para tempo na etapa atual. */
function getDaysInStage(updatedAt: string): number {
  try {
    return differenceInCalendarDays(new Date(), parseISO(updatedAt))
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

/** Badge colorido com o número de dias na etapa. */
function DaysBadge({ days }: { days: number }) {
  const cls =
    days >= 5
      ? 'bg-red-100 text-red-700 border-0 text-xs'
      : days >= 3
        ? 'bg-yellow-100 text-yellow-700 border-0 text-xs'
        : 'bg-muted text-muted-foreground border-0 text-xs'

  return (
    <Badge variant="outline" className={cls}>
      {days}d
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkflowTableProps {
  /** Status de workflow para filtrar. Quando array, usa o primeiro elemento. */
  statusFilter: StatusOrdem | StatusOrdem[]
  title: string
  emptyMessage: string
  /** Se false, oculta coluna Secretaria — útil em páginas de secretaria específica. */
  showSecretariaColumn?: boolean
  /** Slot de ações injetado na parte inferior do OrderDetailModal. */
  renderActions?: (
    orderId: string,
    status: StatusOrdem,
    onActionComplete: () => void,
  ) => React.ReactNode
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function WorkflowTable({
  statusFilter,
  emptyMessage,
  showSecretariaColumn = true,
  renderActions,
}: WorkflowTableProps) {
  const [protocolo, setProtocolo] = useState('')
  const [secretariaId, setSecretariaId] = useState<string>('TODAS')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const debouncedProtocolo = useDebounce(protocolo, DEBOUNCE_DELAY_MS)

  // API suporta um status por vez — usa o primeiro quando array
  const statusParam = Array.isArray(statusFilter) ? statusFilter[0] : statusFilter

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'ordens',
      'workflow',
      statusParam,
      page,
      debouncedProtocolo,
      secretariaId,
    ],
    queryFn: () =>
      listOrdens({
        page,
        limit: DEFAULT_PAGE_SIZE,
        status: statusParam,
        protocolo: debouncedProtocolo || undefined,
        secretaria_id: secretariaId !== 'TODAS' ? secretariaId : undefined,
      }),
    staleTime: 1000 * 30,
  })

  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 1000 * 60 * 5, // secretarias mudam raramente
  })

  function handleProtocoloChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProtocolo(e.target.value)
    setPage(1)
  }

  function handleSecretariaChange(value: string) {
    setSecretariaId(value)
    setPage(1)
  }

  const totalPages = data?.pages ?? 1
  const from = data ? (page - 1) * DEFAULT_PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * DEFAULT_PAGE_SIZE, data.total) : 0

  // Número de colunas para o TableSkeleton (protocolo + secretaria? + tipo + desc + valor + prio + status + criado + dias)
  const colCount = 8 + (showSecretariaColumn ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo..."
            value={protocolo}
            onChange={handleProtocoloChange}
            className="pl-8"
          />
        </div>
        {showSecretariaColumn && (
          <Select value={secretariaId} onValueChange={handleSecretariaChange}>
            <SelectTrigger className="w-full sm:w-60">
              <SelectValue placeholder="Filtrar secretaria" />
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
        )}
      </div>

      {/* Erro */}
      {isError && (
        <Alert variant="destructive">
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
              {showSecretariaColumn && (
                <TableHead className="font-semibold">Secretaria</TableHead>
              )}
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Descrição</TableHead>
              <TableHead className="font-semibold text-right">Valor Est.</TableHead>
              <TableHead className="font-semibold">Prioridade</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Criado em</TableHead>
              <TableHead className="font-semibold text-center">
                <span className="flex items-center justify-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Dias
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={colCount} />
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={colCount}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <div className="text-center">
                      <p className="font-medium">Nenhuma ordem na fila</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{emptyMessage}</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((ordem) => (
                <TableRow
                  key={ordem.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setSelectedId(ordem.id)}
                >
                  {/* Protocolo */}
                  <TableCell className="font-mono text-sm font-medium text-primary">
                    {ordem.protocolo}
                  </TableCell>

                  {/* Secretaria */}
                  {showSecretariaColumn && (
                    <TableCell className="text-sm">{ordem.secretaria_nome}</TableCell>
                  )}

                  {/* Tipo */}
                  <TableCell className="text-sm">
                    {TIPO_ORDEM_LABELS[ordem.tipo as TipoOrdem] ?? ordem.tipo}
                  </TableCell>

                  {/* Descrição */}
                  <TableCell className="text-sm text-muted-foreground max-w-[160px]">
                    {truncate(ordem.descricao, 45)}
                  </TableCell>

                  {/* Valor */}
                  <TableCell className="text-sm text-right whitespace-nowrap">
                    {ordem.valor_estimado.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
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

                  {/* Status */}
                  <TableCell>
                    <StatusBadge status={ordem.status} />
                  </TableCell>

                  {/* Data */}
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(ordem.created_at)}
                  </TableCell>

                  {/* Dias na etapa */}
                  <TableCell className="text-center">
                    <DaysBadge days={getDaysInStage(ordem.updated_at)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Exibindo {from}–{to} de {data.total} ordem{data.total !== 1 ? 's' : ''}
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
            <span className="px-2 text-sm">
              {page} / {totalPages}
            </span>
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

      {/* Modal de detalhe com slot de ações */}
      <OrderDetailModal
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
        renderActions={renderActions}
      />
    </div>
  )
}
