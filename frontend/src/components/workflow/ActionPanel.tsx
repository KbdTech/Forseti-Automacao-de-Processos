/**
 * ActionPanel — painel genérico de ações de workflow.
 *
 * Renderiza os botões disponíveis para (status atual × perfil do usuário)
 * e abre ConfirmationDialog específico para cada ação.
 *
 * US-005: ações do Gabinete (autorizar, solicitar_alteracao, cancelar).
 * US-006/007/008/009/010: demais perfis serão adicionados ao ACTION_MAP.
 *
 * Regras de negócio:
 *   US-005 RN-27: observação obrigatória ≥ 20 chars em solicitar_alteracao.
 *   US-005 RN-28: motivo obrigatório ≥ 20 chars em cancelar.
 *   US-005 RN-29: cancelamento é irreversível.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, RotateCcw, XCircle, Loader2, AlertTriangle, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { executeAcao } from '@/services/ordensService'
import type { StatusOrdem } from '@/types/ordem'
import type { RoleEnum } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary'

interface ActionConfig {
  acao: string
  label: string
  variant: ButtonVariant
  Icon: React.ElementType
  dialogTitle: string
  dialogDescription: string
  /** Se não null, campo observação é obrigatório com esse mínimo de chars. */
  observacaoLabel: string | null
  observacaoMinChars: number
  /** Exibe alerta vermelho de ação irreversível no dialog. */
  irreversivel?: boolean
  /** Alerta vermelho customizado exibido no Dialog (ex.: "ordem ficará suspensa"). */
  customAlertMessage?: string
  /** Observação enviada quando o usuário não digita nada no textarea. */
  defaultObservacao?: string
  confirmLabel: string
  confirmVariant: ButtonVariant
}

// ---------------------------------------------------------------------------
// Mapeamento (status, role) → ações disponíveis
// ---------------------------------------------------------------------------

const ACTION_MAP: Partial<
  Record<StatusOrdem, Partial<Record<RoleEnum, ActionConfig[]>>>
