/**
 * AtesteModal — Dialog de atesto de nota fiscal.
 *
 * US-009: Atesto de Nota Fiscal pela Secretaria.
 *
 * Features:
 *   - Card resumo da ordem (protocolo, valor empenhado, Nº empenho)
 *   - Campo numero_nf (texto obrigatório — US-009 RN-49)
 *   - Checkbox de confirmação obrigatório antes de confirmar
 *   - Data e hora do atesto registradas automaticamente no back-end (US-009 RN-48)
 *
 * US-009 Cenário 1: atesto registrado → AGUARDANDO_LIQUIDACAO
 * US-009 RN-46: somente secretaria responsável pode atestar (validação no back-end)
 * US-009 RN-48: data_atesto registrada automaticamente
 * US-009 RN-49: numero_nf obrigatório
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2 } from 'lucide-react'
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AtesteModalProps {
  /** orderId não-null abre o modal; null o fecha. */
  orderId: string | null
  onClose: () => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function AtesteModal({ orderId, onClose, onSuccess }: AtesteModalProps) {
  const queryClient = useQueryClient()

  // Reutiliza cache do OrderDetailModal (mesma query key ['ordem', orderId])
  const { data: ordem } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  const [numeroNf, setNumeroNf] = useState('')
  const [confirmado, setConfirmado] = useState(false)

  // Limpa estado ao fechar
  function handleClose() {
    setNumeroNf('')
    setConfirmado(false)
    onClose()
  }

  // Resetar ao abrir com novo orderId
  useEffect(() => {
    if (orderId) {
      setNumeroNf('')
      setConfirmado(false)
    }
  }, [orderId])

  const isValid = numeroNf.trim().length > 0 && confirmado

  const mutation = useMutation({
    mutationFn: () =>
      executeAcao(orderId!, {
        acao: 'atestar',
        numero_nf: numeroNf.trim(),
      }),
    onSuccess: () => {
      toast.success('Atesto registrado', {
        description: `NF ${numeroNf.trim()} atestada com sucesso. Status: Aguardando Liquidação.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      const detail = error.response?.data?.detail
      toast.error('Erro ao registrar atesto', {
        description: detail ?? 'Tente novamente.',
      })
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atestar Nota Fiscal</DialogTitle>
          <DialogDescription>
            Confirme a execução do serviço/entrega e informe o número da nota fiscal.
            A data do atesto será registrada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card resumo da ordem */}
          {ordem && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocolo</span>
                <span className="font-mono font-medium">{ordem.protocolo}</span>
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
            </div>
          )}

          {/* Número da nota fiscal — US-009 RN-49 */}
          <div className="space-y-1.5">
            <Label htmlFor="numero-nf">
              Número da Nota Fiscal <span className="text-destructive">*</span>
            </Label>
            <Input
              id="numero-nf"
              placeholder="ex.: NF-2026-0001"
              value={numeroNf}
              onChange={(e) => setNumeroNf(e.target.value)}
              disabled={mutation.isPending}
              autoFocus
            />
          </div>

          {/* Checkbox de confirmação — input nativo acessível */}
          <div className="flex items-start gap-3 rounded-md border p-3">
            <input
              id="confirmacao"
              type="checkbox"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
              disabled={mutation.isPending}
              className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
            />
            <Label
              htmlFor="confirmacao"
              className="text-sm leading-snug cursor-pointer font-normal"
            >
              Confirmo que o serviço foi executado / material foi entregue conforme
              contratado e que a nota fiscal está em conformidade.
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
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
            Confirmar Atesto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
