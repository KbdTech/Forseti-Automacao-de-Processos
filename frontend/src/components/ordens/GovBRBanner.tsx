/**
 * GovBRBanner — US-015.
 *
 * Banner de instrução para assinatura digital via gov.br.
 * Exibido acima do DocumentUploader quando o contexto requer
 * assinatura (ex.: atesto de nota fiscal).
 *
 * Fluxo: Baixe o documento → assine em gov.br/assinatura → reenvie aqui
 */

import { ExternalLink, Info } from 'lucide-react'

interface GovBRBannerProps {
  /** Oculta o banner condicionalmente. */
  visible?: boolean
}

export function GovBRBanner({ visible = true }: GovBRBannerProps) {
  if (!visible) return null

  return (
    <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-800 dark:bg-blue-950/30">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="space-y-1">
        <p className="font-medium text-blue-800 dark:text-blue-300">
          Assinatura digital via gov.br
        </p>
        <ol className="list-inside list-decimal space-y-0.5 text-blue-700 dark:text-blue-400">
          <li>Baixe o documento usando o botão ao lado</li>
          <li>
            Acesse{' '}
            <a
              href="https://www.gov.br/governodigital/pt-br/assinatura-eletronica"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-blue-900"
            >
              gov.br/assinatura
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            e assine o arquivo
          </li>
          <li>Reenvie o documento assinado marcando a opção abaixo</li>
        </ol>
      </div>
    </div>
  )
}

export default GovBRBanner
