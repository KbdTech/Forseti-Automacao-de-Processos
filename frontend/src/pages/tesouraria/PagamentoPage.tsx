/**
 * PagamentoPage — fila de pagamento — US-010.
 *
 * Features:
 *   - Tabela de ordens AGUARDANDO_PAGAMENTO com WorkflowTable
 *   - Botão "Registrar Pagamento" no slot de ações do OrderDetailModal
 *   - PagamentoModal com valor_pago, data_pagamento, forma_pagamento e
 *     observação (obrigatória quando valor difere do liquidado)
 *   - US-023: auto-refresh a cada 30s + botão Atualizar + indicador de tempo
 *
 * US-010 RN-51: tesouraria registra pagamento → PAGA.
 * US-010 RN-52: valor divergente exige justificativa.
 * US-010 RN-53: status PAGA é somente-leitura (garantido no back-end).
 */

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { WorkflowTable } from '@/components/workflow/WorkflowTable'
import { PagamentoModal } from '@/components/orders/PagamentoModal'
import { POLLING_INTERVAL_MS } from '@/utils/constants'
import { formatRelativeTime } from '@/utils/formatters'

// ---------------------------------------------------------------------------
// Painel de ações
// ---------------------------------------------------------------------------

function PagamentoActionPanel({
  orderId,
  onSuccess,
  onModalChange,
}: {
  orderId: string
  onSuccess: () => void
  /** US-023: notifica a página pai quando o modal abre/fecha (pausa polling). */
  onModalChange: (open: boolean) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)

  function handleModalChange(open: boolean) {
    setModalOpen(open)
    onModalChange(open)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Ações disponíveis
        </span>
        <Button size="sm" className="gap-1.5" onClick={() => handleModalChange(true)}>
          <CheckCircle className="h-3.5 w-3.5" />
          Registrar Pagamento
        </Button>
      </div>

      <PagamentoModal
        orderId={modalOpen ? orderId : null}
        onClose={() => handleModalChange(false)}
        onSuccess={() => {
          handleModalChange(false)
          onSuccess()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function PagamentoPage() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  // Força re-render a cada segundo para atualizar o indicador de tempo relativo
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!lastUpdated) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [lastUpdated])

  const handleRefresh = useCallback((timestamp: Date) => {
    setLastUpdated(timestamp)
  }, [])

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Registro de Pagamento</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ordens liquidadas aguardando confirmação de pagamento pela Tesouraria.
          </p>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground mt-2 shrink-0">
            Atualizado {formatRelativeTime(lastUpdated)}
          </p>
        )}
      </div>

      <WorkflowTable
        statusFilter="AGUARDANDO_PAGAMENTO"
        title="Ordens aguardando pagamento"
        emptyMessage="Nenhuma ordem aguardando pagamento no momento."
        autoRefreshMs={POLLING_INTERVAL_MS}
        pausePolling={isModalOpen}
        onRefresh={handleRefresh}
        showRefreshButton
        renderActions={(orderId, _status, onActionComplete) => (
          <PagamentoActionPanel
            orderId={orderId}
            onSuccess={onActionComplete}
            onModalChange={setIsModalOpen}
          />
        )}
      />
    </div>
  )
}
