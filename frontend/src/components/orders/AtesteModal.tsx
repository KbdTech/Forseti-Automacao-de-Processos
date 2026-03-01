/**
 * AtesteModal — Dialog de atesto de nota fiscal.
 *
 * US-009: Atesto de Nota Fiscal pela Secretaria.
 * US-018: Melhorias no atesto — NF obrigatória + docs extras + obs + DLD.
 *
 * Campos:
 *   - numero_nf (obrigatório — US-009 RN-49)
 *   - arquivo_nf (obrigatório — US-018)
 *   - documentos_extras (opcional, múltiplos — US-018)
 *   - observacao (opcional — US-018)
 *   - confirmado: "serviço foi executado" (obrigatório — existente)
 *   - dld_assinada: "A DLD foi assinada?" (obrigatório, exibido como Alert — US-018)
 *
 * Fluxo US-018:
 *   1. uploadDocumento(ordemId, { file: arquivo_nf, descricao: 'NOTA_FISCAL' })
 *   2. Para cada extra: uploadDocumento(ordemId, { file, descricao: 'DOCUMENTO_ATESTO' })
 *   3. executeAcao(ordemId, { acao: 'atestar', numero_nf, observacao? })
 *
 * US-009 RN-46: somente secretaria responsável pode atestar (validação no back-end).
 * US-009 RN-48: data_atesto registrada automaticamente.
 */

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Loader2, Paperclip, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

