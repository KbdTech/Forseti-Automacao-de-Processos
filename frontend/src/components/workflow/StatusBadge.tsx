/**
 * StatusBadge — exibe o status de uma ordem com cor semântica.
 *
 * Sincronizado com STATUS_CONFIG (utils/constants.ts).
 * Paleta conforme CLAUDE.md seção 6:
 *   Azul    → AGUARDANDO_*
 *   Amarelo → DEVOLVIDA_PARA_ALTERACAO
 *   Vermelho → COM_IRREGULARIDADE, EXECUCAO_COM_PENDENCIA, CANCELADA
 *   Verde   → PAGA
 */

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from '@/utils/constants'
import type { StatusOrdem } from '@/types/ordem'

interface StatusBadgeProps {
  status: StatusOrdem
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <Badge
      variant="outline"
      className={cn(
        config.bg,
        config.text,
        config.border,
        'font-medium border whitespace-nowrap',
        className,
      )}
    >
      {config.label}
    </Badge>
  )
}
