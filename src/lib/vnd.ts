export function parseVndInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(trimmed)) return null
  const parsed = Number(trimmed.replace(/[.,]/g, ''))
  return Number.isSafeInteger(parsed) ? parsed : null
}
