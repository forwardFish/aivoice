export function formatDurationMs(ms?: number): string {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatDurationSeconds(seconds?: number): string {
  return formatDurationMs(Number(seconds || 0) * 1000)
}

export function formatDateTime(value?: string): string {
  if (!value) return '暂无记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  if (sameDay) return `今天 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatPrice(amountFen?: number): string {
  return `¥${(Number(amountFen || 0) / 100).toFixed(1)}`
}

export function voiceInitial(name?: string): string {
  const text = String(name || '声').trim()
  return text.slice(0, 1) || '声'
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
