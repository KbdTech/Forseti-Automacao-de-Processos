/**
 * AnaliseControladoriaPage — fila de análise da Controladoria — US-007.
 *
 * Features:
 *   - KPI cards: total aguardando análise, aguardando documentação, > 5 dias
 *   - WorkflowTable para AGUARDANDO_CONTROLADORIA com ações da Controladoria
 *   - Borda vermelha lateral em ordens URGENTE (rowClassName)
 *   - Filtro "Dias na etapa" (Todos / 3+ / 5+ / 10+)
 *   - WorkflowTable para AGUARDANDO_DOCUMENTACAO (somente visualização para Controladoria)
 *
 * US-007 RN-37: ações disponíveis somente em AGUARDANDO_CONTROLADORIA.
 * US-007 RN-38: parecer de irregularidade exige mínimo 50 caracteres.
 * US-007 RN-41: todo parecer registrado com nome completo do fiscal.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, AlertTriangle, FileCheck } from 'lucide-react'
import { differenceInCalendarDays, parseISO } from 'date-fns'

import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { ActionPanel } from '@/components/workflow/ActionPanel'
import { listOrdens } from '@/services/ordensService'
import type { Ordem } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

interface KpiCardProps {
  label: string
  value: number | string
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
          <div className={['p-3 rounded-full', colorClass.replace('text-', 'bg-').replace('-600', '-100').replace('-700', '-100')].join(' ')}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AnaliseControladoriaPage() {
  const [diasFilter, setDiasFilter] = useState<0 | 3 | 5 | 10>(0)

  // Busca os dados brutos para os KPI cards
  const { data: dataControladoria, isLoading: loadingControladoria } = useQuery({
    queryKey: ['ordens', 'kpi', 'AGUARDANDO_CONTROLADORIA'],
    queryFn: () => listOrdens({ status: 'AGUARDANDO_CONTROLADORIA', page: 1, limit: 100 }),
    staleTime: 1000 * 30,
  })

  const { data: dataDocumentacao, isLoading: loadingDocumentacao } = useQuery({
    queryKey: ['ordens', 'kpi', 'AGUARDANDO_DOCUMENTACAO'],
    queryFn: () => listOrdens({ status: 'AGUARDANDO_DOCUMENTACAO', page: 1, limit: 100 }),
    staleTime: 1000 * 30,
  })

  // KPIs derivados dos dados
  const totalControladoria = dataControladoria?.total ?? 0
  const totalDocumentacao = dataDocumentacao?.total ?? 0
  const totalMais5Dias = (dataControladoria?.items ?? []).filter(
    (o) => getDaysInStage(o.updated_at) >= 5,
  ).length

  const isLoadingKpis = loadingControladoria || loadingDocumentacao

  // rowClassName: borda vermelha lateral para ordens URGENTE — US-007 RN visual
  function getRowClassName(ordem: Ordem): string {
    return ordem.prioridade === 'URGENTE' ? 'border-l-4 border-l-red-500' : ''
  }

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
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
          value={totalControladoria}
          icon={<FileCheck className="h-5 w-5" />}
          colorClass="text-blue-600"
          isLoading={isLoadingKpis}
        />
        <KpiCard
          label="Aguardando Documentação"
          value={totalDocumentacao}
          icon={<AlertTriangle className="h-5 w-5" />}
          colorClass="text-yellow-600"
          isLoading={isLoadingKpis}
        />
        <KpiCard
          label="Paradas há mais de 5 dias"
          value={totalMais5Dias}
          icon={<Clock className="h-5 w-5" />}
          colorClass="text-red-700"
          isLoading={isLoadingKpis}
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Seção 1 — Ordens aguardando análise */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Ordens em Análise</h2>
            <p className="text-muted-foreground text-sm">
              Ordens com status <span className="font-mono">AGUARDANDO_CONTROLADORIA</span>.
            </p>
          </div>

          {/* Filtro por dias na etapa */}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">Dias na etapa:</span>
            <Select
              value={String(diasFilter)}
              onValueChange={(v) => setDiasFilter(Number(v) as 0 | 3 | 5 | 10)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todos</SelectItem>
                <SelectItem value="3">3+ dias</SelectItem>
                <SelectItem value="5">5+ dias</SelectItem>
                <SelectItem value="10">10+ dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <WorkflowTable
          statusFilter="AGUARDANDO_CONTROLADORIA"
          title="Ordens aguardando análise da Controladoria"
          emptyMessage="Não há ordens aguardando análise da Controladoria."
          showSecretariaColumn={true}
          rowClassName={getRowClassName}
          minDaysFilter={diasFilter > 0 ? diasFilter : undefined}
          renderActions={(orderId, status, onActionComplete) => (
            <ActionPanel
              orderId={orderId}
              currentStatus={status}
              userRole="controladoria"
              onActionComplete={onActionComplete}
            />
          )}
        />
      </div>

      <Separator />

      {/* ---------------------------------------------------------------- */}
      {/* Seção 2 — Ordens aguardando documentação (read-only para Controladoria) */}
      {/* ---------------------------------------------------------------- */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Aguardando Documentação das Secretarias</h2>
          <p className="text-muted-foreground text-sm">
            Ordens pendentes de envio de documentação. Ação disponível somente para a Secretaria.
          </p>
        </div>

        <WorkflowTable
          statusFilter="AGUARDANDO_DOCUMENTACAO"
          title="Ordens aguardando documentação"
          emptyMessage="Nenhuma ordem aguardando documentação no momento."
          showSecretariaColumn={true}
          renderActions={(_orderId, _status, _onActionComplete) => null}
        />
      </div>
    </div>
  )
}
