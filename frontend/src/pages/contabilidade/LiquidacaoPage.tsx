/**
 * LiquidacaoPage — fila de liquidação de despesa — US-010.
 *
 * Features:
 *   - Tabela de ordens AGUARDANDO_LIQUIDACAO com WorkflowTable
 *   - Botão "Registrar Liquidação" no slot de ações do OrderDetailModal
 *   - LiquidacaoModal com valor_liquidado, data_liquidacao e observação opcional
 *
 * US-010 RN-50: contabilidade registra liquidação → AGUARDANDO_PAGAMENTO.
 */

import { useState } from 'react'
import { CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { LiquidacaoModal } from '@/components/orders/LiquidacaoModal'

// ---------------------------------------------------------------------------
// Painel de ações
// ---------------------------------------------------------------------------

function LiquidacaoActionPanel({
  orderId,
  onSuccess,
}: {
  orderId: string
  onSuccess: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Ações disponíveis
        </span>
        <Button size="sm" className="gap-1.5" onClick={() => setModalOpen(true)}>
          <CheckCircle className="h-3.5 w-3.5" />
          Registrar Liquidação
        </Button>
      </div>

      <LiquidacaoModal
        orderId={modalOpen ? orderId : null}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false)
          onSuccess()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function LiquidacaoPage() {
  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Liquidação de Despesa</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ordens atestadas aguardando registro de liquidação pela Contabilidade.
        </p>
      </div>

      <WorkflowTable
        statusFilter="AGUARDANDO_LIQUIDACAO"
        title="Ordens aguardando liquidação"
        emptyMessage="Nenhuma ordem aguardando liquidação no momento."
        renderActions={(orderId, _status, onActionComplete) => (
          <LiquidacaoActionPanel orderId={orderId} onSuccess={onActionComplete} />
        )}
      />
    </div>
  )
}
