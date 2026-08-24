import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import request from 'supertest'
import cloud from 'wx-server-sdk'
import { AppModule } from '../../apps/api/src/app.module.js'

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

let serverPromise: Promise<any> | null = null

async function server(): Promise<any> {
  if (!serverPromise) {
    serverPromise = NestFactory.create(AppModule, { rawBody: true, logger: ['error'] }).then(async (app) => {
      app.setGlobalPrefix('v1')
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
      await app.init()
      return app.getHttpServer()
    })
  }
  return serverPromise
}

function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  const headers: Record<string, string> = {}
  for (const name of ['authorization', 'idempotency-key', 'content-type']) {
    const item = source[name] ?? source[name.toUpperCase()]
    if (typeof item === 'string' && item) headers[name] = item
  }
  return headers
}

export async function main(event: Record<string, any> = {}): Promise<Record<string, any>> {
  const method = String(event.method || 'GET').toUpperCase()
  const path = String(event.path || '/v1/health')
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !path.startsWith('/v1/')) {
    return { statusCode: 400, data: { code: 'INVALID_EVENT_REQUEST', message: 'Invalid API event request' } }
  }
  const wxContext = cloud.getWXContext()
  let agent: any = request(await server())[method.toLowerCase() as 'get'](path)
  const headers = safeHeaders(event.headers)
  for (const [name, value] of Object.entries(headers)) agent = agent.set(name, value)
  if (wxContext.OPENID) agent = agent.set('x-wx-openid', wxContext.OPENID)
  if (wxContext.APPID) agent = agent.set('x-wx-appid', wxContext.APPID)
  if (event.data !== undefined && method !== 'GET') agent = agent.send(event.data)
  const response = await agent
  return {
    statusCode: response.statusCode,
    data: response.body && Object.keys(response.body).length ? response.body : response.text,
    headers: { 'content-type': String(response.headers['content-type'] || 'application/json') },
  }
}
