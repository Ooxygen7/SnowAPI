import assert from 'node:assert/strict'
import { test } from 'node:test'

import { QueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../stores/auth-store'
import { bindAccountQueryCache } from './account-query-cache'

test('switching accounts discards private data and queries the new account', async () => {
  const client = new QueryClient()
  const unbind = bindAccountQueryCache(client)
  try {
    useAuthStore.getState().auth.setUser({ id: 10001, username: 'A', role: 1 })
    const queryKey = ['self-subscription-overview']
    await client.fetchQuery({
      queryKey,
      staleTime: 30000,
      queryFn: async () => ({ owner: 10001 }),
    })
    useAuthStore.getState().auth.reset()
    assert.equal(client.getQueryData(queryKey), undefined)
    useAuthStore.getState().auth.setUser({ id: 10002, username: 'B', role: 1 })
    let requests = 0
    const result = await client.fetchQuery({
      queryKey,
      staleTime: 30000,
      queryFn: async () => {
        requests++
        return { owner: 10002 }
      },
    })
    assert.equal(result.owner, 10002)
    assert.equal(requests, 1)
    useAuthStore
      .getState()
      .auth.setUser({ id: 10002, username: 'B updated', role: 1 })
    assert.equal(
      client.getQueryData(queryKey),
      result,
      'same-account profile refresh preserves queries'
    )
  } finally {
    unbind()
    client.clear()
    useAuthStore.getState().auth.reset()
  }
})

test('an old in-flight query cannot repopulate the next account cache', async () => {
  const client = new QueryClient()
  const unbind = bindAccountQueryCache(client)
  let resolve!: (value: string) => void
  const response = new Promise<string>((done) => {
    resolve = done
  })
  try {
    useAuthStore.getState().auth.setUser({ id: 10001, username: 'A', role: 1 })
    const queryKey = ['dashboard', 'user-quota']
    const pending = client
      .fetchQuery({ queryKey, queryFn: () => response })
      .catch(() => undefined)
    useAuthStore.getState().auth.setUser({ id: 10002, username: 'B', role: 1 })
    client.setQueryData(queryKey, 'B data')
    resolve('A data')
    await pending
    assert.equal(client.getQueryData(queryKey), 'B data')
  } finally {
    unbind()
    client.clear()
    useAuthStore.getState().auth.reset()
  }
})
