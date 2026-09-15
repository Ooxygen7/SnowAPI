/*
Copyright (C) 2023-2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import { create } from 'zustand'

type LoginTransitionState = {
  phase: 'idle' | 'welcome' | 'leaving'
  username: string
  entranceComplete: (() => void) | null
  start: (username: string) => Promise<void>
  leave: () => void
  reset: () => void
}

// Ephemeral presentation state only: never persist an in-progress login.
export const useLoginTransition = create<LoginTransitionState>((set) => ({
  phase: 'idle',
  username: '',
  entranceComplete: null,
  start: (username) =>
    new Promise<void>((resolve) => {
      set({ phase: 'welcome', username, entranceComplete: resolve })
    }),
  leave: () => set({ phase: 'leaving', entranceComplete: null }),
  reset: () => set({ phase: 'idle', username: '', entranceComplete: null }),
}))
