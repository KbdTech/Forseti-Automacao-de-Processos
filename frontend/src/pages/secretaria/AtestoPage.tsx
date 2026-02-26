/**
 * AtestoPage — fila de atesto de nota fiscal — US-009.
 *
 * Features:
 *   - Tabela customizada de ordens AGUARDANDO_ATESTO (colunas específicas)
 *   - Colunas: Protocolo, Tipo, Descrição, Valor Empenhado, Nº Empenho, Dias aguardando
 *   - Clique na linha abre OrderDetailModal com AtestoActionPanel
 *   - AtestoActionPanel oferece dois botões: "Atestar NF" e "Recusar Atesto"
 *   - Paginação de 20 itens por página (US-004 RN-24)
 *   - Skeleton loader e empty state
 *
 * US-009 Cenário 1: secretaria atesta a NF → AGUARDANDO_LIQUIDACAO
 * US-009 Cenário 2: secretaria recusa o atesto → EXECUCAO_COM_PENDENCIA
 * US-009 RN-46: somente secretaria responsável pode atestar (RBAC no back-end)
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CheckCircle, XCircle, Clock, FileText, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
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

import { OrderDetailModal } from '@/components/orders/OrderDetailModal'
import { AtesteModal } from '@/components/orders/AtesteModal'
import { RecusaModal } from '@/components/orders/RecusaModal'
import { listOrdens } from '@/services/ordensService'
import type { Ordem } from '@/types/ordem'
import { TIPO_ORDEM_LABELS } from '@/utils/constants'

// ---------------------------------------------------------------------------
// Painel de ações — renderizado no slot do OrderDetailModal
// ---------------------------------------------------------------------------

function AtestoActionPanel({
  orderId,
  onSuccess,
}: {
  orderId: string
  onSuccess: () => void
}) {
  const [atesteOpen, setAtesteOpen] = useState(false)
  const [recusaOpen, setRecusaOpen] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Ações disponíveis
        </span>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setAtesteOpen(true)}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Atestar NF
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="gap-1.5"
          onClick={() => setRecusaOpen(true)}
        >
          <XCircle className="h-3.5 w-3.5" />
          Recusar Atesto
        </Button>
      </div>

      <AtesteModal
        orderId={atesteOpen ? orderId : null}
        onClose={() => setAtesteOpen(false)}
        onSuccess={() => {
          setAtesteOpen(false)
          onSuccess()
        }}
      />

      <RecusaModal
        orderId={recusaOpen ? orderId : null}
        onClose={() => setRecusaOpen(false)}
        onSuccess={() => {
          setRecusaOpen(false)
          onSuccess()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function diasAguardando(updatedAt: string): number {
  return differenceInCalendarDays(new Date(), parseISO(updatedAt))
}

function DiasCell({ dias }: { dias: number }) {
  const cor =
    dias >= 5
      ? 'text-red-600 font-semibold'
      : dias >= 3
        ? 'text-yellow-600 font-semibold'
        : 'text-muted-foreground'
  return (
    <span className={`flex items-center gap-1 ${cor}`}>
      <Clock className="h-3.5 w-3.5" />
      {dias}d
    </span>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

export default function AtestoPage() {
  const [page, setPage] = useState(1)
  const [selectedOrdemId, setSelectedOrdemId] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ordens', 'AGUARDANDO_ATESTO', page],
    queryFn: () => listOrdens({ status: 'AGUARDANDO_ATESTO', page, limit: PAGE_SIZE }),
  })

  const ordens: Ordem[] = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  // ---------------------------------------------------------------------------
  // Estados de carregamento e erro
  // ---------------------------------------------------------------------------

  if (isError) {
    return (
      <div className="container max-w-7xl mx-auto py-8 px-4">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar ordens. Verifique sua conexão e tente novamente.
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4 gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atesto de Nota Fiscal</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ordens empenhadas aguardando atesto da nota fiscal pela secretaria.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden md:table-cell">Descrição</TableHead>
              <TableHead className="text-right">Valor Empenhado</TableHead>
              <TableHead className="hidden lg:table-cell">Nº Empenho</TableHead>
              <TableHead className="text-center">Dias aguardando</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* Skeleton loader */}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10 mx-auto" /></TableCell>
                </TableRow>
              ))}

            {/* Empty state */}
            {!isLoading && ordens.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhuma ordem aguardando atesto no momento.
                </TableCell>
              </TableRow>
            )}

            {/* Rows */}
            {!isLoading &&
              ordens.map((ordem) => (
                <TableRow
                  key={ordem.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedOrdemId(ordem.id)}
                >
                  <TableCell className="font-mono text-sm font-medium">
                    {ordem.protocolo}
                  </TableCell>
                  <TableCell>
                    {TIPO_ORDEM_LABELS[ordem.tipo] ?? ordem.tipo}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                    {ordem.descricao ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatBRL(ordem.valor_empenhado)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-sm text-muted-foreground">
                    {ordem.numero_empenho ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <DiasCell dias={diasAguardando(ordem.updated_at)} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {totalPages} — {data?.total ?? 0} ordens
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* OrderDetailModal com AtestoActionPanel injetado */}
      <OrderDetailModal
        orderId={selectedOrdemId}
        onClose={() => setSelectedOrdemId(null)}
        renderActions={(orderId, _status, onActionComplete) => (
          <AtestoActionPanel
            orderId={orderId}
            onSuccess={() => {
              onActionComplete()
              setSelectedOrdemId(null)
            }}
          />
        )}
      />
    </div>
  )
}