> = {
  // -------------------------------------------------------------------------
  // Gabinete — US-005
  // -------------------------------------------------------------------------
  AGUARDANDO_GABINETE: {
    gabinete: [
      {
        acao: 'autorizar',
        label: 'Autorizar',
        variant: 'default',
        Icon: CheckCircle,
        dialogTitle: 'Autorizar Ordem',
        dialogDescription:
          'Confirma a autorização desta ordem para análise da Controladoria?',
        observacaoLabel: 'Observação (opcional)',
        observacaoMinChars: 0,
        confirmLabel: 'Confirmar Autorização',
        confirmVariant: 'default',
      },
      {
        acao: 'solicitar_alteracao',
        label: 'Solicitar Alterações',
        variant: 'outline',
        Icon: RotateCcw,
        dialogTitle: 'Solicitar Alterações',
        dialogDescription: 'Descreva as alterações necessárias para devolução à secretaria.',
        observacaoLabel: 'Descreva as alterações necessárias',
        observacaoMinChars: 20, // US-005 RN-27
        confirmLabel: 'Solicitar Alterações',
        confirmVariant: 'outline',
      },
      {
        acao: 'cancelar',
        label: 'Cancelar Ordem',
        variant: 'destructive',
        Icon: XCircle,
        dialogTitle: 'Cancelar Ordem',
        dialogDescription: 'Informe o motivo do cancelamento.',
        observacaoLabel: 'Motivo do cancelamento',
        observacaoMinChars: 20, // US-005 RN-28
        irreversivel: true, // US-005 RN-29
        confirmLabel: 'Confirmar Cancelamento',
        confirmVariant: 'destructive',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // Secretaria — reenvio (US-006)
  // -------------------------------------------------------------------------
  DEVOLVIDA_PARA_ALTERACAO: {
    secretaria: [
      {
        acao: 'reenviar',
        label: 'Reenviar ao Gabinete',
        variant: 'default',
        Icon: RotateCcw,
        dialogTitle: 'Reenviar Ordem',
        dialogDescription:
          'Confirma o reenvio desta ordem ao Gabinete após as alterações solicitadas?',
        observacaoLabel: 'Observação (opcional)',
        observacaoMinChars: 0,
        confirmLabel: 'Confirmar Reenvio',
        confirmVariant: 'default',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // Secretaria — envio de documentação (US-007)
  // -------------------------------------------------------------------------
  AGUARDANDO_DOCUMENTACAO: {
    secretaria: [
      {
        acao: 'enviar_documentacao',
        label: 'Enviar Documentação',
        variant: 'default',
        Icon: Upload,
        dialogTitle: 'Confirmar Envio de Documentação',
        dialogDescription:
          'Confirma o envio dos documentos solicitados pela Controladoria? Após confirmar, a ordem retornará para análise.',
        observacaoLabel: 'Descreva os documentos enviados (opcional)',
        observacaoMinChars: 0,
        defaultObservacao: 'Documentação enviada',
        confirmLabel: 'Confirmar Envio',
        confirmVariant: 'default',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // Controladoria — US-007
  // -------------------------------------------------------------------------
  AGUARDANDO_CONTROLADORIA: {
    controladoria: [
      {
        acao: 'aprovar',
        label: 'Aprovar',
        variant: 'default',
        Icon: CheckCircle,
        dialogTitle: 'Aprovar Conformidade',
        dialogDescription:
          'Confirma a aprovação desta ordem para empenho pela Contabilidade?',
        observacaoLabel: 'Observação (opcional)',
        observacaoMinChars: 0,
        confirmLabel: 'Aprovar Conformidade',
        confirmVariant: 'default',
      },
      {
        acao: 'solicitar_documentacao',
        label: 'Solicitar Documentos',
        variant: 'outline',
        Icon: RotateCcw,
        dialogTitle: 'Solicitar Documentação',
        dialogDescription: 'Descreva os documentos que precisam ser enviados pela secretaria.',
        observacaoLabel: 'Descreva os documentos necessários',
        observacaoMinChars: 20,
        confirmLabel: 'Solicitar Documentos',
        confirmVariant: 'outline',
      },
      {
        acao: 'irregularidade',
        label: 'Apontar Irregularidade',
        variant: 'destructive',
        Icon: AlertTriangle,
        dialogTitle: 'Registrar Irregularidade',
        dialogDescription: 'Descreva a irregularidade fiscal/legal identificada.',
        observacaoLabel: 'Descreva a irregularidade identificada',
        observacaoMinChars: 50, // US-007 RN-38
        customAlertMessage: 'Atenção: esta ordem ficará suspensa até resolução.',
        confirmLabel: 'Registrar Irregularidade',
        confirmVariant: 'destructive',
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ActionPanelProps {
  orderId: string
  currentStatus: StatusOrdem
  userRole: RoleEnum
  onActionComplete: () => void
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ActionPanel({
  orderId,
  currentStatus,
  userRole,
  onActionComplete,
}: ActionPanelProps) {
  const queryClient = useQueryClient()
  const [activeAction, setActiveAction] = useState<ActionConfig | null>(null)
  const [observacao, setObservacao] = useState('')

  // Ações disponíveis para (status, role)
  const availableActions = ACTION_MAP[currentStatus]?.[userRole] ?? []

  const mutation = useMutation({
    mutationFn: () =>
      executeAcao(orderId, {
        acao: activeAction!.acao,
        observacao: observacao.trim() || activeAction!.defaultObservacao || undefined,
      }),
    onSuccess: () => {
      toast.success('Ação realizada com sucesso', {
        description: `${activeAction?.dialogTitle} concluída.`,
      })
      queryClient.invalidateQueries({ queryKey: ['ordens'] })
      queryClient.invalidateQueries({ queryKey: ['ordem', orderId] })
      setActiveAction(null)
      setObservacao('')
      onActionComplete()
    },
    onError: (error: AxiosError<{ detail: string }>) => {
      const msg = error.response?.data?.detail ?? 'Erro ao executar ação. Tente novamente.'
      toast.error('Erro na ação', { description: msg })
    },
  })

  if (availableActions.length === 0) return null

  const isObservacaoValid =
    activeAction !== null &&
    (activeAction.observacaoMinChars === 0 ||
      observacao.trim().length >= activeAction.observacaoMinChars)

  function handleOpen(action: ActionConfig) {
    setObservacao('')
    setActiveAction(action)
  }

  function handleClose() {
    setActiveAction(null)
    setObservacao('')
  }

  return (
    <>
      {/* Botões de ação */}
      <div className="flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Ações disponíveis
        </span>
        {availableActions.map((action) => (
          <Button
            key={action.acao}
            variant={action.variant}
            size="sm"
            onClick={() => handleOpen(action)}
            className="gap-1.5"
          >
            <action.Icon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        ))}
      </div>

      {/* ConfirmationDialog dinâmico */}
      {activeAction && (
        <Dialog open={true} onOpenChange={(open) => !open && handleClose()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{activeAction.dialogTitle}</DialogTitle>
              <DialogDescription>{activeAction.dialogDescription}</DialogDescription>
            </DialogHeader>

            {/* Alerta customizado (ex.: "ordem ficará suspensa") — US-007 */}
            {activeAction.customAlertMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{activeAction.customAlertMessage}</AlertDescription>
              </Alert>
            )}

            {/* Alerta de ação irreversível — US-005 RN-29 */}
            {activeAction.irreversivel && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Esta ação é irreversível. Somente o Administrador poderá reverter.
                </AlertDescription>
              </Alert>
            )}

            {/* Campo de observação */}
            {activeAction.observacaoLabel && (
              <div className="space-y-1.5">
                <Label htmlFor="observacao-action">
                  {activeAction.observacaoLabel}
                  {activeAction.observacaoMinChars > 0 && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                <Textarea
                  id="observacao-action"
                  placeholder={
                    activeAction.observacaoMinChars > 0
                      ? `Mínimo de ${activeAction.observacaoMinChars} caracteres.`
                      : 'Observação opcional.'
                  }
                  rows={4}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  aria-invalid={
                    activeAction.observacaoMinChars > 0 &&
                    observacao.length > 0 &&
                    observacao.length < activeAction.observacaoMinChars
                  }
                  className={
                    activeAction.observacaoMinChars > 0 &&
                    observacao.length > 0 &&
                    observacao.length < activeAction.observacaoMinChars
                      ? 'border-destructive'
                      : ''
                  }
                />
                {activeAction.observacaoMinChars > 0 && (
                  <p
                    className={[
                      'text-xs',
                      observacao.length >= activeAction.observacaoMinChars
                        ? 'text-muted-foreground'
                        : 'text-destructive',
                    ].join(' ')}
                  >
                    {observacao.length}/{activeAction.observacaoMinChars} caracteres mínimos
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={mutation.isPending}
              >
                {activeAction.variant === 'destructive' ? 'Voltar' : 'Cancelar'}
              </Button>
              <Button
                variant={activeAction.confirmVariant}
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !isObservacaoValid}
                className="gap-1.5"
              >
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {activeAction.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
