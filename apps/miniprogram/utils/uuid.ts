function formatUuid(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.prototype.map.call(bytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function fallbackBytes(): Uint8Array {
  const bytes = new Uint8Array(16)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

export async function uuidV4(): Promise<string> {
  const getRandomValues = (wx as any).getRandomValues
  if (typeof getRandomValues !== 'function') return formatUuid(fallbackBytes())

  const bytes = await new Promise<Uint8Array>((resolve) => {
    getRandomValues({
      length: 16,
      success(result: any) {
        const buffer = result && result.randomValues
        if (!buffer || Number(buffer.byteLength) < 16) {
          resolve(fallbackBytes())
          return
        }
        resolve(new Uint8Array(buffer).slice(0, 16))
      },
      fail() {
        resolve(fallbackBytes())
      }
    })
  })
  return formatUuid(bytes)
}
