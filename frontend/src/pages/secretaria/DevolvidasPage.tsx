/**
 * DevolvidasPage — lista de ordens devolvidas para alteração — US-006/007.
 *
 * Features:
 *   - Tabela de ordens DEVOLVIDA_PARA_ALTERACAO da secretaria do usuário
 *   - Motivo de devolução obtido do historico (useQueries paralelo por página)
 *   - Dialog com 2 tabs: "Motivo da Devolução" e "Editar e Reenviar"
 *   - Seção de ordens AGUARDANDO_DOCUMENTACAO com botão Enviar Documentação (US-007)
 *   - Paginação 20/página, skeleton loader, empty state, error state
 *
 * US-006 RN-32: somente ordens DEVOLVIDA_PARA_ALTERACAO podem ser editadas.
 * US-006 RN-36: histórico mostra todas as versões e devoluções.
 * US-007 RN-37: Secretaria envia documentação solicitada pela Controladoria.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Pencil,
  RefreshCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'

import { useAuthStore } from '@/stores/authStore'
import { listOrdens, getOrdem } from '@/services/ordensService'
import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { ActionPanel } from '@/components/workflow/ActionPanel'
import { TIPO_ORDEM_LABELS, DEFAULT_PAGE_SIZE } from '@/utils/constants'
import type { OrdemHistorico, TipoOrdem } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—'
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Encontra a última entrada de 'solicitar_alteracao' no histórico (motivo da devolução). */
function getDevolucaoEntry(historico: OrdemHistorico[]): OrdemHistorico | undefined {
  return [...historico].reverse().find((h) => h.acao === 'solicitar_alteracao')
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 7 }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full max-w-[120px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function DevolvidasPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Lista de ordens devolvidas da secretaria
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ordens', 'devolvidas', page, user?.secretaria_id],
    queryFn: () =>
      listOrdens({
        status: 'DEVOLVIDA_PARA_ALTERACAO',
        secretaria_id: user?.secretaria_id ?? undefined,
        page,
        limit: DEFAULT_PAGE_SIZE,
      }),
    enabled: !!user,
    staleTime: 1000 * 30,
  })

  // Busca detalhes (com historico) de cada ordem da página atual — US-006 RN-36
  const detailQueries = useQueries({
    queries: (data?.items ?? []).map((ordem) => ({
      queryKey: ['ordem', ordem.id],
      queryFn: () => getOrdem(ordem.id),
      staleTime: 1000 * 60,
    })),
  })

  // Ordem selecionada para o modal
  const selectedOrdem = data?.items.find((o) => o.id === selectedId) ?? null
  const selectedIdx = data?.items.findIndex((o) => o.id === selectedId) ?? -1
  const selectedDetailQuery = selectedIdx >= 0 ? detailQueries[selectedIdx] : null
  const selectedDetail = selectedDetailQuery?.data ?? null
  const devolucaoEntry = selectedDetail?.historico
    ? getDevolucaoEntry(selectedDetail.historico)
    : null

  const totalPages = data?.pages ?? 1
  const from = data ? (page - 1) * DEFAULT_PAGE_SIZE + 1 : 0
  const to = data ? Math.min(page * DEFAULT_PAGE_SIZE, data.total) : 0

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Ordens Devolvidas para Alteração</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ordens que precisam de correção antes de serem reenviadas ao Gabinete.
        </p>
      </div>

      {/* Erro */}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Erro ao carregar as ordens. Verifique sua conexão.</span>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1 h-7">
              <RefreshCw className="h-3 w-3" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabela */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">Protocolo</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Descrição</TableHead>
              <TableHead className="font-semibold text-right">Valor Est.</TableHead>
              <TableHead className="font-semibold text-center">Versão</TableHead>
              <TableHead className="font-semibold">Devolvida em</TableHead>
              <TableHead className="font-semibold">Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <div className="text-center">
                      <p className="font-medium">Nenhuma ordem devolvida</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Você não possui ordens aguardando correção no momento.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((ordem, idx) => {
                const detail = detailQueries[idx]?.data
                const devolucao = detail?.historico
                  ? getDevolucaoEntry(detail.historico)
                  : undefined

                return (
                  <TableRow
                    key={ordem.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedId(ordem.id)}
                  >
                    {/* Protocolo */}
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium text-primary">
                          {ordem.protocolo}
                        </span>
                        <Badge
                          variant="outline"
                          className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Devolução
                        </Badge>
                      </div>
                    </TableCell>

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
                      {Number(ordem.valor_estimado).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </TableCell>

                    {/* Versão */}
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono text-xs">
                        v{ordem.versao}
                      </Badge>
                    </TableCell>

                    {/* Devolvida em */}
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {devolucao ? formatDate(devolucao.created_at) : '—'}
                    </TableCell>

                    {/* Motivo */}
                    <TableCell className="text-sm text-muted-foreground max-w-[180px]">
                      {devolucao?.observacao ? truncate(devolucao.observacao, 50) : '—'}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Exibindo {from}–{to} de {data.total} ordem{data.total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Seção: Documentação pendente (US-007 RN-37) */}
      {/* ------------------------------------------------------------------ */}
      <div className="pt-4 border-t space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Documentação Pendente</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Ordens aguardando o envio de documentação solicitada pela Controladoria.
          </p>
        </div>
        <WorkflowTable
          statusFilter="AGUARDANDO_DOCUMENTACAO"
          title="Ordens aguardando documentação"
          emptyMessage="Nenhuma ordem aguardando envio de documentação no momento."
          showSecretariaColumn={false}
          renderActions={(orderId, status, onActionComplete) => (
            <ActionPanel
              orderId={orderId}
              currentStatus={status}
              userRole="secretaria"
              onActionComplete={onActionComplete}
            />
          )}
        />
      </div>

      {/* Modal de detalhes com 2 abas */}
      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono">{selectedOrdem?.protocolo}</span>
              <Badge variant="secondary" className="font-mono text-xs">
                v{selectedOrdem?.versao}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="motivo" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="motivo" className="flex-1">
                Motivo da Devolução
              </TabsTrigger>
              <TabsTrigger value="editar" className="flex-1">
                Editar e Reenviar
              </TabsTrigger>
            </TabsList>

            {/* Aba: Motivo da Devolução */}
            <TabsContent value="motivo" className="mt-4 space-y-3">
              {devolucaoEntry ? (
                <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5 shrink-0" />
                    <div className="space-y-1 flex-1">
                      <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">
                        Solicitação de Alterações
                      </p>
                      <blockquote className="text-sm text-yellow-900 italic border-l-2 border-yellow-400 pl-3">
                        {devolucaoEntry.observacao ?? 'Sem observação informada.'}
                      </blockquote>
                    </div>
                  </div>
                  <div className="text-xs text-yellow-700 border-t border-yellow-200 pt-2 flex flex-col gap-0.5">
                    <span>
                      <span className="font-medium">Responsável:</span>{' '}
                      {devolucaoEntry.usuario_nome} ({devolucaoEntry.perfil})
                    </span>
                    <span>
                      <span className="font-medium">Data:</span>{' '}
                      {formatDate(devolucaoEntry.created_at)}
                    </span>
                  </div>
                </div>
              ) : selectedDetailQuery?.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Histórico de devolução não encontrado.
                </p>
              )}
            </TabsContent>

            {/* Aba: Editar e Reenviar */}
            <TabsContent value="editar" className="mt-4 space-y-4">
              <Card>
                <CardContent className="pt-4 pb-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Realize as alterações solicitadas pelo Gabinete e reenvie a ordem para nova
                    análise. O protocolo original será mantido.
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-xs">Versão atual:</span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      v{selectedOrdem?.versao}
                    </Badge>
                    <span className="text-xs">→</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      v{(selectedOrdem?.versao ?? 0) + 1}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  setSelectedId(null)
                  navigate(`/secretaria/ordens/${selectedId}/editar`)
                }}
              >
                <Pencil className="h-4 w-4" />
                Editar e Reenviar Ordem
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
