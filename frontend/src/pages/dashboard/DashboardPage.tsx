/**
 * DashboardPage — Dashboard Executivo — US-011.
 *
 * Features:
 *   - DateRangePicker (default: mês atual) + botão refresh manual
 *   - Auto-refresh a cada 5 minutos (useQuery refetchInterval)
 *   - Grid de 6 KPICards
 *   - 3 gráficos Recharts: por etapa, por secretaria, status por secretaria
 *   - AlertPanel: gargalos + secretarias com atenção
 *
 * Acesso:
 *   - gabinete / admin: tudo visível
 *   - secretaria: somente KPIs da própria secretaria (sem AlertPanel)
 *
 * US-011 RN-55: KPIs calculados no banco — NUNCA no front-end.
 * US-011 RN-56: gargalos = ordens paradas > 5 dias corridos.
 * US-011 RN-57: taxa > 20% → alerta de atenção.
 * US-011 RN-59: auto-refresh a cada 5 minutos.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Timer,
  RefreshCw,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { KPICard, KPICardSkeleton } from '@/components/dashboard/KPICard'
import { getSummary, getAlertas } from '@/services/dashboardService'
import { useAuth } from '@/hooks/useAuth'
import { STATUS_CONFIG } from '@/utils/constants'
import type { StatusOrdem } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** US-011 RN-59: auto-refresh a cada 5 minutos. */
const REFETCH_INTERVAL_MS = 5 * 60 * 1000

