/**
 * NotificationPreferencesPage — US-014.
 *
 * Permite ao usuário autenticado ativar/desativar notificações por e-mail
 * para cada tipo de evento do sistema.
 *
 * US-014 RN-73: preferências individuais por evento (opt-out model).
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  EVENTO_LABELS,
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPrefItem,
} from '@/services/notificationsService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PreferenceRow({
  pref,
  onChange,
}: {
  pref: NotificationPrefItem
  onChange: (evento: string, value: boolean) => void
}) {
  const label = EVENTO_LABELS[pref.evento] ?? pref.evento.replace(/_/g, ' ')

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        {pref.ativo ? (
          <Bell className="h-4 w-4 text-blue-600 shrink-0" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className={pref.ativo ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
          {label}
        </span>
      </div>
      <Switch
        checked={pref.ativo}
        onCheckedChange={(checked) => onChange(pref.evento, checked)}
        aria-label={`Notificação: ${label}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function NotificationPreferencesPage() {
  const queryClient = useQueryClient()

  // Estado local das preferências (antes de salvar)
  const [localPrefs, setLocalPrefs] = useState<Record<string, boolean> | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: getNotificationPreferences,
    staleTime: 1000 * 60 * 5,
    select: (res) => res.preferences,
  })

  // Inicializa estado local quando dados chegam
  if (data && localPrefs === null) {
    const initial: Record<string, boolean> = {}
    data.forEach((p) => {
      initial[p.evento] = p.ativo
    })
    setLocalPrefs(initial)
  }

  const { mutate: savePrefs, isPending: isSaving } = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
      setIsDirty(false)
      toast.success('Preferências salvas com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível salvar as preferências. Tente novamente.')
    },
  })

  function handleChange(evento: string, value: boolean) {
    setLocalPrefs((prev) => ({ ...(prev ?? {}), [evento]: value }))
    setIsDirty(true)
  }

  function handleSave() {
    if (localPrefs) {
      savePrefs(localPrefs)
    }
  }

  // Mescla preferências carregadas com o estado local
  const displayPrefs: NotificationPrefItem[] = (data ?? []).map((p) => ({
    ...p,
    ativo: localPrefs?.[p.evento] ?? p.ativo,
  }))

  const allOn = displayPrefs.every((p) => p.ativo)
  const allOff = displayPrefs.every((p) => !p.ativo)

  function handleToggleAll(value: boolean) {
    const updated: Record<string, boolean> = {}
    displayPrefs.forEach((p) => {
      updated[p.evento] = value
    })
    setLocalPrefs(updated)
    setIsDirty(true)
  }

  return (
    <div className="container max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold">Preferências de Notificação</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure quais eventos do sistema geram notificações por e-mail para você.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Notificações por evento</CardTitle>
              <CardDescription>
                Ative ou desative individualmente cada tipo de notificação.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!allOn && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAll(true)}
                  disabled={isLoading}
                >
                  Ativar todas
                </Button>
              )}
              {!allOff && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleAll(false)}
                  disabled={isLoading}
                >
                  Desativar todas
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-4 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : displayPrefs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhuma preferência disponível.
            </p>
          ) : (
            <div>
              {displayPrefs.map((pref) => (
                <PreferenceRow key={pref.evento} pref={pref} onChange={handleChange} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botão de salvar */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!isDirty || isSaving || isLoading}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Salvando…' : 'Salvar preferências'}
        </Button>
      </div>
    </div>
  )
}
