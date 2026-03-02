/**
 * GastosFornecedorPage — S12.3.
 *
 * Relatório de gastos por fornecedor com filtros de período e secretaria.
 * Acessível por: controladoria, contabilidade, tesouraria, secretaria.
 * Exportação CSV dos dados filtrados.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { Download, BarChart2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { listSecretarias } from '@/services/secretariasService'
import { getGastosFornecedor } from '@/services/dashboardService'
import { formatCNPJ, formatBRL } from '@/utils/formatters'
import { useAuth } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toISO(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function primeiroDiaDoMes(): string {
  return toISO(startOfMonth(new Date()))
}

function hoje(): string {
  return toISO(new Date())
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function GastosFornecedorPage() {
  const { isRole } = useAuth()

  // Perfis globais podem filtrar por secretaria; secretaria vê apenas a própria (scoped no backend)
  const isGlobal = isRole('controladoria', 'contabilidade', 'tesouraria', 'gabinete', 'admin')

  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes())
  const [dataFim, setDataFim] = useState(hoje())
  const [secretariaFilter, setSecretariaFilter] = useState('TODAS')

  // Secretarias para o filtro (apenas para perfis globais)
  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    enabled: isGlobal,
    staleTime: 5 * 60 * 1000,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['gastos-fornecedor', dataInicio, dataFim, secretariaFilter],
    queryFn: () =>
      getGastosFornecedor({
        data_inicio: dataInicio,
        data_fim: dataFim,
        secretaria_id:
          isGlobal && secretariaFilter !== 'TODAS' ? secretariaFilter : undefined,
      }),
  })

  const items = data ?? []

  // ---------------------------------------------------------------------------
  // Exportação CSV
  // ---------------------------------------------------------------------------

  function handleExportarCSV() {
    if (!items.length) return

    const linhas = [
      'Razão Social,CNPJ,Total Pago,Nº Ordens,Secretaria',
      ...items.map(
        (r) =>
          `"${r.razao_social}","${r.cnpj}",${r.total_pago},${r.count_ordens},"${r.secretaria_nome ?? 'Global'}"`,
      ),
    ]
    const csv = linhas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gastos-fornecedor-${dataInicio}-${dataFim}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Gastos por Fornecedor</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pagamentos realizados por empresa no período selecionado.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportarCSV}
          disabled={!items.length || isLoading}
          className="gap-1.5 shrink-0"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="data-inicio">Data Início</Label>
          <Input
            id="data-inicio"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-[150px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="data-fim">Data Fim</Label>
          <Input
            id="data-fim"
            type="date"
            value={dataFim}
            max={hoje()}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-[150px]"
          />
        </div>

        {isGlobal && (
          <div className="space-y-1.5">
            <Label>Secretaria</Label>
            <Select value={secretariaFilter} onValueChange={setSecretariaFilter}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Secretaria" />
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
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead className="text-right">Total Pago</TableHead>
              <TableHead className="text-right">Nº Ordens</TableHead>
              <TableHead>Secretaria</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))}
              </>
            )}

            {isError && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive py-8">
                  Erro ao carregar dados. Tente recarregar a página.
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <BarChart2 className="h-10 w-10 opacity-30" aria-hidden="true" />
                    <p className="text-sm">Nenhum pagamento registrado no período.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {items.map((item) => (
              <TableRow key={item.fornecedor_id}>
                <TableCell className="font-medium max-w-[220px]">
                  <span className="block truncate" title={item.razao_social}>
                    {item.razao_social}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap">
                  {formatCNPJ(item.cnpj)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap font-medium">
                  {formatBRL(item.total_pago)}
                </TableCell>
                <TableCell className="text-right">
                  {item.count_ordens}
                </TableCell>
                <TableCell className="text-sm">
                  {item.secretaria_nome ? (
                    <span>{item.secretaria_nome}</span>
                  ) : (
                    <Badge variant="outline" className="text-xs">Global</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Rodapé: total do período */}
      {items.length > 0 && (
        <div className="flex justify-end">
          <p className="text-sm text-muted-foreground">
            Total no período:{' '}
            <span className="font-semibold text-foreground">
              {formatBRL(items.reduce((acc, i) => acc + i.total_pago, 0))}
            </span>
            {' '}em{' '}
            <span className="font-semibold text-foreground">
              {items.reduce((acc, i) => acc + i.count_ordens, 0)}
            </span>{' '}
            ordem(ns) paga(s)
          </p>
        </div>
      )}
    </div>
  )
}