/** Formata valor monetário em BRL. */
function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Formata date para YYYY-MM-DD (parâmetro da API). */
function toISO(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Cor hex para status (compatível com Recharts). */
const STATUS_HEX: Record<string, string> = {
  AGUARDANDO_GABINETE: '#3b82f6',
  AGUARDANDO_CONTROLADORIA: '#60a5fa',
  AGUARDANDO_EMPENHO: '#93c5fd',
  AGUARDANDO_EXECUCAO: '#bfdbfe',
  AGUARDANDO_ATESTO: '#a78bfa',
  AGUARDANDO_LIQUIDACAO: '#7c3aed',
  AGUARDANDO_PAGAMENTO: '#6d28d9',
  AGUARDANDO_DOCUMENTACAO: '#2563eb',
  DEVOLVIDA_PARA_ALTERACAO: '#f59e0b',
  COM_IRREGULARIDADE: '#ef4444',
  EXECUCAO_COM_PENDENCIA: '#dc2626',
  CANCELADA: '#6b7280',
  PAGA: '#10b981',
}

// ---------------------------------------------------------------------------
// Subcomponentes de gráficos
// ---------------------------------------------------------------------------

/** Tooltip customizado para gráfico de valor por secretaria (BRL). */
function BRLTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border rounded-md shadow-md p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.name}: {formatBRL(p.value)}
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user, isRole } = useAuth()

  const isGabineteOrAdmin = isRole('gabinete', 'admin')
  const isSecretaria = isRole('secretaria')

  // --- Período --- default: mês atual
  const today = new Date()
  const [dataInicio, setDataInicio] = useState(toISO(startOfMonth(today)))
  const [dataFim, setDataFim] = useState(toISO(endOfMonth(today)))

  // --- Query: Summary ---
  const {
    data: summary,
    isLoading: loadingSummary,
    isError: errorSummary,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['dashboard', 'summary', dataInicio, dataFim, user?.secretaria_id],
    queryFn: () => getSummary(dataInicio, dataFim),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 60_000,
  })

  // --- Query: Alertas (somente gabinete/admin) ---
  const {
    data: alertas,
    isLoading: loadingAlertas,
    refetch: refetchAlertas,
  } = useQuery({
    queryKey: ['dashboard', 'alertas'],
    queryFn: getAlertas,
    enabled: isGabineteOrAdmin,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 60_000,
  })

  function handleRefresh() {
    refetchSummary()
    if (isGabineteOrAdmin) refetchAlertas()
  }

  // --- KPI helpers ---
  const kpis = summary?.kpis

  function taxaColor(): string {
    const t = kpis?.taxa_reprovacao ?? 0
    if (t > 20) return 'text-red-600'
    if (t > 10) return 'text-yellow-600'
    return 'text-green-600'
  }

  // --- Dados dos gráficos ---
  const porEtapaData = (summary?.por_etapa ?? []).map((row) => ({
    status: STATUS_CONFIG[row.status as StatusOrdem]?.label ?? row.status,
    count: row.count,
    fill: STATUS_HEX[row.status] ?? '#94a3b8',
  }))

  const porSecretariaData = (summary?.por_secretaria ?? []).map((row) => ({
    name: row.secretaria_nome,
    'Valor Orçado': row.valor_estimado_total,
    'Valor Pago': row.valor_pago_total,
  }))

  // Pivotar status_por_secretaria para Recharts (StackedBar)
  const statusPorSecretariaData = (() => {
    const rows = summary?.status_por_secretaria ?? []
    const secretarias = [...new Set(rows.map((r) => r.secretaria_nome))]
    const statuses = [...new Set(rows.map((r) => r.status))]
    return secretarias.map((sec) => {
      const entry: Record<string, string | number> = { name: sec }
      statuses.forEach((s) => {
        const found = rows.find((r) => r.secretaria_nome === sec && r.status === s)
        entry[s] = found?.count ?? 0
      })
      return entry
    })
  })()

  const uniqueStatuses = [
    ...new Set((summary?.status_por_secretaria ?? []).map((r) => r.status)),
  ]

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">

      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isSecretaria
              ? 'Indicadores da sua secretaria'
              : 'Visão geral das ordens de serviço e compras públicas'}
          </p>
        </div>

        {/* DateRangePicker + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-[150px]"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              title="Data início"
            />
            <span className="text-muted-foreground text-sm">até</span>
            <Input
              type="date"
              className="w-[150px]"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              title="Data fim"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            title="Atualizar dados"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Erro */}
      {errorSummary && (
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar dados do dashboard.{' '}
            <button
              className="underline font-medium"
              onClick={handleRefresh}
            >
              Tentar novamente
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Grid de KPIs                                                         */}
      {/* ------------------------------------------------------------------ */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loadingSummary ? (
          Array.from({ length: 6 }).map((_, i) => <KPICardSkeleton key={i} />)
        ) : (
          <>
            <KPICard
              title="Total de Ordens"
              value={kpis?.total_ordens ?? 0}
              icon={FileText}
              color="text-blue-600"
            />
            <KPICard
              title="Valor Total"
              value={formatBRL(kpis?.valor_total ?? 0)}
              icon={DollarSign}
              color="text-green-600"
            />
            <KPICard
              title="Em Aberto"
              value={kpis?.em_aberto ?? 0}
              icon={Clock}
              color="text-yellow-600"
            />
            <KPICard
              title="Pagas"
              value={kpis?.pagas ?? 0}
              icon={CheckCircle}
              color="text-green-600"
            />
            <KPICard
              title="Taxa de Reprovação"
              value={`${(kpis?.taxa_reprovacao ?? 0).toFixed(1)}%`}
              icon={AlertTriangle}
              color={taxaColor()}
            />
            <KPICard
              title="Tempo Médio de Processo"
              value={`${(kpis?.tempo_medio_dias ?? 0).toFixed(0)} dias`}
              icon={Timer}
              color="text-blue-600"
            />
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Gráficos — somente para gabinete/admin ou secretaria (sem "por sec")*/}
      {/* ------------------------------------------------------------------ */}

      {/* Gráfico 1: Distribuição por Etapa (BarChart horizontal) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuição por Etapa do Fluxo</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSummary ? (
            <Skeleton className="h-64 w-full" />
          ) : porEtapaData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Sem dados para o período selecionado.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={porEtapaData}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 180 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="status"
                  width={175}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" name="Ordens" radius={[0, 4, 4, 0]}>
                  {porEtapaData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gráficos por secretaria — somente gabinete/admin */}
      {isGabineteOrAdmin && (
        <>
          {/* Gráfico 2: Valor Orçado vs Valor Pago por Secretaria */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Valor Orçado vs. Pago por Secretaria</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSummary ? (
                <Skeleton className="h-64 w-full" />
              ) : porSecretariaData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Sem dados para o período selecionado.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={porSecretariaData}
                    margin={{ top: 4, right: 24, bottom: 40, left: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `R$${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                          ? `R$${(v / 1_000).toFixed(0)}k`
                          : `R$${v}`
                      }
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<BRLTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Valor Orçado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Valor Pago" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 3: Status por Secretaria (StackedBar) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status das Ordens por Secretaria</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSummary ? (
                <Skeleton className="h-64 w-full" />
              ) : statusPorSecretariaData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  Sem dados para o período selecionado.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={statusPorSecretariaData}
                    margin={{ top: 4, right: 24, bottom: 40, left: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-30}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {uniqueStatuses.map((s) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        name={STATUS_CONFIG[s as StatusOrdem]?.label ?? s}
                        stackId="a"
                        fill={STATUS_HEX[s] ?? '#94a3b8'}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* ---------------------------------------------------------------- */}
          {/* AlertPanel — somente gabinete/admin                               */}
          {/* ---------------------------------------------------------------- */}

          {loadingAlertas ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alertas de Gargalos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Gargalos */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Alertas de Gargalos
                    {(alertas?.gargalos.length ?? 0) > 0 && (
                      <Badge variant="destructive" className="ml-1">
                        {alertas!.gargalos.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!alertas?.gargalos.length ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      Nenhum gargalo detectado no momento.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {alertas.gargalos.map((g) => (
                        <li
                          key={g.ordem_id}
                          className="py-3 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="destructive" className="text-xs">
                              Gargalo
                            </Badge>
                            <span className="font-mono text-sm font-medium">
                              {g.protocolo}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {g.secretaria_nome}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {STATUS_CONFIG[g.status as StatusOrdem]?.label ?? g.status}
                            </span>
                          </div>
                          <span className="text-sm text-red-600 font-medium whitespace-nowrap">
                            Há {g.dias_na_etapa} dia{g.dias_na_etapa !== 1 ? 's' : ''} nesta etapa
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Secretarias com Atenção */}
              {(alertas?.secretarias_atencao.length ?? 0) > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Secretarias que Requerem Atenção
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {alertas!.secretarias_atencao.map((s) => (
                        <li
                          key={s.secretaria_nome}
                          className="py-3 flex items-center justify-between gap-4"
                        >
                          <span className="text-sm font-medium">{s.secretaria_nome}</span>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>
                              {s.com_problema}/{s.total_ordens} ordens c/ problema
                            </span>
                            <Badge
                              variant="outline"
                              className="bg-red-50 text-red-700 border-red-200"
                            >
                              {s.percentual.toFixed(1)}% taxa
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Nota de período */}
      <p className="text-xs text-muted-foreground text-right">
        Período:{' '}
        {format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })} até{' '}
        {format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })} — atualizado
        automaticamente a cada 5 minutos.
      </p>
    </div>
  )
}
