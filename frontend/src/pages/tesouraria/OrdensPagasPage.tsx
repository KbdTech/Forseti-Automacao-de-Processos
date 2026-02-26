/**
 * OrdensPagasPage — histórico de ordens pagas — US-010.
 *
 * Features:
 *   - Tabela com colunas financeiras: Protocolo, Secretaria, Tipo, Valor Pago,
 *     Forma Pgto, Data Pgto, Nº Empenho, Nº NF
 *   - Filtros: busca por protocolo, secretaria, período (data início/fim)
 *   - Click → OrderDetailModal em modo somente-leitura (sem ActionPanel)
 *   - Paginação de 20 itens por página
 *
 * US-010 RN-53: status PAGA é somente-leitura para todos os perfis operacionais.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText, RefreshCw, Search } from 'lucide-react'

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

import { OrderDetailModal } from '@/components/orders/OrderDetailModal'
import { listOrdens } from '@/services/ordensService'
import { listSecretarias } from '@/services/secretariasService'
import type { Ordem } from '@/types/ordem'
import { TIPO_ORDEM_LABELS, DEBOUNCE_DELAY_MS } from '@/utils/constants'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateBR(isoStr: string | null | undefined): string {
  if (!isoStr) return '—'
  try {
    return format(parseISO(isoStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return isoStr
  }
}

const FORMA_LABELS: Record<string, string> = {
  transferencia: 'Transferência',
  cheque: 'Cheque',
  pix: 'PIX',
}

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function OrdensPagasPage() {
  const [page, setPage] = useState(1)
  const [protocolo, setProtocolo] = useState('')
  const [protocoloDebounced, setProtocoloDebounced] = useState('')
  const [secretariaId, setSecretariaId] = useState<string>('all')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [selectedOrdemId, setSelectedOrdemId] = useState<string | null>(null)

  // Debounce do protocolo
  useEffect(() => {
    const timer = setTimeout(() => {
      setProtocoloDebounced(protocolo)
      setPage(1)
    }, DEBOUNCE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [protocolo])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ordens', 'PAGA', page, protocoloDebounced, secretariaId, dataInicio, dataFim],
    queryFn: () =>
      listOrdens({
        status: 'PAGA',
        page,
        limit: PAGE_SIZE,
        protocolo: protocoloDebounced || undefined,
        secretaria_id: secretariaId !== 'all' ? secretariaId : undefined,
      }),
  })

  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 1000 * 60 * 5,
  })

  const ordens: Ordem[] = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  function handleResetFilters() {
    setProtocolo('')
    setProtocoloDebounced('')
    setSecretariaId('all')
    setDataInicio('')
    setDataFim('')
    setPage(1)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens Pagas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Histórico de ordens com ciclo financeiro concluído.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} title="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo..."
            className="pl-8"
            value={protocolo}
            onChange={(e) => setProtocolo(e.target.value)}
          />
        </div>

        <Select value={secretariaId} onValueChange={(v) => { setSecretariaId(v); setPage(1) }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todas as secretarias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as secretarias</SelectItem>
            {(secretarias ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.sigla} — {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-[150px]"
            value={dataInicio}
            onChange={(e) => { setDataInicio(e.target.value); setPage(1) }}
            title="Data inicial"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            className="w-[150px]"
            value={dataFim}
            onChange={(e) => { setDataFim(e.target.value); setPage(1) }}
            title="Data final"
          />
        </div>

        <Button variant="outline" size="sm" onClick={handleResetFilters}>
          Limpar filtros
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar ordens pagas. Tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabela */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead className="hidden md:table-cell">Secretaria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor Pago</TableHead>
              <TableHead className="hidden sm:table-cell">Forma Pgto</TableHead>
              <TableHead className="hidden sm:table-cell">Data Pgto</TableHead>
              <TableHead className="hidden lg:table-cell">Nº Empenho</TableHead>
              <TableHead className="hidden lg:table-cell">Nº NF</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* Skeleton */}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                </TableRow>
              ))}

            {/* Empty state */}
            {!isLoading && ordens.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhuma ordem paga encontrada com os filtros aplicados.
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
                  <TableCell className="hidden md:table-cell text-sm">
                    {ordem.secretaria_nome}
                  </TableCell>
                  <TableCell>
                    {TIPO_ORDEM_LABELS[ordem.tipo] ?? ordem.tipo}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-700">
                    {formatBRL(ordem.valor_pago)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {ordem.forma_pagamento ? (
                      <Badge variant="secondary">
                        {FORMA_LABELS[ordem.forma_pagamento] ?? ordem.forma_pagamento}
                      </Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {formatDateBR(ordem.data_pagamento)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-sm text-muted-foreground">
                    {ordem.numero_empenho ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-sm text-muted-foreground">
                    {ordem.numero_nf ?? '—'}
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
            Página {page} de {totalPages} — {data?.total ?? 0} ordens pagas
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

      {/* OrderDetailModal — somente-leitura (sem renderActions) */}
      <OrderDetailModal
        orderId={selectedOrdemId}
        onClose={() => setSelectedOrdemId(null)}
      />
    </div>
  )
}
