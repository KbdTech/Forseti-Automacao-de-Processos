/**
 * LiquidacaoModal — Dialog de liquidação de despesa.
 *
 * US-010: Liquidação pela Contabilidade.
 *
 * Features:
 *   - Card resumo (protocolo, valor empenhado, Nº empenho, Nº NF, data atesto)
 *   - Campo valor_liquidado (número > 0)
 *   - Campo data_liquidacao (date, não futura)
 *   - Campo observação (opcional)
 *   - PATCH { acao: 'liquidar', valor_liquidado, data_liquidacao, observacao? }
 *
 * US-010 RN-50: registrar data e valor liquidado.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { getOrdem, executeAcao } from '@/services/ordensService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

  const { data: ordem } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  const [valorLiquidado, setValorLiquidado] = useState('')
  const [dataLiquidacao, setDataLiquidacao] = useState('')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    if (orderId) {
      // Pré-preenche valor com valor_empenhado
      setValorLiquidado(ordem?.valor_empenhado ? ordem.valor_empenhado.toFixed(2) : '')
      setDataLiquidacao(todayISODate())
      setObservacao('')
    }
  }, [orderId, ordem?.valor_empenhado])

  function handleClose() {
    setValorLiquidado('')
    setDataLiquidacao('')
    setObservacao('')
    onClose()
  }

  const valorNum = parseFloat(valorLiquidado.replace(',', '.')) || 0
  const isValid = valorNum > 0 && dataLiquidacao.length > 0

  const mutation = useMutation({
    mutationFn: () =>
      executeAcao(orderId!, {
        acao: 'liquidar',
        valor_liquidado: valorNum,
        data_liquidacao: dataLiquidacao,
        observacao: observacao.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Liquidação registrada', {
        description: `Valor ${formatBRL(valorNum)} liquidado com sucesso.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      const detail = error.response?.data?.detail
      toast.error('Erro ao registrar liquidação', {
        description: detail ?? 'Tente novamente.',
      })
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
            <Input
              id="valor-liquidado"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
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

          {/* Observação (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="obs-liquidacao">Observação (opcional)</Label>
            <Textarea
              id="obs-liquidacao"
              placeholder="Informações adicionais sobre a liquidação..."
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={mutation.isPending}
            />
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
