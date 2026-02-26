/**
 * PagamentoModal — Dialog de registro de pagamento.
 *
 * US-010: Pagamento pela Tesouraria.
 *
 * Features:
 *   - Card resumo completo (protocolo, secretaria, valor empenhado, valor liquidado,
 *     Nº empenho, Nº NF)
 *   - Campo valor_pago (número > 0)
 *   - Alert amarelo quando valor_pago != valor_liquidado (US-010 RN-52)
 *   - Campo data_pagamento (date, não futura)
 *   - Select forma_pagamento (transferencia, cheque, pix)
 *   - Campo observação/justificativa (obrigatório se valor difere — US-010 RN-52)
 *   - PATCH { acao: 'pagar', valor_pago, data_pagamento, forma_pagamento, observacao? }
 *
 * US-010 RN-51: data, valor e forma de pagamento obrigatórios.
 * US-010 RN-52: valor divergente exige justificativa.
 * US-010 RN-53: após PAGA, ordem é somente-leitura (garantido pelo back-end).
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { getOrdem, executeAcao } from '@/services/ordensService'
import type { AcaoPayload } from '@/types/ordem'

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

interface PagamentoModalProps {
  orderId: string | null
  onClose: () => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

type FormaPagamento = 'transferencia' | 'cheque' | 'pix'

export function PagamentoModal({ orderId, onClose, onSuccess }: PagamentoModalProps) {
  const queryClient = useQueryClient()

  const { data: ordem } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  const [valorPago, setValorPago] = useState('')
  const [dataPagamento, setDataPagamento] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    if (orderId) {
      // Pré-preenche com valor_liquidado
      setValorPago(ordem?.valor_liquidado ? ordem.valor_liquidado.toFixed(2) : '')
      setDataPagamento(todayISODate())
      setFormaPagamento('')
      setObservacao('')
    }
  }, [orderId, ordem?.valor_liquidado])

  function handleClose() {
    setValorPago('')
    setDataPagamento('')
    setFormaPagamento('')
    setObservacao('')
    onClose()
  }

  const valorNum = parseFloat(valorPago.replace(',', '.')) || 0
  const valorLiquidado = ordem?.valor_liquidado ?? 0

  // Alerta de divergência — US-010 RN-52
  const hasDiff =
    valorLiquidado > 0 &&
    valorNum > 0 &&
    Math.abs(valorNum - valorLiquidado) > 0.009

  const obsRequired = hasDiff
  const isValid =
    valorNum > 0 &&
    dataPagamento.length > 0 &&
    formaPagamento !== '' &&
    (!obsRequired || observacao.trim().length > 0)

  const mutation = useMutation({
    mutationFn: () => {
      const payload: AcaoPayload = {
        acao: 'pagar',
        valor_pago: valorNum,
        data_pagamento: dataPagamento,
        forma_pagamento: formaPagamento as FormaPagamento,
      }
      if (observacao.trim()) payload.observacao = observacao.trim()
      return executeAcao(orderId!, payload)
    },
    onSuccess: () => {
      const formaLabel: Record<FormaPagamento, string> = {
        transferencia: 'Transferência',
        cheque: 'Cheque',
        pix: 'PIX',
      }
      toast.success('Pagamento registrado', {
        description: `${formatBRL(valorNum)} pago via ${formaLabel[formaPagamento as FormaPagamento] ?? formaPagamento}.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      const detail = error.response?.data?.detail
      toast.error('Erro ao registrar pagamento', {
        description: detail ?? 'Tente novamente.',
      })
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>
            Confirme os dados do pagamento. Após registrado, a ordem ficará
            com status <strong>Paga</strong> (somente-leitura).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card resumo completo */}
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
                  <span>{formatBRL(ordem.valor_empenhado)}</span>
                </div>
              )}
              {ordem.valor_liquidado != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Liquidado</span>
                  <span className="font-medium">{formatBRL(ordem.valor_liquidado)}</span>
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
            </div>
          )}

          {/* Valor pago */}
          <div className="space-y-1.5">
            <Label htmlFor="valor-pago">
              Valor Pago (R$) <span className="text-destructive">*</span>
            </Label>
            {valorLiquidado > 0 && (
              <p className="text-xs text-muted-foreground">
                Valor liquidado: {formatBRL(valorLiquidado)}
              </p>
            )}
            <Input
              id="valor-pago"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
              disabled={mutation.isPending}
              autoFocus
            />
          </div>

          {/* Alert de divergência — US-010 RN-52 */}
          {hasDiff && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O valor pago ({formatBRL(valorNum)}) difere do liquidado (
                {formatBRL(valorLiquidado)}). A justificativa abaixo é{' '}
                <strong>obrigatória</strong>.
              </AlertDescription>
            </Alert>
          )}

          {/* Data do pagamento — US-010 RN-51 */}
          <div className="space-y-1.5">
            <Label htmlFor="data-pagamento">
              Data do Pagamento <span className="text-destructive">*</span>
            </Label>
            <Input
              id="data-pagamento"
              type="date"
              max={todayISODate()}
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          {/* Forma de pagamento — US-010 RN-51 */}
          <div className="space-y-1.5">
            <Label>
              Forma de Pagamento <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formaPagamento}
              onValueChange={(v) => setFormaPagamento(v as FormaPagamento)}
              disabled={mutation.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a forma de pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observação / Justificativa — obrigatória se valor difere */}
          <div className="space-y-1.5">
            <Label htmlFor="obs-pagamento">
              Observação / Justificativa{' '}
              {obsRequired && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="obs-pagamento"
              placeholder={
                obsRequired
                  ? 'Justifique a divergência entre o valor pago e o liquidado...'
                  : 'Informações adicionais sobre o pagamento (opcional)...'
              }
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
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
