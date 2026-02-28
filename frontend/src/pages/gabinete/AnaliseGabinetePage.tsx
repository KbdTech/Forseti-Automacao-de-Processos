/**
 * AnaliseGabinetePage — fila de análise do Gabinete do Prefeito — US-005.
 *
 * Features:
 *   - KPI cards: Total aguardando, Urgentes (vermelho), Há mais de 5 dias (amarelo)
 *   - WorkflowTable filtrando AGUARDANDO_GABINETE
 *   - ActionPanel injetado via renderActions no OrderDetailModal
 *
 * US-005 RN-26: somente ordens AGUARDANDO_GABINETE recebem ações do Gabinete.
 * US-005 RN-31: Gabinete pode visualizar qualquer ordem em modo somente-leitura.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, AlertTriangle, Clock } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { ActionPanel } from '@/components/workflow/ActionPanel'
import { listOrdens } from '@/services/ordensService'
import type { StatusOrdem } from '@/types/ordem'

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
// Componente principal
// ---------------------------------------------------------------------------

export default function AnaliseGabinetePage() {
  // Query de KPI — busca até 200 ordens para cálculo client-side
  // Sprint 5 substituirá por endpoint /api/dashboard/summary
  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['ordens', 'kpi', 'AGUARDANDO_GABINETE'],
    queryFn: () =>
      listOrdens({ status: 'AGUARDANDO_GABINETE', page: 1, limit: 200 }),
    staleTime: 1000 * 60, // revalida após 1 min
  })

  // KPIs derivados dos dados
  const totalAguardando = kpiData?.total ?? 0
  const urgentes =
    kpiData?.items.filter((o) => o.prioridade === 'urgente').length ?? 0
  const maisDe5Dias =
    kpiData?.items.filter((o) => getDaysInStage(o.updated_at) >= 5).length ?? 0

  return (
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
  )
}
