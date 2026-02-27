/**
 * OrderDetailModal — exibe detalhes completos de uma ordem em um Dialog.
 *
 * Duas tabs:
 *   - Detalhes: campos gerais + campos financeiros quando preenchidos
 *   - Histórico: timeline de tramitação em ordem cronológica
 *
 * US-004 RN-22: histórico em ordem cronológica (ASC — já garantido pelo back-end).
 * US-012 RN-61: campos completos de auditoria.
 */

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, CheckCircle, RotateCcw, XCircle, FileText, Clock, AlertTriangle, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

import { StatusBadge } from '@/components/workflow/StatusBadge'
import { DocumentList } from '@/components/ordens/DocumentList'
import { DocumentUploader } from '@/components/ordens/DocumentUploader'
import { cn } from '@/lib/utils'
import { getOrdem } from '@/services/ordensService'
import { useAuthStore } from '@/stores/authStore'
import { TIPO_ORDEM_LABELS, PRIORIDADE_CONFIG, PRIORIDADE_LABELS } from '@/utils/constants'
import type { TipoOrdem, Prioridade, OrdemHistorico, StatusOrdem } from '@/types/ordem'

// US-015 RN: statuses após os quais documentos são somente-leitura
// US-016: statuses que não permitem novos uploads de documentos.
// Permitidos implicitamente: AGUARDANDO_GABINETE, DEVOLVIDA_PARA_ALTERACAO, AGUARDANDO_DOCUMENTACAO.
const STATUSES_IMUTAVEIS: StatusOrdem[] = [
  'AGUARDANDO_CONTROLADORIA',
  'AGUARDANDO_EMPENHO',
  'AGUARDANDO_EXECUCAO',
  'AGUARDANDO_ATESTO',
  'AGUARDANDO_LIQUIDACAO',
  'AGUARDANDO_PAGAMENTO',
  'PAGA',
  'CANCELADA',
  'COM_IRREGULARIDADE',
  'EXECUCAO_COM_PENDENCIA',
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OrderDetailModalProps {
  orderId: string | null
  onClose: () => void
  /**
   * Slot opcional para renderizar ações de workflow na parte inferior do modal.
   * Chamado quando a ordem está carregada.
   * US-005: ActionPanel do Gabinete é injetado aqui.
   */
  renderActions?: (
    orderId: string,
    status: StatusOrdem,
    onActionComplete: () => void,
  ) => React.ReactNode
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDatetime(iso: string): string {
  try {
    return format(parseISO(iso), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return iso
  }
}

function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return iso
  }
}

function formatBRL(value: string | number | null): string {
  if (value == null) return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------------------------------------------------------------------------
// Ícone de ação no histórico
// ---------------------------------------------------------------------------

const ACAO_ICON_MAP: Record<
  string,
  { Icon: React.ElementType; color: string }
> = {
  criar:                  { Icon: FileText,    color: 'text-blue-500' },
  autorizar:              { Icon: CheckCircle, color: 'text-green-500' },
  aprovar:                { Icon: CheckCircle, color: 'text-green-500' },
  empenhar:               { Icon: CheckCircle, color: 'text-green-500' },
  atestar:                { Icon: CheckCircle, color: 'text-green-500' },
  liquidar:               { Icon: CheckCircle, color: 'text-green-500' },
  pagar:                  { Icon: CheckCircle, color: 'text-green-500' },
  solicitar_alteracao:    { Icon: RotateCcw,   color: 'text-yellow-500' },
  reenviar:               { Icon: RotateCcw,   color: 'text-yellow-500' },
  solicitar_documentacao: { Icon: RotateCcw,   color: 'text-yellow-500' },
  enviar_documentacao:    { Icon: RotateCcw,   color: 'text-yellow-500' },
  recusar_atesto:         { Icon: AlertTriangle, color: 'text-orange-500' },
  irregularidade:         { Icon: AlertTriangle, color: 'text-red-500' },
  cancelar:               { Icon: XCircle,     color: 'text-red-500' },
}

function getAcaoIcon(acao: string) {
  return ACAO_ICON_MAP[acao] ?? { Icon: Clock, color: 'text-gray-400' }
}

// ---------------------------------------------------------------------------
// Sub-componentes de detalhe
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 gap-4">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-words">{value ?? '—'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton de loading
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-3 p-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline entry
// ---------------------------------------------------------------------------

function HistoricoEntry({ entry }: { entry: OrdemHistorico }) {
  const { Icon, color } = getAcaoIcon(entry.acao)
  // US-012: observação expansível — clique para mostrar/ocultar
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex gap-3">
      {/* Ícone */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full bg-muted flex-shrink-0',
            color,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {/* Linha conectora (visível exceto no último item) */}
        <div className="w-px flex-1 bg-border mt-1 min-h-[12px]" />
      </div>

      {/* Conteúdo */}
      <div className="pb-4 flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold capitalize">{entry.acao.replace(/_/g, ' ')}</span>
          {' '}
          <span className="text-muted-foreground">
            por {entry.usuario_nome}{' '}
            <span className="text-xs">({entry.perfil})</span>
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDatetime(entry.created_at)}
        </p>

        {/* Observação com expand/collapse — US-012 */}
        {entry.observacao && (
          <>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform duration-150', expanded && 'rotate-180')}
                aria-hidden="true"
              />
              {expanded ? 'Ocultar observação' : 'Ver observação'}
            </button>
            {expanded && (
              <blockquote className="mt-1.5 border-l-2 border-muted-foreground/30 pl-3 text-sm text-muted-foreground italic">
                {entry.observacao}
              </blockquote>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componente: Tab de Documentos (US-015)
// ---------------------------------------------------------------------------

interface DocumentosTabContentProps {
  orderId: string | null
  ordemStatus: StatusOrdem | null
  assinaturaGovbr: boolean
}

function DocumentosTabContent({ orderId, ordemStatus, assinaturaGovbr }: DocumentosTabContentProps) {
  const user = useAuthStore((s) => s.user)
  const canUpload =
    (user?.role === 'secretaria' || user?.role === 'admin') &&
    ordemStatus !== null &&
    !STATUSES_IMUTAVEIS.includes(ordemStatus)

  return (
    <TabsContent value="documentos" className="flex-1 overflow-y-auto mt-2 pr-1">
      {orderId ? (
        <div className="space-y-4">
          {/* US-016: indicador de assinatura digital via GovBR */}
          <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
            <CheckCircle
              className={assinaturaGovbr ? 'h-4 w-4 text-green-600' : 'h-4 w-4 text-muted-foreground'}
            />
            <span className={assinaturaGovbr ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
              {assinaturaGovbr
                ? 'Ordem assinada digitalmente via gov.br/assinatura'
                : 'Ordem não assinada via GovBR'}
            </span>
          </div>

          {canUpload && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Anexar novo documento
              </p>
              <DocumentUploader ordemId={orderId} disabled={false} />
              <Separator />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Documentos anexados
            </p>
            <DocumentList
              ordemId={orderId}
              currentUserId={user?.id}
              currentUserRole={user?.role}
              readOnly={!canUpload}
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          Selecione uma ordem para ver os documentos.
        </p>
      )}
    </TabsContent>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function OrderDetailModal({ orderId, onClose, renderActions }: OrderDetailModalProps) {
  const { data: ordem, isLoading, isError, refetch } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-start justify-between gap-4 pr-0">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-mono">
              {isLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : (
                ordem?.protocolo ?? '—'
              )}
            </DialogTitle>
            {!isLoading && ordem && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <StatusBadge status={ordem.status} />
                <Badge
                  variant="outline"
                  className={[
                    PRIORIDADE_CONFIG[ordem.prioridade as Prioridade]?.bg ?? '',
                    PRIORIDADE_CONFIG[ordem.prioridade as Prioridade]?.text ?? '',
                    'border-0',
                  ].join(' ')}
                >
                  {PRIORIDADE_LABELS[ordem.prioridade as Prioridade] ?? ordem.prioridade}
                </Badge>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 flex-shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {isError && (
          <p className="text-sm text-destructive px-1">
            Erro ao carregar os dados da ordem. Tente novamente.
          </p>
        )}

        <Tabs defaultValue="detalhes" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="historico">
              Histórico{' '}
              {ordem?.historico?.length != null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({ordem.historico.length})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------
              Tab: Detalhes
          --------------------------------------------------------------- */}
          <TabsContent
            value="detalhes"
            className="flex-1 overflow-y-auto mt-2 pr-1"
          >
            {isLoading ? (
              <DetailSkeleton />
            ) : ordem ? (
              <div className="divide-y">
                <DetailRow label="Protocolo" value={<span className="font-mono">{ordem.protocolo}</span>} />
                <DetailRow label="Tipo" value={TIPO_ORDEM_LABELS[ordem.tipo as TipoOrdem] ?? ordem.tipo} />
                <DetailRow label="Secretaria" value={ordem.secretaria_nome} />
                <DetailRow label="Criado por" value={ordem.criador_nome} />
                {ordem.responsavel && (
                  <DetailRow label="Responsável" value={ordem.responsavel} />
                )}
                <DetailRow label="Criado em" value={formatDatetime(ordem.created_at)} />
                <DetailRow label="Versão" value={`v${ordem.versao}`} />
                <DetailRow label="Valor Estimado" value={formatBRL(ordem.valor_estimado)} />

                {ordem.descricao && (
                  <>
                    <div className="py-2">
                      <p className="text-sm text-muted-foreground mb-1">Descrição</p>
                      <p className="text-sm">{ordem.descricao}</p>
                    </div>
                  </>
                )}

                <div className="py-2">
                  <p className="text-sm text-muted-foreground mb-1">Justificativa</p>
                  <p className="text-sm whitespace-pre-wrap">{ordem.justificativa}</p>
                </div>

                {/* Campos financeiros — exibidos apenas quando preenchidos */}
                {(ordem.numero_empenho ||
                  ordem.numero_nf ||
                  ordem.valor_liquidado ||
                  ordem.valor_pago) && (
                  <>
                    <Separator className="my-3" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
                      Dados Financeiros
                    </p>
                    {ordem.numero_empenho && (
                      <DetailRow label="Nº Empenho" value={ordem.numero_empenho} />
                    )}
                    {ordem.valor_empenhado != null && (
                      <DetailRow label="Valor Empenhado" value={formatBRL(ordem.valor_empenhado)} />
                    )}
                    {ordem.data_empenho && (
                      <DetailRow label="Data Empenho" value={formatDate(ordem.data_empenho)} />
                    )}
                    {ordem.numero_nf && (
                      <DetailRow label="Nº Nota Fiscal" value={ordem.numero_nf} />
                    )}
                    {ordem.data_atesto && (
                      <DetailRow label="Data Atesto" value={formatDatetime(ordem.data_atesto)} />
                    )}
                    {ordem.valor_liquidado != null && (
                      <DetailRow label="Valor Liquidado" value={formatBRL(ordem.valor_liquidado)} />
                    )}
                    {ordem.data_liquidacao && (
                      <DetailRow label="Data Liquidação" value={formatDate(ordem.data_liquidacao)} />
                    )}
                    {ordem.valor_pago != null && (
                      <DetailRow label="Valor Pago" value={formatBRL(ordem.valor_pago)} />
                    )}
                    {ordem.data_pagamento && (
                      <DetailRow label="Data Pagamento" value={formatDate(ordem.data_pagamento)} />
                    )}
                    {ordem.forma_pagamento && (
                      <DetailRow
                        label="Forma Pagamento"
                        value={{
                          transferencia: 'Transferência',
                          cheque: 'Cheque',
                          pix: 'PIX',
                        }[ordem.forma_pagamento]}
                      />
                    )}
                  </>
                )}
              </div>
            ) : null}
          </TabsContent>

          {/* ---------------------------------------------------------------
              Tab: Histórico
          --------------------------------------------------------------- */}
          <TabsContent
            value="historico"
            className="flex-1 overflow-y-auto mt-2 pr-1"
          >
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : ordem?.historico?.length ? (
              <div>
                {ordem.historico.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={idx === ordem.historico.length - 1 ? '[&_.min-h-\\[12px\\]]:hidden' : ''}
                  >
                    <HistoricoEntry entry={entry} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum histórico disponível.
              </p>
            )}
          </TabsContent>

          {/* ---------------------------------------------------------------
              Tab: Documentos — US-015
          --------------------------------------------------------------- */}
          <DocumentosTabContent
            orderId={orderId}
            ordemStatus={ordem?.status ?? null}
            assinaturaGovbr={ordem?.assinatura_govbr ?? false}
          />
        </Tabs>

        {/* Slot de ações de workflow — injetado pela página pai (ex: ActionPanel do Gabinete) */}
        {renderActions && ordem && !isLoading && (
          <>
            <Separator className="mt-2" />
            <div className="pt-3">
              {renderActions(ordem.id, ordem.status, () => {
                refetch()
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
