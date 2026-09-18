import { create } from 'zustand'

// Memory only. This is a UI hint, not authorization; the server checks its own
// signed HttpOnly clearance cookie on every protected request.
export const useSnowShieldState = create<{
  verified: boolean
  expiresAt: number
  setVerified: (verified: boolean, expiresIn?: number) => void
}>((set) => ({
  verified: false,
  expiresAt: 0,
  setVerified: (verified, expiresIn = 0) =>
    set({
      verified: verified && expiresIn > 0,
      expiresAt: verified ? Date.now() + expiresIn * 1000 : 0,
    }),
}))

export const SNOW_SHIELD_REQUIRED_EVENT = 'snowapi:shield-required'