import { getOrdem, executeAcao } from '@/services/ordensService'
import { uploadDocumento } from '@/services/documentosService'
import { extractApiError, formatBRL } from '@/utils/formatters'

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
  const arquivoNfRef = useRef<HTMLInputElement>(null)
  const extrasRef = useRef<HTMLInputElement>(null)

  // Reutiliza cache do OrderDetailModal (mesma query key ['ordem', orderId])
  const { data: ordem } = useQuery({
    queryKey: ['ordem', orderId],
    queryFn: () => getOrdem(orderId!),
    enabled: orderId !== null,
    staleTime: 1000 * 30,
  })

  const [numeroNf, setNumeroNf] = useState('')
  const [arquivoNf, setArquivoNf] = useState<File | null>(null)          // US-018 — obrigatório
  const [documentosExtras, setDocumentosExtras] = useState<File[]>([])   // US-018 — opcional
  const [observacao, setObservacao] = useState('')                         // US-018 — opcional
  const [confirmado, setConfirmado] = useState(false)                      // existente
  const [dldAssinada, setDldAssinada] = useState(false)                    // US-018 — obrigatório

  // Limpa estado ao fechar
  function handleClose() {
    setNumeroNf('')
    setArquivoNf(null)
    setDocumentosExtras([])
    setObservacao('')
    setConfirmado(false)
    setDldAssinada(false)
    if (arquivoNfRef.current) arquivoNfRef.current.value = ''
    if (extrasRef.current) extrasRef.current.value = ''
    onClose()
  }

  // Resetar ao abrir com novo orderId
  useEffect(() => {
    if (orderId) {
      setNumeroNf('')
      setArquivoNf(null)
      setDocumentosExtras([])
      setObservacao('')
      setConfirmado(false)
      setDldAssinada(false)
    }
  }, [orderId])

  function removerExtra(index: number) {
    setDocumentosExtras((prev) => prev.filter((_, i) => i !== index))
  }

  function handleExtrasChange(e: React.ChangeEvent<HTMLInputElement>) {
    const novos = Array.from(e.target.files ?? [])
    if (novos.length > 0) {
      setDocumentosExtras((prev) => [...prev, ...novos])
    }
    // Limpa input para permitir re-seleção do mesmo arquivo
    if (extrasRef.current) extrasRef.current.value = ''
  }

  // US-018: botão habilitado somente quando todos os obrigatórios preenchidos
  const isValid =
    numeroNf.trim().length > 0 &&
    arquivoNf !== null &&
    confirmado &&
    dldAssinada

  const mutation = useMutation({
    mutationFn: async () => {
      // US-018 passo 1 — upload da nota fiscal
      if (arquivoNf) {
        await uploadDocumento(orderId!, { file: arquivoNf, descricao: 'NOTA_FISCAL' })
      }
      // US-018 passo 2 — upload de documentos extras
      for (const extra of documentosExtras) {
        await uploadDocumento(orderId!, { file: extra, descricao: 'DOCUMENTO_ATESTO' })
      }
      // Passo 3 — registrar atesto
      return executeAcao(orderId!, {
        acao: 'atestar',
        numero_nf: numeroNf.trim(),
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      })
    },
    onSuccess: () => {
      toast.success('Atesto registrado', {
        description: `NF ${numeroNf.trim()} atestada com sucesso. Status: Aguardando Liquidação.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      onSuccess()
      handleClose()
    },
    onError: (error: AxiosError<{ detail: unknown }>) => {
      const msg = extractApiError(error.response?.data?.detail, 'Tente novamente.')
      toast.error('Erro ao registrar atesto', { description: msg })
    },
  })

  return (
    <Dialog open={orderId !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atestar Nota Fiscal</DialogTitle>
          <DialogDescription>
            Confirme a execução do serviço/entrega, anexe a nota fiscal e a DLD assinada.
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
                  <span className="font-medium">{formatBRL(Number(ordem.valor_empenhado))}</span>
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

          {/* Upload da nota fiscal — US-018 (obrigatório) */}
          <div className="space-y-1.5">
            <Label>
              Arquivo da Nota Fiscal <span className="text-destructive">*</span>
            </Label>
            <div
              className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
              style={mutation.isPending ? { opacity: 0.5, pointerEvents: 'none' } : {}}
              onClick={() => !arquivoNf && arquivoNfRef.current?.click()}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className={arquivoNf ? 'text-foreground flex-1 truncate' : 'text-muted-foreground flex-1'}>
                {arquivoNf ? arquivoNf.name : 'Clique para selecionar (PDF, JPEG, PNG — máx 10 MB)'}
              </span>
              {arquivoNf && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setArquivoNf(null)
                    if (arquivoNfRef.current) arquivoNfRef.current.value = ''
                  }}
                  disabled={mutation.isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remover arquivo da NF"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <input
              ref={arquivoNfRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setArquivoNf(e.target.files?.[0] ?? null)}
              disabled={mutation.isPending}
            />
            {!arquivoNf && (
              <p className="text-xs text-muted-foreground">
                Anexe o arquivo da Nota Fiscal para continuar.
              </p>
            )}
          </div>

          {/* Documentos extras — US-018 (opcional, múltiplos) */}
          <div className="space-y-1.5">
            <Label>Documentos Extras (opcional)</Label>
            {documentosExtras.length > 0 && (
              <ul className="space-y-1">
                {documentosExtras.map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removerExtra(i)}
                      disabled={mutation.isPending}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remover ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => extrasRef.current?.click()}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Adicionar documento extra
            </button>
            <input
              ref={extrasRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={handleExtrasChange}
              disabled={mutation.isPending}
            />
          </div>

          {/* Observação — US-018 (opcional) */}
          <div className="space-y-1.5">
            <Label htmlFor="obs-atesto">Observação (opcional)</Label>
            <Textarea
              id="obs-atesto"
              placeholder="Informações adicionais sobre o atesto..."
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>

          {/* Checkbox "serviço executado" */}
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

          {/* DLD — US-018: exibido como Alert com checkbox obrigatório */}
          <Alert variant={dldAssinada ? 'default' : 'destructive'} className="p-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="text-sm mb-2">
                Confirme que a <strong>Declaração de Liquidação e Despesa (DLD)</strong> foi
                assinada antes de prosseguir.
              </p>
              <div className="flex items-start gap-3">
                <input
                  id="dld-assinada"
                  type="checkbox"
                  checked={dldAssinada}
                  onChange={(e) => setDldAssinada(e.target.checked)}
                  disabled={mutation.isPending}
                  className="mt-0.5 h-4 w-4 accent-primary cursor-pointer"
                />
                <Label
                  htmlFor="dld-assinada"
                  className="text-sm leading-snug cursor-pointer font-normal"
                >
                  A DLD foi assinada?
                </Label>
              </div>
            </AlertDescription>
          </Alert>
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
