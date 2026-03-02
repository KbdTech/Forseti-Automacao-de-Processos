/**
 * Funções utilitárias de formatação.
 */

// ---------------------------------------------------------------------------
// Erros de API (FastAPI / Pydantic v2)
// ---------------------------------------------------------------------------

/**
 * Extrai uma mensagem de erro legível do campo `detail` da resposta FastAPI.
 *
 * O FastAPI pode retornar `detail` como:
 *   - string     → erros de negócio (HTTPException)
 *   - object[]   → erros de validação Pydantic v2
 *                  [{ type, loc, msg, input, ctx }]
 *
 * Renderizar o array diretamente como ReactNode causa o erro do React:
 * "Objects are not valid as a React child".
 *
 * @param detail   Valor bruto de `error.response.data.detail`
 * @param fallback Mensagem padrão quando não for possível extrair
 */
export function extractApiError(detail: unknown, fallback = 'Operação falhou. Tente novamente.'): string {
  if (!detail) return fallback

  // HTTPException retorna string
  if (typeof detail === 'string') return detail

  // Pydantic v2 retorna array de { type, loc, msg, input, ctx }
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((e) => (typeof e?.msg === 'string' ? e.msg : null))
      .filter(Boolean)
    return msgs.length > 0 ? msgs.join(' | ') : fallback
  }

  return fallback
}

// ---------------------------------------------------------------------------
// Moeda
// ---------------------------------------------------------------------------

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ---------------------------------------------------------------------------
// Entrada de moeda — BUG-001
// ---------------------------------------------------------------------------

/**
 * Converte string BRL do usuário para número.
 * Aceita: "R$ 15.000,00", "15.000,00", "15000,00", "15000.00", "15000".
 */
export function parseBRL(value: string): number {
  if (!value) return 0
  const cleaned = value
    .replace(/R\$\s?/g, '')  // Remove símbolo de moeda
    .replace(/\./g, '')        // Remove separador de milhar
    .replace(',', '.')         // Converte decimal BR (,) → EN (.)
    .trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

/**
 * Formata número como string BRL sem símbolo para campos de input.
 * Ex.: 15000 → "15.000,00"
 */
export function formatCurrencyInput(value: number): string {
  if (!value) return ''
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// Secretaria
// ---------------------------------------------------------------------------

/**
 * Remove o prefixo "Secretaria Municipal de/do/da/dos/das" para exibição
 * compacta em tabelas.
 * Ex.: "Secretaria Municipal de Educação" → "Educação"
 */
export function formatNomeSecretaria(nome: string | null | undefined): string {
  if (!nome) return '—'
  return nome.replace(/^Secretaria Municipal (de|do|da|dos|das) /i, '')
}

// ---------------------------------------------------------------------------
// CNPJ — S11.2
// ---------------------------------------------------------------------------

/**
 * Aplica máscara progressiva ao CNPJ durante digitação.
 * Entrada: qualquer string. Saída: XX.XXX.XXX/XXXX-XX (parcial ou completa).
 */
export function formatCNPJ(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Remove toda formatação do CNPJ, retornando apenas os 14 dígitos. */
export function parseCNPJ(formatted: string): string {
  return formatted.replace(/\D/g, '')
}

// ---------------------------------------------------------------------------
// Tempo relativo
// ---------------------------------------------------------------------------

/**
 * Retorna string legível de tempo decorrido desde uma data.
 * Ex.: "há 30 seg", "há 2 min", "há 1 h"
 */
export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `há ${seconds} seg`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `há ${hours} h`
}
