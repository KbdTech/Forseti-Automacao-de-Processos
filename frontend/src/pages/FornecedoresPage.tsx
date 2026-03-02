/**
 * FornecedoresPage — S12.2.
 *
 * Listagem somente-leitura de fornecedores cadastrados.
 * Acessível por todos os perfis autenticados (exceto admin que usa /admin/fornecedores).
 *
 * Clicar em uma linha abre o FornecedorDetailSheet com:
 *   - Barra de uso do contrato (total pago vs. contratado)
 *   - Gráfico de barras mensais
 *   - Lista de ordens pagas
 *   - Dados do contrato e bancários
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Store, ChevronRight } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import { listSecretarias } from '@/services/secretariasService'
import { listFornecedores } from '@/services/fornecedoresService'
import { FornecedorDetailSheet } from '@/components/fornecedores/FornecedorDetailSheet'
import { formatBRL, formatCNPJ, formatNomeSecretaria } from '@/utils/formatters'

// ---------------------------------------------------------------------------
// Hook de debounce (300ms) — padrão interno do projeto
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
// Skeleton da tabela
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-52" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function FornecedoresPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [secretariaFilter, setSecretariaFilter] = useState('TODAS')
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo' | 'TODOS'>('TODOS')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  const { data: secretarias } = useQuery({
    queryKey: ['secretarias'],
    queryFn: listSecretarias,
    staleTime: 5 * 60 * 1000,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fornecedores', debouncedQuery, secretariaFilter, statusFilter],
    queryFn: () =>
      listFornecedores({
        q: debouncedQuery || undefined,
        secretaria_id: secretariaFilter !== 'TODAS' ? secretariaFilter : undefined,
        is_active:
          statusFilter === 'ativo' ? true : statusFilter === 'inativo' ? false : undefined,
      }),
  })

  const fornecedores = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h2 className="text-xl font-semibold text-foreground">Fornecedores</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? 'Carregando…'
              : `${total} fornecedor(es) encontrado(s) — clique para ver detalhes`}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Buscar por razão social ou CNPJ…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sm:max-w-xs"
          />

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

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'ativo' | 'inativo' | 'TODOS')}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tabela clicável */}
        <div className="rounded-md border bg-background overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Valor Usado</TableHead>
                <TableHead>Valor Contratado</TableHead>
                <TableHead>Secretaria</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableSkeleton />}

              {isError && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-destructive py-8">
                    Erro ao carregar fornecedores. Tente recarregar a página.
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && fornecedores.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Store className="h-10 w-10 opacity-30" aria-hidden="true" />
                      <p className="text-sm">Nenhum fornecedor encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {fornecedores.map((f) => (
                <TableRow
                  key={f.id}
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${f.is_active ? '' : 'opacity-60'}`}
                  onClick={() => setSelectedId(f.id)}
                >
                  <TableCell className="font-medium max-w-[200px]">
                    <span className="block truncate" title={f.razao_social}>
                      {f.razao_social}
                    </span>
                    {f.nome_fantasia && (
                      <span
                        className="block truncate text-xs text-muted-foreground"
                        title={f.nome_fantasia}
                      >
                        {f.nome_fantasia}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm whitespace-nowrap">
                    {formatCNPJ(f.cnpj)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap tabular-nums">
                    {formatBRL(f.total_pago ?? 0)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap font-medium tabular-nums">
                    {f.valor_contratado != null ? formatBRL(f.valor_contratado) : '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {f.secretaria_nome ? (
                      <span title={f.secretaria_nome} className="truncate max-w-[140px] block">
                        {formatNomeSecretaria(f.secretaria_nome)}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs">Global</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.is_active ? 'default' : 'secondary'}>
                      {f.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Sheet de detalhe — montado fora da tabela para não criar problemas de z-index */}
      <FornecedorDetailSheet
        fornecedorId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}
