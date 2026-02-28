/**
 * Service de Preferências de Notificação — US-014.
 *
 * Encapsula chamadas à API REST /api/notifications/preferences.
 * US-014 RN-73: usuário configura quais eventos receber.
 */

import apiClient from '@/services/apiClient'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface NotificationPrefItem {
  evento: string
  ativo: boolean
}

export interface NotificationPrefsResponse {
  preferences: NotificationPrefItem[]
  available_events: string[]
}

// Rótulos legíveis para cada evento
export const EVENTO_LABELS: Record<string, string> = {
  ordem_aguardando_gabinete: 'Ordem enviada para análise do Gabinete',
  ordem_aguardando_controladoria: 'Ordem encaminhada para Controladoria',
  ordem_aguardando_empenho: 'Ordem aprovada — aguardando empenho',
  ordem_aguardando_atesto: 'Ordem empenhada — aguardando atesto',
  ordem_aguardando_liquidacao: 'Ordem atestada — aguardando liquidação',
  ordem_aguardando_pagamento: 'Ordem liquidada — aguardando pagamento',
  ordem_paga: 'Ordem paga e encerrada',
  ordem_devolvida: 'Ordem devolvida para alteração',
  ordem_irregularidade: 'Irregularidade registrada na ordem',
  ordem_cancelada: 'Ordem cancelada',
}

// ---------------------------------------------------------------------------
// Funções de API
// ---------------------------------------------------------------------------

export async function getNotificationPreferences(): Promise<NotificationPrefsResponse> {
  const { data } = await apiClient.get<NotificationPrefsResponse>(
    '/api/notifications/preferences',
  )
  return data
}

export async function updateNotificationPreferences(
  preferences: Record<string, boolean>,
): Promise<NotificationPrefsResponse> {
  const { data } = await apiClient.put<NotificationPrefsResponse>(
    '/api/notifications/preferences',
    { preferences },
  )
  return data
}
