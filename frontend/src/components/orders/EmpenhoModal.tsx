/**
 * EmpenhoModal — Dialog de registro de empenho orçamentário.
 *
 * US-008: Registro de Empenho pela Contabilidade.
 * US-017: Upload obrigatório de documento de empenho.
 * BUG-001: campo valor com formatação BRL (type="text", sem problema com vírgula).
 *
 * Features:
 *   - Campo numero_empenho (texto obrigatório — US-008 RN-42)
 *   - Campo valor_empenhado (texto BRL formatado, pré-preenchido — BUG-001)
 *   - Upload obrigatório do documento de empenho — US-017
 *   - Alert de diferença quando valor empenhado ≠ estimado (US-008 RN-45)
 *   - Trata erro 409: numero_empenho duplicado (US-008 RN-42)
 *
 * Fluxo US-017:
 *   1. uploadDocumento(ordemId, { file, descricao: 'EMPENHO' })
 *   2. executeAcao(ordemId, { acao: 'empenhar', numero_empenho, valor_empenhado })
 */

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertTriangle, Loader2, Paperclip, X } from 'lucide-react'
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
import { uploadDocumento } from '@/services/documentosService'
import { formatBRL, parseBRL, formatCurrencyInput } from '@/utils/formatters'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
  const [arquivo, setArquivo] = useState<File | null>(null)  // US-017

  // BUG-001: pré-preenche com formatCurrencyInput (ex.: "15.000,00") em vez de .toFixed(2)
  useEffect(() => {
    if (orderId && valorEstimado > 0) {
      setValorEmpenhado(formatCurrencyInput(valorEstimado))
    }
  }, [orderId, valorEstimado])

  function handleClose() {
    setNumeroEmpenho('')
    setValorEmpenhado('')
    setArquivo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  // BUG-001: parseBRL converte "15.000,00" → 15000
  const valorEmpenhadoNum = parseBRL(valorEmpenhado)

  // Alerta quando valor empenhado difere do estimado (US-008 RN-45)
  const hasDiff =
    valorEstimado > 0 &&
    valorEmpenhadoNum > 0 &&
    Math.abs(valorEmpenhadoNum - valorEstimado) > 0.009

  // US-017: arquivo é obrigatório
  const isValid = numeroEmpenho.trim().length > 0 && valorEmpenhadoNum > 0 && arquivo !== null

  const mutation = useMutation({
    mutationFn: async () => {
      // US-017: passo 1 — upload do documento de empenho
      if (arquivo) {
        await uploadDocumento(orderId!, { file: arquivo, descricao: 'EMPENHO' })
      }
      // Passo 2 — registrar empenho
      return executeAcao(orderId!, {
        acao: 'empenhar',
        numero_empenho: numeroEmpenho.trim(),
        valor_empenhado: valorEmpenhadoNum,
      })
    },
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
            Informe o número do empenho, o valor empenhado e anexe o documento de empenho.
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

          {/* Valor empenhado — BUG-001: type="text" com formatação BRL */}
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
              type="text"
              inputMode="decimal"
              placeholder="0,00"
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

          {/* Upload do documento de empenho — US-017 */}
          <div className="space-y-1.5">
            <Label>
              Documento de Empenho <span className="text-destructive">*</span>
            </Label>
            <div
              className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              style={mutation.isPending ? { opacity: 0.5, pointerEvents: 'none' } : {}}
              onClick={() => !arquivo && fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className={arquivo ? 'text-foreground flex-1 truncate' : 'text-muted-foreground flex-1'}>
                {arquivo ? arquivo.name : 'Clique para selecionar (PDF, JPEG, PNG — máx 10 MB)'}
              </span>
              {arquivo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setArquivo(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  disabled={mutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remover arquivo"
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
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              disabled={mutation.isPending}
            />
            {!arquivo && (
              <p className="text-xs text-muted-foreground">
                Anexe o documento de empenho para continuar.
              </p>
            )}
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
            Confirmar Empenho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
