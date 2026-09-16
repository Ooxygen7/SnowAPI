import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { apiKeySchema } from '@/features/keys/types'
import { redemptionSchema } from '@/features/redemption-codes/types'
import { userListSchema } from '@/features/users/types'

import { DemoEngine } from './engine'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}
function login(engine: DemoEngine) {
  return engine.request('POST', '/api/user/login', {
    username: 'snowapidemo',
    password: '1234567890',
  })
}
function read(engine: DemoEngine, path: string) {
  return engine.request('GET', path).body.data as Record<string, unknown>
}

describe('isolated frontend demo', () => {
  it('starts signed out, validates the demo credentials and invalidates logout', () => {
    const engine = new DemoEngine(memoryStorage())
    assert.equal(engine.request('GET', '/api/user/self').status, 401)
    assert.equal(
      engine.request('POST', '/api/user/login', {
        username: 'root',
        password: 'wrong',
      }).status,
      400
    )
    assert.equal(login(engine).status, 200)
    const profile = read(engine, '/api/user/self')
    assert.equal(profile.username, 'snowapidemo')
    assert.equal(profile.role, 100)
    assert.equal(profile.quota, 5000000000)
    assert.equal(profile.group, 'Free')
    engine.request('GET', '/api/user/logout')
    assert.equal(engine.request('GET', '/api/user/self').status, 401)
  })
  it('isolates purchases between visitors and restores the same browser state', () => {
    const storage = memoryStorage()
    const first = new DemoEngine(storage, () => 2000000000)
    const second = new DemoEngine(memoryStorage(), () => 2000000000)
    login(first)
    login(second)
    assert.equal(
      first.request('POST', '/api/subscription/balance/pay', { plan_id: 1 })
        .body.success,
      true
    )
    assert.equal(read(first, '/api/user/self').quota, 4975000000)
    assert.equal(read(first, '/api/user/self').group, 'Light')
    assert.equal(read(second, '/api/user/self').quota, 5000000000)
    assert.equal(read(second, '/api/user/self').group, 'Free')
    assert.equal(
      read(new DemoEngine(storage, () => 2000000000), '/api/user/self').quota,
      4975000000
    )
  })
  it('prorates upgrades without extending the period or accepting duplicates', () => {
    let now = 2000000000
    const engine = new DemoEngine(memoryStorage(), () => now)
    login(engine)
    engine.request('POST', '/api/subscription/balance/pay', { plan_id: 1 })
    const end = read(engine, '/api/user/self').group_expires_at
    now += 15 * 86400
    assert.equal(
      read(engine, '/api/subscription/balance/quote?plan_id=2').amount_due,
      25
    )
    engine.request('POST', '/api/subscription/balance/pay', { plan_id: 2 })
    assert.equal(read(engine, '/api/user/self').quota, 4962500000)
    assert.equal(read(engine, '/api/user/self').group, 'Moderate')
    assert.equal(read(engine, '/api/user/self').group_expires_at, end)
    assert.equal(
      engine.request('POST', '/api/subscription/balance/pay', { plan_id: 2 })
        .status,
      400
    )
    assert.equal(
      engine.request('POST', '/api/subscription/balance/pay', { plan_id: 1 })
        .status,
      400
    )
    now += 16 * 86400
    assert.equal(read(engine, '/api/user/self').group, 'Free')
  })
  it('rejects writes, side-effectful GETs and unknown endpoints without fallback', () => {
    const engine = new DemoEngine(memoryStorage())
    login(engine)
    for (const [method, path] of [
      ['PUT', '/api/option/'],
      ['POST', '/api/user/batch-delete'],
      ['DELETE', '/api/user/1'],
      ['GET', '/api/user/token'],
      ['GET', '/api/channel/test'],
      ['POST', '/api/user/pay'],
      ['POST', '/v1/chat/completions'],
      ['GET', '/api/unknown'],
    ]) {
      assert.equal(engine.request(method, path).status, 403)
    }
    assert.equal(read(engine, '/api/user/self').quota, 5000000000)
  })
  it('returns valid list contracts, pagination and search for the shared UI', () => {
    const engine = new DemoEngine(memoryStorage())
    login(engine)
    assert.equal(
      userListSchema.safeParse(read(engine, '/api/user').items).success,
      true
    )
    assert.equal(
      apiKeySchema.array().safeParse(read(engine, '/api/token').items).success,
      true
    )
    assert.equal(
      redemptionSchema.array().safeParse(read(engine, '/api/redemption').items)
        .success,
      true
    )
    assert.equal(
      (read(engine, '/api/user?p=3&page_size=10').items as unknown[]).length,
      10
    )
    assert.equal(read(engine, '/api/user/search?keyword=demo_user_29').total, 1)
  })
})
