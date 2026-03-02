/**
 * FornecedorDetailSheet — painel lateral com detalhe completo de um fornecedor.
 *
 * Tabs:
 *   - Resumo: KPIs financeiros (total pago, saldo, %) + gráfico de barras mensais
 *   - Ordens:  tabela das últimas ordens pagas vinculadas
 *   - Contrato: dados do contrato + informações bancárias
 *
 * Carrega GET /api/fornecedores/{id}/resumo apenas quando o sheet está aberto.
 */

import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Building2,
  CreditCard,
  FileText,
  TrendingUp,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

import { getFornecedorResumo } from '@/services/fornecedoresService'
import { formatBRL, formatCNPJ } from '@/utils/formatters'
import type { GastoMes } from '@/types/fornecedor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMes(mes: string): string {
  // "2025-03" → "Mar/25"
  const [year, month] = mes.split('-')
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${monthNames[parseInt(month) - 1]}/${year.slice(2)}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------------------
// Sub: barra de progresso manual (sem shadcn Progress)
// ---------------------------------------------------------------------------

interface UsageBarProps {
  pct: number        // 0-100
  totalPago: number
  valorContratado: number | null
  saldoDisponivel: number
}

function UsageBar({ pct, totalPago, valorContratado, saldoDisponivel }: UsageBarProps) {
  const clampedPct = Math.min(pct, 100)
  const isOverBudget = pct > 100
  const barColor = isOverBudget
    ? 'bg-red-500'
    : clampedPct >= 80
      ? 'bg-yellow-500'
      : 'bg-emerald-500'

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Utilizado
          </p>
          <p className="text-2xl font-bold tabular-nums">{formatBRL(totalPago)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            Valor Contratado
          </p>
          <p className="text-2xl font-bold tabular-nums text-muted-foreground">
            {valorContratado != null ? formatBRL(valorContratado) : '—'}
          </p>
        </div>
      </div>

      {/* Barra */}
      <div className="relative h-4 rounded-full bg-muted overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className={`font-semibold ${isOverBudget ? 'text-red-600' : 'text-emerald-700'}`}>
          {pct.toFixed(1)}% utilizado
        </span>
        <span className="text-muted-foreground">
          Saldo: <span className="font-medium text-foreground">{formatBRL(saldoDisponivel)}</span>
        </span>
      </div>

      {isOverBudget && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Valor total pago excede o contratado
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub: KPI stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  className = '',
}: {
  label: string
  value: string
  icon: React.ElementType
  className?: string
}) {
  return (
    <div className={`rounded-lg border bg-card p-4 space-y-1 ${className}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub: Tooltip customizado do BarChart
// ---------------------------------------------------------------------------

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-emerald-700 font-bold">{formatBRL(payload[0].value)}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub: Tab Resumo
// ---------------------------------------------------------------------------

function TabResumo({ data }: { data: ReturnType<typeof getFornecedorResumo> extends Promise<infer T> ? T : never }) {
  const chartData = data.gastos_por_mes.map((g: GastoMes) => ({
    mes: formatMes(g.mes),
    total: Number(g.total_pago),
    ordens: g.count_ordens,
  }))

  return (
    <div className="space-y-6">
      {/* Barra de uso do contrato */}
      {data.valor_contratado != null ? (
        <div className="rounded-lg border bg-muted/30 p-4">
          <UsageBar
            pct={data.percentual_utilizado}
            totalPago={Number(data.total_pago)}
            valorContratado={Number(data.valor_contratado)}
            saldoDisponivel={Number(data.saldo_disponivel)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Valor contratado não informado — não é possível calcular saldo.
        </p>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total Pago"
          value={formatBRL(Number(data.total_pago))}
          icon={TrendingUp}
        />
        <StatCard
          label="Ordens Pagas"
          value={String(data.total_ordens_pagas)}
          icon={CheckCircle2}
        />
      </div>

      {/* Gráfico de gastos mensais */}
      {chartData.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Gastos mensais (ordens pagas)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <TrendingUp className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Nenhuma ordem paga registrada para este fornecedor.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub: Tab Ordens
// ---------------------------------------------------------------------------

function TabOrdens({ ordens }: { ordens: ReturnType<typeof getFornecedorResumo> extends Promise<infer T> ? T['ultimas_ordens'] : never }) {
  if (ordens.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <CheckCircle2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhuma ordem paga encontrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Últimas {ordens.length} ordem(ns) paga(s) vinculadas a este fornecedor.
      </p>
      {ordens.map((o) => (
        <div
          key={o.id}
          className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 gap-3"
        >
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium">{o.protocolo}</p>
            {o.secretaria_nome && (
              <p className="text-xs text-muted-foreground truncate">{o.secretaria_nome}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold tabular-nums">
              {o.valor_pago != null ? formatBRL(Number(o.valor_pago)) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(o.data_pagamento)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub: Tab Contrato + Dados Bancários
// ---------------------------------------------------------------------------

function TabContrato({ data }: { data: ReturnType<typeof getFornecedorResumo> extends Promise<infer T> ? T : never }) {
  function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="flex justify-between gap-4 py-2 border-b last:border-0">
        <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
        <span className="text-sm text-right">{value ?? '—'}</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Contrato */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Contrato
        </p>
        <Row label="Nº Processo" value={data.numero_processo} />
        <Row label="Objeto" value={data.objeto_contrato
          ? <span className="leading-snug">{data.objeto_contrato}</span>
          : null}
        />
        <Row
          label="Valor Contratado"
          value={data.valor_contratado != null
            ? <span className="font-semibold">{formatBRL(Number(data.valor_contratado))}</span>
            : null}
        />
        <Row label="Data do Contrato" value={formatDate(data.data_contrato)} />
        <Row label="Secretaria" value={
          data.secretaria_nome
            ? data.secretaria_nome
            : <Badge variant="outline" className="text-xs">Global</Badge>
        } />
      </div>

      <Separator />

      {/* Dados Bancários */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5" /> Dados Bancários
        </p>
        {data.banco || data.agencia || data.conta ? (
          <>
            <Row label="Banco" value={data.banco} />
            <Row label="Agência" value={data.agencia} />
            <Row label="Conta" value={
              data.conta
                ? `${data.conta} (${data.tipo_conta === 'poupanca' ? 'Poupança' : 'Corrente'})`
                : null
            } />
          </>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Dados bancários não informados.
          </p>
        )}
      </div>

      <Separator />

      {/* Identificação */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Identificação
        </p>
        <Row
          label="CNPJ"
          value={<span className="font-mono">{formatCNPJ(data.cnpj)}</span>}
        />
        <Row label="Razão Social" value={data.razao_social} />
        {data.nome_fantasia && <Row label="Nome Fantasia" value={data.nome_fantasia} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface FornecedorDetailSheetProps {
  /** ID do fornecedor a exibir. null = sheet fechado. */
  fornecedorId: string | null
  onClose: () => void
}

export function FornecedorDetailSheet({ fornecedorId, onClose }: FornecedorDetailSheetProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fornecedor-resumo', fornecedorId],
    queryFn: () => getFornecedorResumo(fornecedorId!),
    enabled: fornecedorId != null,
    staleTime: 60_000,
  })

  const isOpen = fornecedorId != null

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col overflow-hidden p-0">
        {/* Header fixo */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32 mt-1" />
            </>
          ) : data ? (
            <>
              <div className="flex items-start gap-3">
                <div className="rounded-md border bg-muted p-2 shrink-0">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-base leading-tight">
                    {data.nome_fantasia ?? data.razao_social}
                  </SheetTitle>
                  {data.nome_fantasia && (
                    <SheetDescription className="text-xs truncate">
                      {data.razao_social}
                    </SheetDescription>
                  )}
                </div>
                <Badge
                  variant={data.is_active ? 'default' : 'secondary'}
                  className="ml-auto shrink-0"
                >
                  {data.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {formatCNPJ(data.cnpj)}
              </p>
            </>
          ) : isError ? (
            <SheetTitle className="text-destructive">Erro ao carregar fornecedor</SheetTitle>
          ) : null}
        </SheetHeader>

        {/* Conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 pt-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Carregando dados do fornecedor…</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center gap-2 pt-20 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">Não foi possível carregar as informações.</p>
            </div>
          )}

          {data && (
            <Tabs defaultValue="resumo">
              <TabsList className="w-full mb-5">
                <TabsTrigger value="resumo" className="flex-1 gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Resumo
                </TabsTrigger>
                <TabsTrigger value="ordens" className="flex-1 gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Ordens
                </TabsTrigger>
                <TabsTrigger value="contrato" className="flex-1 gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Contrato
                </TabsTrigger>
              </TabsList>

              <TabsContent value="resumo">
                <TabResumo data={data} />
              </TabsContent>

              <TabsContent value="ordens">
                <TabOrdens ordens={data.ultimas_ordens} />
              </TabsContent>

              <TabsContent value="contrato">
                <TabContrato data={data} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
