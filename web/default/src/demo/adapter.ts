import { AxiosError, type AxiosAdapter } from 'axios'
import i18next from 'i18next'

import { DemoEngine } from './engine'

let storage: Storage | undefined
try {
  storage = window.localStorage
} catch {
  /* Storage is optional. */
}
const engine = new DemoEngine(storage)

export const demoAdapter: AxiosAdapter = async (config) => {
  const url = new URL(config.url || '/', 'https://demo.invalid')
  for (const [key, value] of Object.entries(config.params || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }
  let payload: unknown = config.data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = {}
    }
  }
  const result = engine.request(
    (config.method || 'GET').toUpperCase(),
    url.href,
    payload
  )
  const response = {
    data: {
      ...result.body,
      message: result.body.message ? i18next.t(result.body.message) : '',
    },
    status: result.status,
    statusText: String(result.status),
    headers: {},
    config,
  }
  if (result.status >= 400) {
    throw new AxiosError(
      response.data.message,
      'ERR_DEMO_READ_ONLY',
      config,
      undefined,
      response
    )
  }
  return response
}
