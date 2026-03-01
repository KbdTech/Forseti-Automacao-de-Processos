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

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertTriangle, Loader2, Paperclip, X } from 'lucide-react'
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
import { uploadDocumento } from '@/services/documentosService'
import type { AcaoPayload } from '@/types/ordem'
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
  const fileInputRef = useRef<HTMLInputElement>(null)  // US-020

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
  const [comprovante, setComprovante] = useState<File | null>(null)  // US-020

  useEffect(() => {
    if (orderId) {
      // BUG-001: formatCurrencyInput em vez de .toFixed(2)
      setValorPago(
        ordem?.valor_liquidado ? formatCurrencyInput(Number(ordem.valor_liquidado)) : '',
      )
      setDataPagamento(todayISODate())
      setFormaPagamento('')
      setObservacao('')
      setComprovante(null)
    }
  }, [orderId, ordem?.valor_liquidado])

  function handleClose() {
    setValorPago('')
    setDataPagamento('')
    setFormaPagamento('')
    setObservacao('')
    setComprovante(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // BUG-001: parseBRL converte "15.000,00" → 15000
  const valorNum = parseBRL(valorPago)
  const valorLiquidado = Number(ordem?.valor_liquidado ?? 0)

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
    mutationFn: async () => {
      // US-020: upload do comprovante antes de registrar pagamento (se informado)
      if (comprovante) {
        await uploadDocumento(orderId!, { file: comprovante, descricao: 'COMPROVANTE_PAGAMENTO' })
      }
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
    onError: (error: AxiosError<{ detail: unknown }>) => {
      const msg = extractApiError(error.response?.data?.detail, 'Tente novamente.')
      toast.error('Erro ao registrar pagamento', { description: msg })
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        {mutation.isPending && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Processando...</p>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>
            Confirme os dados do pagamento. Após registrado, a ordem ficará
            com status <strong>Paga</strong> (somente-leitura).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
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
            {/* BUG-001: type="text" evita problema de vírgula como decimal */}
            <Input
              id="valor-pago"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
              disabled={mutation.isPending}
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

          {/* Comprovante de pagamento — US-020 (opcional, recomendado) */}
          <div className="space-y-1.5">
            <Label>Comprovante de Pagamento</Label>
            <div
              className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              style={mutation.isPending ? { opacity: 0.5, pointerEvents: 'none' } : {}}
              onClick={() => !comprovante && fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className={comprovante ? 'text-foreground flex-1 truncate' : 'text-muted-foreground flex-1'}>
                {comprovante
                  ? comprovante.name
                  : 'Clique para selecionar (PDF, JPEG, PNG — máx 10 MB)'}
              </span>
              {comprovante && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setComprovante(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  disabled={mutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remover comprovante"
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
              onChange={(e) => setComprovante(e.target.files?.[0] ?? null)}
              disabled={mutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Opcional — recomendado para fins de auditoria.
            </p>
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
