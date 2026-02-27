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
