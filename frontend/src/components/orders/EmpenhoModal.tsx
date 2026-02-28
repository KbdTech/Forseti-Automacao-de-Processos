/**
 * EmpenhoModal — Dialog de registro de empenho orçamentário.
 *
 * US-008: Registro de Empenho pela Contabilidade.
 *
 * Features:
 *   - Busca valor_estimado via React Query (usa cache do OrderDetailModal)
 *   - campo numero_empenho (texto obrigatório — US-008 RN-42)
 *   - Campo valor_empenhado (número, pré-preenchido com valor_estimado)
 *   - Alert de diferença quando valor empenhado ≠ estimado (US-008 RN-45)
 *   - Trata erro 409: numero_empenho duplicado (US-008 RN-42)
 *
 * US-008 Cenário 1: empenho registrado com sucesso
 * US-008 Cenário 2: 409 → toast "Número de empenho duplicado"
 * US-008 Cenário 3: valor divergente → Alert antes de confirmar
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

function formatBRL(value: string | number | null | undefined): string {
  if (value == null) return '—'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmpenhoModalProps {
  /** orderId não-null abre o modal; null o fecha. */
  orderId: string | null
  onClose: () => void
  onSuccess: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function EmpenhoModal({ orderId, onClose, onSuccess }: EmpenhoModalProps) {
  const queryClient = useQueryClient()

  // Reutiliza cache do OrderDetailModal (mesma query key ['ordem', orderId])
  const { data: ordem } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  const valorEstimado = Number(ordem?.valor_estimado ?? 0)

  const [numeroEmpenho, setNumeroEmpenho] = useState('')
  const [valorEmpenhado, setValorEmpenhado] = useState('')

  // Pré-preenche valor empenhado com valor estimado ao abrir o modal
  useEffect(() => {
    if (orderId && valorEstimado > 0) {
      setValorEmpenhado(valorEstimado.toFixed(2))
    }
  }, [orderId, valorEstimado])

  function handleClose() {
    setNumeroEmpenho('')
    setValorEmpenhado('')
    onClose()
  }

  const valorEmpenhadoNum = parseFloat(valorEmpenhado.replace(',', '.')) || 0

  // Alerta quando valor empenhado difere do estimado (US-008 RN-45)
  const hasDiff =
    valorEstimado > 0 &&
    valorEmpenhadoNum > 0 &&
    Math.abs(valorEmpenhadoNum - valorEstimado) > 0.009

  const isValid = numeroEmpenho.trim().length > 0 && valorEmpenhadoNum > 0

  const mutation = useMutation({
    mutationFn: () =>
      executeAcao(orderId!, {
        acao: 'empenhar',
        numero_empenho: numeroEmpenho.trim(),
        valor_empenhado: valorEmpenhadoNum,
      }),
    onSuccess: () => {
      toast.success('Empenho registrado', {
        description: `Nº ${numeroEmpenho.trim()} vinculado com sucesso.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      const httpStatus = error.response?.status
      const detail = error.response?.data?.detail

      // US-008 RN-42: 409 = numero_empenho já vinculado a outra ordem
      if (httpStatus === 409) {
        toast.error('Número de empenho duplicado', {
          description: detail ?? 'Este número já está vinculado a outra ordem.',
        })
      } else {
        toast.error('Erro ao registrar empenho', {
          description: detail ?? 'Tente novamente.',
        })
      }
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Empenho</DialogTitle>
          <DialogDescription>
            Informe o número do empenho e o valor empenhado para esta ordem.
            A data do empenho será registrada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Número do empenho — US-008 RN-42 */}
          <div className="space-y-1.5">
            <Label htmlFor="numero-empenho">
              Número do Empenho <span className="text-destructive">*</span>
            </Label>
            <Input
              id="numero-empenho"
              placeholder="ex.: 2026NE001234"
              value={numeroEmpenho}
              onChange={(e) => setNumeroEmpenho(e.target.value)}
              disabled={mutation.isPending}
              autoFocus
            />
          </div>

          {/* Valor empenhado */}
          <div className="space-y-1.5">
            <Label htmlFor="valor-empenhado">
              Valor Empenhado (R$) <span className="text-destructive">*</span>
            </Label>
            {valorEstimado > 0 && (
              <p className="text-xs text-muted-foreground">
                Valor estimado: {formatBRL(valorEstimado)}
              </p>
            )}
            <Input
              id="valor-empenhado"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={valorEmpenhado}
              onChange={(e) => setValorEmpenhado(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          {/* Alert de diferença — US-008 RN-45: valor pode diferir do estimado */}
          {hasDiff && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O valor empenhado ({formatBRL(valorEmpenhadoNum)}) difere do valor estimado (
                {formatBRL(valorEstimado)}). Confirme se o valor está correto antes de prosseguir.
              </AlertDescription>
            </Alert>
          )}
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
            Confirmar Empenho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
