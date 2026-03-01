/**
 * LiquidacaoModal — Dialog de liquidação de despesa.
 *
 * US-010: Liquidação pela Contabilidade.
 * US-019: upload obrigatório do documento de liquidação; após liquidar,
 *         ordem vai para AGUARDANDO_ASSINATURA_SECRETARIA (não mais direto para pagamento).
 *
 * Features:
 *   - Card resumo (protocolo, valor empenhado, Nº empenho, Nº NF, data atesto)
 *   - Campo valor_liquidado (número > 0)
 *   - Campo data_liquidacao (date, não futura)
 *   - Upload obrigatório do documento de liquidação (US-019)
 *   - PATCH { acao: 'liquidar', valor_liquidado, data_liquidacao }
 *
 * US-010 RN-50: registrar data e valor liquidado.
 * US-019: sem campo observação; documento enviado antes da ação.
 */

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, Paperclip, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { getOrdem, executeAcao } from '@/services/ordensService'
import { uploadDocumento } from '@/services/documentosService'
import { extractApiError, parseBRL, formatCurrencyInput } from '@/utils/formatters'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: string | number | null | undefined): string {
  if (value == null) return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateBR(isoStr: string | null | undefined): string {
  if (!isoStr) return '—'
  try {
    return format(parseISO(isoStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return isoStr
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LiquidacaoModalProps {
  orderId: string | null
  onClose: () => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function LiquidacaoModal({ orderId, onClose, onSuccess }: LiquidacaoModalProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: ordem } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  const [valorLiquidado, setValorLiquidado] = useState('')
  const [dataLiquidacao, setDataLiquidacao] = useState('')
  const [documento, setDocumento] = useState<File | null>(null) // US-019 — obrigatório

  useEffect(() => {
    if (orderId) {
      // BUG-001: pré-preenche com formatCurrencyInput (ex.: "15.000,00") em vez de .toFixed(2)
      setValorLiquidado(
        ordem?.valor_empenhado ? formatCurrencyInput(Number(ordem.valor_empenhado)) : '',
      )
      setDataLiquidacao(todayISODate())
      setDocumento(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [orderId, ordem?.valor_empenhado])

  function handleClose() {
    setValorLiquidado('')
    setDataLiquidacao('')
    setDocumento(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // BUG-001: parseBRL converte "15.000,00" → 15000
  const valorNum = parseBRL(valorLiquidado)
  // US-019: documento obrigatório
  const isValid = valorNum > 0 && dataLiquidacao.length > 0 && documento !== null

  const mutation = useMutation({
    mutationFn: async () => {
      // US-019 passo 1 — upload do documento de liquidação antes de registrar a ação
      if (documento) {
        await uploadDocumento(orderId!, { file: documento, descricao: 'LIQUIDACAO' })
      }
      // Passo 2 — registrar liquidação (sem observação — US-019)
      return executeAcao(orderId!, {
        acao: 'liquidar',
        valor_liquidado: valorNum,
        data_liquidacao: dataLiquidacao,
      })
    },
    onSuccess: () => {
      // US-019: status vai para AGUARDANDO_ASSINATURA_SECRETARIA
      toast.success('Liquidação registrada', {
        description: `Valor ${formatBRL(valorNum)} liquidado. Aguardando assinatura da secretaria.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: unknown }>) => {
      const msg = extractApiError(error.response?.data?.detail, 'Tente novamente.')
      toast.error('Erro ao registrar liquidação', { description: msg })
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Liquidação</DialogTitle>
          <DialogDescription>
            Informe o valor liquidado e a data da liquidação para esta ordem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card resumo */}
          {ordem && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocolo</span>
                <span className="font-mono font-medium">{ordem.protocolo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Secretaria</span>
                <span>{ordem.secretaria_nome}</span>
              </div>
              {ordem.valor_empenhado != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Empenhado</span>
                  <span className="font-medium">{formatBRL(ordem.valor_empenhado)}</span>
                </div>
              )}
              {ordem.numero_empenho && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nº Empenho</span>
                  <span className="font-mono">{ordem.numero_empenho}</span>
                </div>
              )}
              {ordem.numero_nf && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nº Nota Fiscal</span>
                  <span className="font-mono">{ordem.numero_nf}</span>
                </div>
              )}
              {ordem.data_atesto && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data do Atesto</span>
                  <span>{formatDateBR(ordem.data_atesto)}</span>
                </div>
              )}
            </div>
          )}

          {/* Valor liquidado */}
          <div className="space-y-1.5">
            <Label htmlFor="valor-liquidado">
              Valor Liquidado (R$) <span className="text-destructive">*</span>
            </Label>
            {/* BUG-001: type="text" evita problema de vírgula como decimal */}
            <Input
              id="valor-liquidado"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valorLiquidado}
              onChange={(e) => setValorLiquidado(e.target.value)}
              disabled={mutation.isPending}
              autoFocus
            />
          </div>

          {/* Data da liquidação — US-010 RN-50 */}
          <div className="space-y-1.5">
            <Label htmlFor="data-liquidacao">
              Data da Liquidação <span className="text-destructive">*</span>
            </Label>
            <Input
              id="data-liquidacao"
              type="date"
              max={todayISODate()}
              value={dataLiquidacao}
              onChange={(e) => setDataLiquidacao(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          {/* Documento de liquidação — US-019 (obrigatório) */}
          <div className="space-y-1.5">
            <Label>
              Documento de Liquidação <span className="text-destructive">*</span>
            </Label>
            <div
              className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              style={mutation.isPending ? { opacity: 0.5, pointerEvents: 'none' } : {}}
              onClick={() => !documento && fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className={documento ? 'text-foreground flex-1 truncate' : 'text-muted-foreground flex-1'}>
                {documento ? documento.name : 'Clique para selecionar (PDF, JPEG, PNG — máx 10 MB)'}
              </span>
              {documento && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDocumento(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  disabled={mutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remover documento"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setDocumento(e.target.files?.[0] ?? null)}
              disabled={mutation.isPending}
            />
            {!documento && (
              <p className="text-xs text-muted-foreground">
                Anexe o documento de liquidação para continuar.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="gap-1.5"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Confirmar Liquidação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
