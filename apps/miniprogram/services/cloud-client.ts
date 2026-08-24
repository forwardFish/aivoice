import {
  CLOUDBASE_ENV_ID,
  CLOUDBASE_RESOURCE_APP_ID,
  CLOUDBASE_RUN_ENV_ID
} from '../config'

export interface CloudClientBinding {
  client: any
  envId: string
  shared: boolean
}

const sharedBindings = new Map<string, Promise<CloudClientBinding>>()
let globalInit: Promise<void> | null = null

function rootCloud(): any {
  return typeof wx !== 'undefined' ? (wx as any).cloud : null
}

function initializeGlobalCloud(cloud: any): Promise<void> {
  if (!globalInit) {
    globalInit = Promise.resolve(
      typeof cloud.init === 'function'
        ? cloud.init({ env: CLOUDBASE_ENV_ID, traceUser: true })
        : undefined
    ).then(() => undefined)
  }
  return globalInit
}

export function getCloudClient(envId: string): Promise<CloudClientBinding> {
  const targetEnv = String(envId || CLOUDBASE_ENV_ID)
  const existing = sharedBindings.get(targetEnv)
  if (existing) return existing

  const binding = Promise.resolve().then(async () => {
    const cloud = rootCloud()
    if (!cloud) throw new Error('微信云开发能力不可用。')

    if (CLOUDBASE_RESOURCE_APP_ID && typeof cloud.Cloud === 'function') {
      const client = new cloud.Cloud({
        resourceAppid: CLOUDBASE_RESOURCE_APP_ID,
        resourceEnv: targetEnv
      })
      if (typeof client.init === 'function') await client.init()
      return { client, envId: targetEnv, shared: true }
    }

    await initializeGlobalCloud(cloud)
    return { client: cloud, envId: targetEnv, shared: false }
  })
  sharedBindings.set(targetEnv, binding)
  return binding
}

export function cloudEnvConfig(binding: CloudClientBinding): Record<string, any> {
  return binding.shared ? {} : { config: { env: binding.envId } }
}

export async function prewarmCloudClients(): Promise<void> {
  await Promise.all([
    getCloudClient(CLOUDBASE_ENV_ID),
    getCloudClient(CLOUDBASE_RUN_ENV_ID)
  ])
}
