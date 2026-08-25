const FORWARDED_HEADERS = new Set([
  'authorization',
  'idempotency-key',
  'content-type',
])

export function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const headers: Record<string, string> = {}
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const name = rawName.toLowerCase()
    if (FORWARDED_HEADERS.has(name) && typeof rawValue === 'string' && rawValue) {
      headers[name] = rawValue
    }
  }
  return headers
}
