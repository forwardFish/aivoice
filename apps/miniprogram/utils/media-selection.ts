export const MEDIA_TILE_COUNT = 9
export const DEFAULT_MEDIA_TILE_INDEX = 2

export function normalizeMediaTileIndex(value: unknown, fallback = DEFAULT_MEDIA_TILE_INDEX): number {
  const normalizedFallback = Math.max(0, Math.min(MEDIA_TILE_COUNT - 1, Math.floor(Number(fallback) || 0)))
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return normalizedFallback
  return Math.max(0, Math.min(MEDIA_TILE_COUNT - 1, Math.floor(parsed)))
}
