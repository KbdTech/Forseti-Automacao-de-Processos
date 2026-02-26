/**
 * AnaliseControladoriaPage — Análise de Conformidade pela Controladoria — US-007.
 *
 * Tabela unificada com AGUARDANDO_CONTROLADORIA + AGUARDANDO_DOCUMENTACAO:
 *   - AGUARDANDO_CONTROLADORIA: ActionPanel com 3 ações (aprovar, irregularidade, solicitar_documentacao)
 *   - AGUARDANDO_DOCUMENTACAO: Badge "Aguardando Docs", sem ActionPanel (ação é da Secretaria)
 *
 * Indicadores visuais:
 *   - Prioridade URGENTE → borda esquerda vermelha na linha
 *   - ≥ 5 dias na etapa → ícone Clock amarelo com tooltip "SLA: X dias na etapa"
 *
 * Filtros: protocolo (debounce 300ms), secretaria (select), dias na etapa (select).
 * KPI cards: total em análise, aguardando documentação, paradas > 5 dias.
 *
 * US-007 RN-37: ações disponíveis somente em AGUARDANDO_CONTROLADORIA.
 * US-007 RN-38: irregularidade exige mínimo 50 chars de descrição.
 * US-007 RN-39: ordens com irregularidade ficam suspensas até resolução.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
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

import { ActionPanel } from '@/components/workflow/ActionPanel'
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
import type { Ordem, StatusOrdem, TipoOrdem, Prioridade } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

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

/** Badge de dias: amarelo ≥3d, vermelho ≥5d. Para ≥5d exibe ícone Clock amarelo com tooltip SLA. */
function DaysBadge({ days }: { days: number }) {
  const badgeCls =
    days >= 5
      ? 'bg-red-100 text-red-700 border-0 text-xs'
      : days >= 3
        ? 'bg-yellow-100 text-yellow-700 border-0 text-xs'
        : 'bg-muted text-muted-foreground border-0 text-xs'

  const slaTooltip = `SLA: ${days} dia${days !== 1 ? 's' : ''} na etapa`

  return (
    <div className="flex items-center justify-center gap-1">
      {/* Ícone Clock amarelo para ordens ≥ 5 dias — US-007 indicador visual */}
      {days >= 5 && (
        <Clock
          className="h-3.5 w-3.5 text-yellow-500 shrink-0"
          title={slaTooltip}
          aria-label={slaTooltip}
        />
      )}
      <Badge variant="outline" className={badgeCls} title={slaTooltip}>
        {days}d
      </Badge>
    </div>
  )
}

interface KpiCardProps {
  label: string
  value: number
  icon: React.ReactNode
  colorClass: string
  isLoading?: boolean
}

function KpiCard({ label, value, icon, colorClass, isLoading }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className={['text-3xl font-bold', colorClass].join(' ')}>{value}</p>
            )}
          </div>
          <div className="p-3 rounded-full bg-muted/30">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Linha da tabela com indicadores visuais de urgência e status. */
