/**
 * MinhasOrdensPage — acompanhamento de ordens da secretaria — US-004.
 *
 * Features:
 *   - Filtro por protocolo (debounce 300ms) e por status
 *   - Tabela com 7 colunas + click na linha abre OrderDetailModal
 *   - Paginação de 20 itens por página com indicador de resultados
 *   - Estados: loading (Skeleton), empty (com CTA se sem filtros), error
 *
 * US-004 RN-21: secretaria vê apenas ordens da própria secretaria (filtro no back-end).
 * US-004 RN-24: paginação de 20 por página.
 * US-004 RN-25: busca por protocolo é exata.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

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
import {
  STATUS_CONFIG,
  TIPO_ORDEM_LABELS,
  PRIORIDADE_CONFIG,
  PRIORIDADE_LABELS,
  DEFAULT_PAGE_SIZE,
  DEBOUNCE_DELAY_MS,
} from '@/utils/constants'
import type { StatusOrdem, TipoOrdem, Prioridade } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Hook de debounce — US-004 CLAUDE.md regra 12 (300ms)
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

// ---------------------------------------------------------------------------
// Skeleton de loading (5 linhas)
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function MinhasOrdensPage() {
  const navigate = useNavigate()

  // Filtros
  const [protocolo, setProtocolo] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusOrdem | 'TODOS'>('TODOS')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Debounce do protocolo — US-004 RN-25 + CLAUDE.md regra 12
  const debouncedProtocolo = useDebounce(protocolo, DEBOUNCE_DELAY_MS)

  // Query — chaves incluem filtros para refetch automático
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ordens', page, debouncedProtocolo, statusFilter],
    queryFn: () =>
      listOrdens({
        page,
        limit: DEFAULT_PAGE_SIZE,
        protocolo: debouncedProtocolo || undefined,
        status: statusFilter !== 'TODOS' ? statusFilter : undefined,
      }),
    staleTime: 1000 * 30,
  })

  const hasActiveFilters = !!debouncedProtocolo || statusFilter !== 'TODOS'

  function handleProtocoloChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProtocolo(e.target.value)
    setPage(1)
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value as StatusOrdem | 'TODOS')
    setPage(1)
  }

  const totalPages = data?.pages ?? 1
  const from = data ? (page - 1) * DEFAULT_PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * DEFAULT_PAGE_SIZE, data.total) : 0

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Minhas Ordens</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhe o status das ordens da sua secretaria.
          </p>
        </div>
        <Button onClick={() => navigate('/secretaria/nova-ordem')}>
          + Nova Ordem
        </Button>
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo..."
            value={protocolo}
            onChange={handleProtocoloChange}
            className="pl-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os status</SelectItem>
            {(Object.keys(STATUS_CONFIG) as StatusOrdem[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              <TableHead className="font-semibold">Descrição</TableHead>
              <TableHead className="font-semibold text-right">Valor Est.</TableHead>
              <TableHead className="font-semibold">Prioridade</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Criado em</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <div className="text-center">
                      <p className="font-medium">Nenhuma ordem encontrada</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {hasActiveFilters
                          ? 'Tente remover os filtros para ver todas as ordens.'
                          : 'Ainda não há ordens registradas para sua secretaria.'}
                      </p>
                    </div>
                    {!hasActiveFilters && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/secretaria/nova-ordem')}
                      >
                        Criar primeira ordem
                      </Button>
                    )}
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

                  {/* Tipo */}
                  <TableCell className="text-sm">
                    {TIPO_ORDEM_LABELS[ordem.tipo as TipoOrdem] ?? ordem.tipo}
                  </TableCell>

                  {/* Descrição truncada */}
                  <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                    {truncate(ordem.descricao, 60)}
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

      {/* Modal de detalhe */}
      <OrderDetailModal
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
