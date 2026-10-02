import assert from 'node:assert/strict'
import { test } from 'node:test'

import axios, { type AxiosResponse } from 'axios'

import { useAuthStore } from '../stores/auth-store'
import { api } from './api'

test('GET deduplication and delayed responses cannot cross account boundaries', async () => {
  const previousAdapter = api.defaults.adapter
  let finishA!: () => void
  let started!: () => void
  const startedA = new Promise<void>((resolve) => {
    started = resolve
  })
  let requests = 0
  api.defaults.adapter = (config) => {
    requests++
    const response: AxiosResponse = {
      data: { owner: useAuthStore.getState().auth.user?.id },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
    if (response.data.owner === 10001) {
      return new Promise<AxiosResponse>((resolve) => {
        finishA = () => resolve(response)
        started()
      })
    }
    return Promise.resolve(response)
  }
  try {
    useAuthStore.getState().auth.setUser({ id: 10001, username: 'A', role: 1 })
    const oldRequest = api
      .get('/api/subscription/self')
      .catch((error: unknown) => error)
    await startedA
    useAuthStore.getState().auth.reset()
    useAuthStore.getState().auth.setUser({ id: 10002, username: 'B', role: 1 })
    const current = await api.get('/api/subscription/self')
    assert.equal(current.data.owner, 10002)
    assert.equal(requests, 2)
    finishA()
    assert.equal(axios.isCancel(await oldRequest), true)
    assert.equal(useAuthStore.getState().auth.user?.id, 10002)
  } finally {
    api.defaults.adapter = previousAdapter
    useAuthStore.getState().auth.reset()
  }
})
