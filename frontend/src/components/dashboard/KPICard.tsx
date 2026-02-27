/**
 * KPICard — card de indicador executivo para o Dashboard (US-011).
 *
 * Layout:
 *   - Ícone no canto superior esquerdo com cor de fundo
 *   - Valor em fonte grande e bold
 *   - Título abaixo em cinza
 *   - Trend no canto inferior: seta + percentual (verde = positivo, vermelho = negativo)
 */

import type { LucideIcon } from 'lucide-react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KPICardProps {
  title: string
  value: string | number
  icon: LucideIcon
  /** Variação percentual em relação ao período anterior. null = sem comparação. */
  trend?: number | null
  /** Rótulo da variação (ex: "vs. mês anterior"). */
  trendLabel?: string
  /** Cor do ícone e do fundo do ícone (classes Tailwind). */
  color?: string
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function KPICard({
  title,
  value,
  icon: Icon,
  trend = null,
  trendLabel = 'vs. período anterior',
  color = 'text-blue-600',
}: KPICardProps) {
  const bgColor = color
    .replace('text-', 'bg-')
    .replace('-600', '-50')
    .replace('-700', '-50')

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        {/* Ícone */}
        <div
          className={cn(
            'absolute top-4 right-4 flex items-center justify-center w-10 h-10 rounded-lg',
            bgColor,
          )}
        >
          <Icon className={cn('h-5 w-5', color)} aria-hidden="true" />
        </div>

        {/* Valor */}
        <p className="text-3xl font-bold tracking-tight text-foreground mt-1">
          {value}
        </p>

        {/* Título */}
        <p className="text-sm text-muted-foreground mt-1">{title}</p>

        {/* Trend */}
        {trend !== null && (
          <div className="flex items-center gap-1 mt-3">
            {trend > 0 ? (
              <>
                <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-medium text-green-600">
                  +{trend.toFixed(1)}%
                </span>
              </>
            ) : trend < 0 ? (
              <>
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-500">
                  {trend.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  0%
                </span>
              </>
            )}
            <span className="text-xs text-muted-foreground">{trendLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function KPICardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-8 w-24 mb-2" />
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  )
}
