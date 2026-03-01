/**
 * Constantes globais — enums, labels e estilos de UI.
 *
 * Sincronizado com o back-end (app/models/enums.py) e com o CLAUDE.md seção 6.
 */

import type { StatusOrdem, TipoOrdem, Prioridade } from '@/types/ordem'

// ---------------------------------------------------------------------------
// Status das Ordens — cores e labels
// ---------------------------------------------------------------------------

/**
 * Mapeamento de StatusOrdem → classes Tailwind e label legível.
 *
 * Paleta conforme CLAUDE.md seção 6:
 *   Azul    → AGUARDANDO_*  (pendente de ação)
 *   Amarelo → DEVOLVIDA_PARA_ALTERACAO (requer atenção)
 *   Vermelho → COM_IRREGULARIDADE, EXECUCAO_COM_PENDENCIA, CANCELADA
 *   Verde    → PAGA (concluído)
 */
export const STATUS_CONFIG: Record<
  StatusOrdem,
  { label: string; bg: string; text: string; border: string }
> = {
  AGUARDANDO_GABINETE: {
    label: 'Aguardando Gabinete',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  AGUARDANDO_CONTROLADORIA: {
    label: 'Aguardando Controladoria',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  AGUARDANDO_EMPENHO: {
    label: 'Aguardando Empenho',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  AGUARDANDO_EXECUCAO: {
    label: 'Aguardando Execução',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  AGUARDANDO_ATESTO: {
    label: 'Aguardando Atesto',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  AGUARDANDO_LIQUIDACAO: {
    label: 'Aguardando Liquidação',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  // US-019: amarelo — requer ação da secretaria (assinar documento de liquidação)
  AGUARDANDO_ASSINATURA_SECRETARIA: {
    label: 'Aguardando Assinatura',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
  },
  AGUARDANDO_PAGAMENTO: {
    label: 'Aguardando Pagamento',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  AGUARDANDO_DOCUMENTACAO: {
    label: 'Aguardando Documentação',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  DEVOLVIDA_PARA_ALTERACAO: {
    label: 'Devolvida para Alteração',
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
  },
  COM_IRREGULARIDADE: {
    label: 'Com Irregularidade',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  EXECUCAO_COM_PENDENCIA: {
    label: 'Execução com Pendência',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  CANCELADA: {
    label: 'Cancelada',
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    border: 'border-gray-200',
  },
  PAGA: {
    label: 'Paga',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
}

// ---------------------------------------------------------------------------
// Tipo de Ordem — labels
// ---------------------------------------------------------------------------

export const TIPO_ORDEM_LABELS: Record<TipoOrdem, string> = {
  compra: 'Compra',
  servico: 'Serviço',
  obra: 'Obra',
}

// ---------------------------------------------------------------------------
// Prioridade — labels e estilos
// ---------------------------------------------------------------------------

export const PRIORIDADE_LABELS: Record<Prioridade, string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}

export const PRIORIDADE_CONFIG: Record<
  Prioridade,
  { label: string; bg: string; text: string }
> = {
  normal: { label: 'Normal', bg: 'bg-gray-100', text: 'text-gray-600' },
  alta: { label: 'Alta', bg: 'bg-orange-50', text: 'text-orange-600' },
  urgente: { label: 'Urgente', bg: 'bg-red-50', text: 'text-red-600' },
}

// ---------------------------------------------------------------------------
// Validações — US-003 RN
// ---------------------------------------------------------------------------

/** US-003 RN-19: justificativa deve ter pelo menos 50 caracteres. */
export const JUSTIFICATIVA_MIN_LENGTH = 50

/** US-005 RN-27: observação de devolução deve ter pelo menos 20 caracteres. */
export const OBSERVACAO_MIN_LENGTH = 20

/** US-007 RN-38: parecer de irregularidade deve ter pelo menos 50 caracteres. */
export const PARECER_MIN_LENGTH = 50

// ---------------------------------------------------------------------------
// Paginação
// ---------------------------------------------------------------------------

/** US-004 RN-24: padrão de 20 registros por página. */
export const DEFAULT_PAGE_SIZE = 20

/** US-004: debounce em buscas/filtros (ms). */
export const DEBOUNCE_DELAY_MS = 300
