/**
 * EmpenhoPage — fila de empenho orçamentário — US-008.
 *
 * Features:
 *   - Tabela de ordens AGUARDANDO_EMPENHO com WorkflowTable
 *   - Botão "Registrar Empenho" no slot de ações do OrderDetailModal
 *   - EmpenhoModal com campos numero_empenho e valor_empenhado
 *   - Destaque visual (borda esquerda vermelha) para ordens URGENTE
 *
 * US-008 Cenário 1: contabilidade registra empenho → status AGUARDANDO_EXECUCAO
 * US-008 Cenário 2: numero_empenho duplicado → alerta 409
 * US-008 Cenário 3: valor empenhado ≠ estimado → alerta de confirmação
 *
 * US-008 RN-42: numero_empenho único no sistema.
 * US-008 RN-43: data_empenho registrada automaticamente pelo back-end.
 * US-008 RN-45: valor empenhado pode diferir do estimado — registrado na ordem.
 */

import { useState } from 'react'
import { CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { EmpenhoModal } from '@/components/orders/EmpenhoModal'
import type { Ordem } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Componente de ações — renderizado no slot do OrderDetailModal
// ---------------------------------------------------------------------------

function EmpenhoActionPanel({
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
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setModalOpen(true)}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Registrar Empenho
        </Button>
      </div>

      <EmpenhoModal
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
// Helpers
// ---------------------------------------------------------------------------

function rowClassName(ordem: Ordem): string {
  return ordem.prioridade === 'URGENTE' ? 'border-l-4 border-l-red-500' : ''
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function EmpenhoPage() {
  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Empenho Orçamentário</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ordens aprovadas pela Controladoria aguardando registro de empenho.
        </p>
      </div>

      <WorkflowTable
        statusFilter="AGUARDANDO_EMPENHO"
        title="Ordens aguardando empenho"
        emptyMessage="Nenhuma ordem aguardando empenho no momento."
        rowClassName={rowClassName}
        renderActions={(orderId, _status, onActionComplete) => (
          <EmpenhoActionPanel orderId={orderId} onSuccess={onActionComplete} />
        )}
      />
    </div>
  )
}
