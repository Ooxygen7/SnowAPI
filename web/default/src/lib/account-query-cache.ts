import type { QueryClient } from '@tanstack/react-query'

import { useAuthStore } from '../stores/auth-store'

// Cancel old queries as well as dropping cached data. An outstanding response
// from a previous account must not repopulate the next account's cache.
export function bindAccountQueryCache(client: QueryClient) {
  return useAuthStore.subscribe((state, previous) => {
    if (state.auth.sessionVersion !== previous.auth.sessionVersion) {
      client.clear()
    }
  })
}
