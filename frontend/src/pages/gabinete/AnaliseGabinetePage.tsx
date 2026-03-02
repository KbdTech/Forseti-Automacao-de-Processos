/**
 * AnaliseGabinetePage — fila de análise do Gabinete do Prefeito — US-005.
 *
 * Features:
 *   - KPI cards: Total aguardando, Urgentes (vermelho), Há mais de 5 dias (amarelo)
 *   - "Fornecedores em análise": cards com uso do contrato (saldo/utilizado) por empresa
 *     em pauta — clicar abre FornecedorDetailSheet completo
 *   - WorkflowTable filtrando AGUARDANDO_GABINETE
 *   - ActionPanel injetado via renderActions no OrderDetailModal
 *
 * US-005 RN-26: somente ordens AGUARDANDO_GABINETE recebem ações do Gabinete.
 * US-005 RN-31: Gabinete pode visualizar qualquer ordem em modo somente-leitura.
 */

import { useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, AlertTriangle, Clock, Building2, TrendingUp } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { ActionPanel } from '@/components/workflow/ActionPanel'
import { FornecedorDetailSheet } from '@/components/fornecedores/FornecedorDetailSheet'
import { listOrdens } from '@/services/ordensService'
import { getFornecedorResumo } from '@/services/fornecedoresService'
import { formatBRL } from '@/utils/formatters'
import type { StatusOrdem, FornecedorBasico } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Helpers de KPI
// ---------------------------------------------------------------------------

function getDaysInStage(updatedAt: string): number {
  try {
    return differenceInCalendarDays(new Date(), parseISO(updatedAt))
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Sub-componente: KPI card
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string
  value: number | undefined
  icon: React.ElementType
  colorClass: string
  isLoading: boolean
}

function KpiCard({ title, value, icon: Icon, colorClass, isLoading }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className={`text-3xl font-bold ${colorClass}`}>{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sub-componente: Card de fornecedor com uso do contrato
// ---------------------------------------------------------------------------

interface FornecedorCardProps {
  fornecedor: FornecedorBasico
  ordensCount: number
  onClick: () => void
}

function FornecedorCard({ fornecedor, ordensCount, onClick }: FornecedorCardProps) {
  const { data: resumo, isLoading } = useQuery({
    queryKey: ['fornecedor-resumo', fornecedor.id],
    queryFn: () => getFornecedorResumo(fornecedor.id),
    staleTime: 60_000,
  })

  const pct = resumo?.percentual_utilizado ?? 0
  const clampedPct = Math.min(pct, 100)
  const barColor =
    pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-emerald-500'

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full rounded-lg border bg-card p-4 space-y-3 hover:bg-muted/40 hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Header do card */}
      <div className="flex items-start gap-3">
        <div className="rounded-md border bg-muted p-1.5 shrink-0 mt-0.5">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight truncate">
            {fornecedor.nome_fantasia ?? fornecedor.razao_social}
          </p>
          {fornecedor.nome_fantasia && (
            <p className="text-xs text-muted-foreground truncate">{fornecedor.razao_social}</p>
          )}
        </div>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {ordensCount} ordem{ordensCount !== 1 ? 'ns' : ''}
        </Badge>
      </div>

      {/* Barra de uso */}
      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ) : resumo && resumo.valor_contratado != null ? (
        <div className="space-y-1.5">
          <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full rounded-full ${barColor}`}
              style={{ width: `${clampedPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Pago: <span className="font-medium text-foreground ml-0.5">
                {formatBRL(Number(resumo.total_pago))}
              </span>
            </span>
            <span className={pct > 100 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
              {pct.toFixed(0)}% utilizado
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Saldo:{' '}
            <span className="font-medium text-foreground">
              {formatBRL(Number(resumo.saldo_disponivel))}
            </span>
            {' '}de{' '}
            <span className="font-medium">{formatBRL(Number(resumo.valor_contratado))}</span>
          </p>
        </div>
      ) : resumo ? (
        <p className="text-xs text-muted-foreground italic">
          Contrato sem valor definido — clique para detalhes
        </p>
      ) : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AnaliseGabinetePage() {
  const [selectedFornecedorId, setSelectedFornecedorId] = useState<string | null>(null)

  // Query de KPI — busca até 200 ordens para cálculo client-side
  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['ordens', 'kpi', 'AGUARDANDO_GABINETE'],
    queryFn: () => listOrdens({ status: 'AGUARDANDO_GABINETE', page: 1, limit: 200 }),
    staleTime: 1000 * 60,
  })

  // KPIs derivados dos dados
  const totalAguardando = kpiData?.total ?? 0
  const urgentes = kpiData?.items.filter((o) => o.prioridade === 'urgente').length ?? 0
  const maisDe5Dias =
    kpiData?.items.filter((o) => getDaysInStage(o.updated_at) >= 5).length ?? 0

  // Fornecedores únicos em pauta — extraídos das ordens carregadas
  const fornecedoresEmPauta: { fornecedor: FornecedorBasico; count: number }[] = (() => {
    if (!kpiData?.items) return []
    const map = new Map<string, { fornecedor: FornecedorBasico; count: number }>()
    for (const ordem of kpiData.items) {
      if (!ordem.fornecedor) continue
      const existing = map.get(ordem.fornecedor.id)
      if (existing) {
        existing.count++
      } else {
        map.set(ordem.fornecedor.id, { fornecedor: ordem.fornecedor, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  })()

  return (
    <>
      <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold">Análise do Gabinete</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ordens aguardando autorização, devolução ou cancelamento.
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            title="Total aguardando"
            value={totalAguardando}
            icon={ClipboardList}
            colorClass="text-blue-600"
            isLoading={kpiLoading}
          />
          <KpiCard
            title="Urgentes"
            value={urgentes}
            icon={AlertTriangle}
            colorClass={urgentes > 0 ? 'text-red-600' : 'text-muted-foreground'}
            isLoading={kpiLoading}
          />
          <KpiCard
            title="Há mais de 5 dias"
            value={maisDe5Dias}
            icon={Clock}
            colorClass={maisDe5Dias > 0 ? 'text-yellow-600' : 'text-muted-foreground'}
            isLoading={kpiLoading}
          />
        </div>

        {/* Fornecedores em análise */}
        {(kpiLoading || fornecedoresEmPauta.length > 0) && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Fornecedores em análise
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Empresas vinculadas às ordens desta fila — clique para ver contrato e gastos.
              </p>
            </div>

            {kpiLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-2.5 w-full rounded-full" />
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fornecedoresEmPauta.map(({ fornecedor, count }) => (
                  <FornecedorCard
                    key={fornecedor.id}
                    fornecedor={fornecedor}
                    ordensCount={count}
                    onClick={() => setSelectedFornecedorId(fornecedor.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fila de ordens */}
        <WorkflowTable
          statusFilter={'AGUARDANDO_GABINETE' as StatusOrdem}
          title="Ordens aguardando análise"
          emptyMessage="Não há ordens aguardando análise do Gabinete no momento."
          showSecretariaColumn={true}
          renderActions={(orderId, status, onActionComplete) => (
            <ActionPanel
              orderId={orderId}
              currentStatus={status}
              userRole="gabinete"
              onActionComplete={onActionComplete}
            />
          )}
        />
      </div>

      {/* Sheet de detalhe do fornecedor */}
      <FornecedorDetailSheet
        fornecedorId={selectedFornecedorId}
        onClose={() => setSelectedFornecedorId(null)}
      />
    </>
  )
}