function OrdemRow({ ordem, onClick }: { ordem: Ordem; onClick: () => void }) {
  const days = getDaysInStage(ordem.updated_at)
  const isUrgente = ordem.prioridade === 'URGENTE'
  const isAguardandoDocs = ordem.status === 'AGUARDANDO_DOCUMENTACAO'

  return (
    <TableRow
      className={[
        'cursor-pointer hover:bg-muted/40 transition-colors',
        // Borda esquerda vermelha para prioridade URGENTE — US-007 indicador visual
        isUrgente ? 'border-l-4 border-l-red-500' : '',
      ]
        .join(' ')
        .trim()}
      onClick={onClick}
    >
      {/* Protocolo + Badge "Aguardando Docs" para AGUARDANDO_DOCUMENTACAO */}
      <TableCell className="font-mono text-sm font-medium text-primary">
        <div className="flex items-center gap-2 flex-wrap">
          {ordem.protocolo}
          {isAguardandoDocs && (
            <Badge
              variant="outline"
              className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              Aguardando Docs
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Secretaria */}
      <TableCell className="text-sm">{ordem.secretaria_nome}</TableCell>

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

      {/* Criado em */}
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(ordem.created_at)}
      </TableCell>

      {/* Dias na etapa: Clock amarelo ≥5 dias + badge */}
      <TableCell className="text-center">
        <DaysBadge days={days} />
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AnaliseControladoriaPage() {
  const [protocolo, setProtocolo] = useState('')
  const [secretariaId, setSecretariaId] = useState<string>('TODAS')
  const [diasFilter, setDiasFilter] = useState<0 | 3 | 5 | 10>(0)
  const [pageCtrl, setPageCtrl] = useState(1)
  const [pageDoc, setPageDoc] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const debouncedProtocolo = useDebounce(protocolo, DEBOUNCE_DELAY_MS)

  const secretariaParam = secretariaId !== 'TODAS' ? secretariaId : undefined

  // Query — AGUARDANDO_CONTROLADORIA (inclui filtro por dias client-side)
  const {
    data: dataCtrl,
    isLoading: loadingCtrl,
    isError: errorCtrl,
    refetch: refetchCtrl,
  } = useQuery({
    queryKey: ['ordens', 'AGUARDANDO_CONTROLADORIA', pageCtrl, debouncedProtocolo, secretariaId],
    queryFn: () =>
      listOrdens({
        status: 'AGUARDANDO_CONTROLADORIA',
        page: pageCtrl,
        limit: DEFAULT_PAGE_SIZE,
        protocolo: debouncedProtocolo || undefined,
        secretaria_id: secretariaParam,
      }),
    staleTime: 1000 * 30,
  })

  // Query — AGUARDANDO_DOCUMENTACAO
  const {
    data: dataDoc,
    isLoading: loadingDoc,
    isError: errorDoc,
    refetch: refetchDoc,
  } = useQuery({
    queryKey: ['ordens', 'AGUARDANDO_DOCUMENTACAO', pageDoc, debouncedProtocolo, secretariaId],
    queryFn: () =>
      listOrdens({
        status: 'AGUARDANDO_DOCUMENTACAO',
        page: pageDoc,
        limit: DEFAULT_PAGE_SIZE,
        protocolo: debouncedProtocolo || undefined,
        secretaria_id: secretariaParam,
      }),
    staleTime: 1000 * 30,
  })

  // Query — secretarias para o filtro
  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 1000 * 60 * 5,
  })

  function handleProtocoloChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProtocolo(e.target.value)
    setPageCtrl(1)
    setPageDoc(1)
  }

  function handleSecretariaChange(v: string) {
    setSecretariaId(v)
    setPageCtrl(1)
    setPageDoc(1)
  }

  function handleDiasChange(v: string) {
    setDiasFilter(Number(v) as 0 | 3 | 5 | 10)
    setPageCtrl(1)
  }

  // Filtro client-side por dias na etapa (somente AGUARDANDO_CONTROLADORIA)
  const itemsCtrl =
    diasFilter > 0
      ? (dataCtrl?.items ?? []).filter((o) => getDaysInStage(o.updated_at) >= diasFilter)
      : (dataCtrl?.items ?? [])

  const itemsDoc = dataDoc?.items ?? []

  // KPIs
  const totalCtrl = dataCtrl?.total ?? 0
  const totalDoc = dataDoc?.total ?? 0
  const totalMais5 = (dataCtrl?.items ?? []).filter(
    (o) => getDaysInStage(o.updated_at) >= 5,
  ).length

  const isLoading = loadingCtrl || loadingDoc
  const isError = errorCtrl || errorDoc
  const COL_COUNT = 9 // protocolo, secretaria, tipo, desc, valor, prio, status, criado, dias

  const showEmpty = !isLoading && itemsCtrl.length === 0 && itemsDoc.length === 0

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Análise de Conformidade — Controladoria</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ordens aguardando parecer fiscal e legal antes do empenho.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Aguardando Análise"
          value={totalCtrl}
          icon={<FileCheck className="h-5 w-5 text-blue-600" />}
          colorClass="text-blue-600"
          isLoading={isLoading}
        />
        <KpiCard
          label="Aguardando Documentação"
          value={totalDoc}
          icon={<AlertTriangle className="h-5 w-5 text-yellow-600" />}
          colorClass="text-yellow-600"
          isLoading={isLoading}
        />
        <KpiCard
          label="Paradas há mais de 5 dias"
          value={totalMais5}
          icon={<Clock className="h-5 w-5 text-red-600" />}
          colorClass="text-red-700"
          isLoading={isLoading}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Busca por protocolo */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo..."
            value={protocolo}
            onChange={handleProtocoloChange}
            className="pl-8"
          />
        </div>

        {/* Filtro de secretaria */}
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

        {/* Filtro de dias na etapa */}
        <Select value={String(diasFilter)} onValueChange={handleDiasChange}>
          <SelectTrigger className="w-full sm:w-48">
            <Clock className="h-4 w-4 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Todos os dias</SelectItem>
            <SelectItem value="3">Mais de 3 dias</SelectItem>
            <SelectItem value="5">Mais de 5 dias</SelectItem>
            <SelectItem value="10">Mais de 10 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Erro */}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Erro ao carregar as ordens. Verifique sua conexão.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetchCtrl()
                refetchDoc()
              }}
              className="gap-1 h-7"
            >
              <RefreshCw className="h-3 w-3" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabela unificada: AGUARDANDO_CONTROLADORIA + AGUARDANDO_DOCUMENTACAO */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">Protocolo</TableHead>
              <TableHead className="font-semibold">Secretaria</TableHead>
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
              <TableSkeleton cols={COL_COUNT} />
            ) : showEmpty ? (
              <TableRow>
                <TableCell colSpan={COL_COUNT}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <div className="text-center">
                      <p className="font-medium">Nenhuma ordem na fila</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {diasFilter > 0
                          ? `Nenhuma ordem com mais de ${diasFilter} dias nesta página.`
                          : 'Não há ordens aguardando análise da Controladoria.'}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {/* Ordens aguardando análise */}
                {itemsCtrl.map((ordem) => (
                  <OrdemRow
                    key={ordem.id}
                    ordem={ordem}
                    onClick={() => setSelectedId(ordem.id)}
                  />
                ))}

                {/* Separador visual entre grupos */}
                {itemsCtrl.length > 0 && itemsDoc.length > 0 && (
                  <TableRow className="bg-muted/10 hover:bg-muted/10 pointer-events-none">
                    <TableCell colSpan={COL_COUNT} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <Separator className="flex-1" />
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap px-1">
                          Aguardando documentação da secretaria
                        </span>
                        <Separator className="flex-1" />
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* Ordens aguardando documentação (sem ActionPanel) */}
                {itemsDoc.map((ordem) => (
                  <OrdemRow
                    key={ordem.id}
                    ordem={ordem}
                    onClick={() => setSelectedId(ordem.id)}
                  />
                ))}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação — AGUARDANDO_CONTROLADORIA */}
      {dataCtrl && dataCtrl.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Em análise: {dataCtrl.total} ordem{dataCtrl.total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageCtrl((p) => p - 1)}
              disabled={pageCtrl <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {pageCtrl} / {dataCtrl.pages ?? 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageCtrl((p) => p + 1)}
              disabled={pageCtrl >= (dataCtrl.pages ?? 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Paginação — AGUARDANDO_DOCUMENTACAO */}
      {dataDoc && dataDoc.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Aguardando docs: {dataDoc.total} ordem{dataDoc.total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageDoc((p) => p - 1)}
              disabled={pageDoc <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {pageDoc} / {dataDoc.pages ?? 1}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPageDoc((p) => p + 1)}
              disabled={pageDoc >= (dataDoc.pages ?? 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Modal de detalhe: ActionPanel apenas para AGUARDANDO_CONTROLADORIA */}
      <OrderDetailModal
        orderId={selectedId}
        onClose={() => setSelectedId(null)}
        renderActions={(orderId, status, onActionComplete) => {
          // US-007 RN-37: ações disponíveis somente em AGUARDANDO_CONTROLADORIA
          if (status === 'AGUARDANDO_CONTROLADORIA') {
            return (
              <ActionPanel
                orderId={orderId}
                currentStatus={status}
                userRole="controladoria"
                onActionComplete={onActionComplete}
              />
            )
          }
          return null
        }}
      />
    </div>
  )
}
