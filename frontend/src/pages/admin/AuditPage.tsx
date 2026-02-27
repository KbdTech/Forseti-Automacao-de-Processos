/**
 * AuditPage — Log de Auditoria do Sistema — US-012.
 *
 * Exibe logs de acesso e ações do sistema em tabela paginada com filtros.
 * Acesso exclusivo para administradores.
 *
 * US-012 RN-60: log append-only — apenas leitura.
 * US-012 RN-62: acesso restrito a admin.
 * US-012 RN-63: exportação em PDF via window.print().
 */

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, RefreshCw, ShieldAlert } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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

import { getAuditLogs } from '@/services/auditService'
import type { AuditLogFilters } from '@/services/auditService'

// ---------------------------------------------------------------------------
// Configuração de ações auditadas
// ---------------------------------------------------------------------------

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const ACAO_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
  login_success:               { label: 'Login',           variant: 'default' },
  logout:                      { label: 'Logout',          variant: 'secondary' },
  login_failed_unknown_email:  { label: 'E-mail não encontrado', variant: 'destructive' },
  login_failed_wrong_password: { label: 'Senha Incorreta', variant: 'destructive' },
  password_changed:            { label: 'Senha Alterada',  variant: 'outline' },
  account_locked:              { label: 'Conta Bloqueada', variant: 'destructive' },
  role_changed:                { label: 'Perfil Alterado', variant: 'outline' },
}

const ACOES_OPCOES = Object.keys(ACAO_CONFIG)

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function ActionBadge({ action }: { action: string }) {
  const config = ACAO_CONFIG[action.toLowerCase()]
  if (!config) {
    return (
      <Badge variant="secondary" className="font-mono text-xs">
        {action}
      </Badge>
    )
  }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function formatDatetime(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function AuditPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({ page: 1, limit: 20 })
  const [form, setForm] = useState({ data_inicio: '', data_fim: '', acao: '' })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => getAuditLogs(filters),
    staleTime: 1000 * 60, // 1 minuto
  })

  function applyFilters() {
    setFilters({
      page: 1,
      limit: 20,
      ...(form.data_inicio && { data_inicio: form.data_inicio }),
      ...(form.data_fim && { data_fim: form.data_fim }),
      ...(form.acao && form.acao !== '__all__' && { acao: form.acao }),
    })
  }

  function clearFilters() {
    setForm({ data_inicio: '', data_fim: '', acao: '' })
    setFilters({ page: 1, limit: 20 })
  }

  function handleExport() {
    // US-012 RN-63: exportação PDF via impressão do navegador
    window.print()
  }

  return (
    <div className="p-6 space-y-6">
      {/* ----------------------------------------------------------------
          Cabeçalho
      ---------------------------------------------------------------- */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold">Log de Auditoria</h1>
            <p className="text-sm text-muted-foreground">
              Registro imutável de acessos e ações do sistema (US-012)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          Painel de filtros
      ---------------------------------------------------------------- */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm font-medium">Filtros</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="audit-data-inicio" className="text-xs">
              Data de início
            </Label>
            <Input
              id="audit-data-inicio"
              type="date"
              value={form.data_inicio}
              onChange={e => setForm(s => ({ ...s, data_inicio: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-data-fim" className="text-xs">
              Data de fim
            </Label>
            <Input
              id="audit-data-fim"
              type="date"
              value={form.data_fim}
              onChange={e => setForm(s => ({ ...s, data_fim: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-acao" className="text-xs">
              Ação
            </Label>
            <Select
              value={form.acao || '__all__'}
              onValueChange={v =>
                setForm(s => ({ ...s, acao: v === '__all__' ? '' : v }))
              }
            >
              <SelectTrigger id="audit-acao">
                <SelectValue placeholder="Todas as ações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as ações</SelectItem>
                {ACOES_OPCOES.map(a => (
                  <SelectItem key={a} value={a}>
                    {ACAO_CONFIG[a].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={applyFilters}>
              Filtrar
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Limpar
            </Button>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          Tabela
      ---------------------------------------------------------------- */}
      <div className="rounded-lg border overflow-hidden">
        {isError && (
          <p className="text-sm text-destructive p-4">
            Erro ao carregar o log de auditoria. Tente novamente.
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[175px]">Data/Hora</TableHead>
              <TableHead className="w-[200px]">Usuário</TableHead>
              <TableHead className="w-[180px]">Ação</TableHead>
              <TableHead className="hidden md:table-cell w-[130px]">IP</TableHead>
              <TableHead className="hidden lg:table-cell">User Agent</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-64" /></TableCell>
                  </TableRow>
                ))
              : !data?.items.length
              ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-sm text-muted-foreground"
                    >
                      Nenhum registro encontrado para os filtros aplicados.
                    </TableCell>
                  </TableRow>
                )
              : data.items.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-mono whitespace-nowrap tabular-nums">
                      {formatDatetime(log.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.user_nome ?? (
                        <span className="text-muted-foreground italic">desconhecido</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={log.action} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                      {log.ip_address ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[280px] truncate">
                      <span title={log.user_agent ?? ''}>
                        {log.user_agent ?? '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* ----------------------------------------------------------------
          Paginação
      ---------------------------------------------------------------- */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {data.total.toLocaleString('pt-BR')} registros · página {data.page} de{' '}
            {data.pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() =>
                setFilters(f => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))
              }
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.pages}
              onClick={() =>
                setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
