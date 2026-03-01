/**
 * RecusaModal — Dialog de recusa de atesto de nota fiscal.
 *
 * US-009: Recusa de Atesto pela Secretaria.
 *
 * Features:
 *   - Alert destrutivo com aviso de consequências
 *   - Textarea de observação (mínimo 30 chars — US-009 RN-47)
 *   - Contador de caracteres em tempo real
 *   - PATCH acao='recusar_atesto' com observacao
 *
 * US-009 Cenário 2: recusa de atesto → EXECUCAO_COM_PENDENCIA
 * US-009 RN-47: descrição de não conformidade obrigatória (mín. 30 chars)
 */

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { executeAcao } from '@/services/ordensService'
import { extractApiError } from '@/utils/formatters'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MIN_CHARS = 30 // US-009 RN-47

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RecusaModalProps {
  /** orderId não-null abre o modal; null o fecha. */
  orderId: string | null
  onClose: () => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function RecusaModal({ orderId, onClose, onSuccess }: RecusaModalProps) {
  const queryClient = useQueryClient()

  const [observacao, setObservacao] = useState('')

  function handleClose() {
    setObservacao('')
    onClose()
  }

  // Resetar ao abrir com novo orderId
  useEffect(() => {
    if (orderId) {
      setObservacao('')
    }
  }, [orderId])

  const charCount = observacao.trim().length
  const isValid = charCount >= MIN_CHARS

  const mutation = useMutation({
    mutationFn: () =>
      executeAcao(orderId!, {
        acao: 'recusar_atesto',
        observacao: observacao.trim(),
      }),
    onSuccess: () => {
      toast.warning('Atesto recusado', {
        description: 'Ordem marcada como "Execução com Pendência". A secretaria deve corrigir a não conformidade.',
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: unknown }>) => {
      const msg = extractApiError(error.response?.data?.detail, 'Tente novamente.')
      toast.error('Erro ao recusar atesto', { description: msg })
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        {mutation.isPending && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Processando...</p>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Recusar Atesto</DialogTitle>
          <DialogDescription>
            Descreva a não conformidade encontrada. A ordem será marcada como
            &quot;Execução com Pendência&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Alerta destrutivo */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Ao recusar, a ordem será marcada como{' '}
              <strong>Execução com Pendência</strong> e ficará suspensa até
              resolução.
            </AlertDescription>
          </Alert>

          {/* Observação — US-009 RN-47 */}
          <div className="space-y-1.5">
            <Label htmlFor="observacao-recusa">
              Descrição da não conformidade{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="observacao-recusa"
              placeholder="Descreva detalhadamente a não conformidade encontrada..."
              rows={4}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={mutation.isPending}
            />
            <p
              className={`text-xs text-right ${
                isValid ? 'text-muted-foreground' : 'text-destructive'
              }`}
            >
              {charCount}/{MIN_CHARS} caracteres mínimos
            </p>
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
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="gap-1.5"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Confirmar Recusa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
