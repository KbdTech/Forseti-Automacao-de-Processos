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
