import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let apiModule

export async function main(event = {}, context = {}) {
  try {
    apiModule ||= require('./api.cjs')
    return await apiModule.main(event, context)
  } catch (error) {
    console.error('aivoice-api-event bootstrap failed', error)
    throw error
  }
}
