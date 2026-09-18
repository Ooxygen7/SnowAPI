import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
import { normalizeInterfaceLanguage, toIntlLocale } from '@/i18n/languages'
import { api } from '@/lib/api'
import { IS_DEMO } from '@/lib/deployment-mode'

import { LatticeLoader } from './lattice-loader'
import { SNOW_SHIELD_REQUIRED_EVENT, useSnowShieldState } from './state'

import './snow-shield.css'

type ShieldCheck = {
  enabled: boolean
  verified: boolean
  site_key?: string
  verification_id?: string
  expires_in?: number
}
const REQUEST_OPTIONS = {
  skipBusinessError: true,
  skipErrorHandler: true,
  timeout: 15000,
}

async function checkShield(): Promise<ShieldCheck> {
  const response = await api.get<{ success: boolean; data: ShieldCheck }>(
    '/api/security/shield',
    REQUEST_OPTIONS
  )
  if (!response.data.success) throw new Error('Shield check unavailable')
  useSnowShieldState
    .getState()
    .setVerified(
      response.data.data.enabled && response.data.data.verified,
      response.data.data.expires_in
    )
  return response.data.data
}

export function SnowShieldGate(props: { children: ReactNode }) {
  if (IS_DEMO) return props.children
  return <BrowserShield>{props.children}</BrowserShield>
}

function BrowserShield(props: { children: ReactNode }) {
  // Deliberately ignore the saved site-language preference on this entry page.
  const language = normalizeInterfaceLanguage(navigator.language)
  const { t } = useTranslation(undefined, { lng: language })
  const client = useQueryClient()
  const verified = useSnowShieldState((state) => state.verified)
  const expiresAt = useSnowShieldState((state) => state.expiresAt)
  const [widgetFailed, setWidgetFailed] = useState(false)
  const lastToken = useRef('')
  const check = useQuery({
    queryKey: ['snow-shield-check'],
    queryFn: checkShield,
    retry: false,
    staleTime: Infinity,
  })
  const verify = useMutation({
    mutationFn: async (token: string) => {
      const response = await api.post(
        '/api/security/shield/verify',
        { token, verification_id: check.data?.verification_id },
        REQUEST_OPTIONS
      )
      if (!response.data.success) throw new Error('Shield verification failed')
      return response.data.expires_in as number
    },
    onSuccess: (expiresIn) =>
      useSnowShieldState.getState().setVerified(true, expiresIn),
    // Render a localized, actionable error here rather than a global toast.
    onError: () => undefined,
  })

  useEffect(() => {
    const requireVerification = () => {
      useSnowShieldState.getState().setVerified(false)
      lastToken.current = ''
      void client.invalidateQueries({ queryKey: ['snow-shield-check'] })
    }
    window.addEventListener(SNOW_SHIELD_REQUIRED_EVENT, requireVerification)
    return () =>
      window.removeEventListener(
        SNOW_SHIELD_REQUIRED_EVENT,
        requireVerification
      )
  }, [client])

  useEffect(() => {
    if (!verified || !expiresAt) return
    const checkExpiry = () => {
      if (Date.now() < expiresAt) return
      useSnowShieldState.getState().setVerified(false)
      lastToken.current = ''
      void client.invalidateQueries({ queryKey: ['snow-shield-check'] })
    }
    const timer = window.setTimeout(
      checkExpiry,
      Math.max(0, expiresAt - Date.now())
    )
    // Background tabs may suspend timers; check before resuming the console.
    window.addEventListener('pageshow', checkExpiry)
    window.addEventListener('focus', checkExpiry)
    document.addEventListener('visibilitychange', checkExpiry)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pageshow', checkExpiry)
      window.removeEventListener('focus', checkExpiry)
      document.removeEventListener('visibilitychange', checkExpiry)
    }
  }, [client, verified, expiresAt])

  const blocked =
    check.data?.enabled !== false && (!verified || Date.now() >= expiresAt)
  useEffect(() => {
    if (!blocked) return
    const originalLanguage = document.documentElement.lang
    document.documentElement.lang = toIntlLocale(language) ?? 'en'
    return () => {
      document.documentElement.lang = originalLanguage
    }
  }, [blocked, language])

  // An unknown clearance is not a failed clearance. Keep the normal page
  // background until the server answers, without mounting protected content
  // or briefly showing a challenge to an already-trusted browser.
  if (check.isPending) {
    return <div className='bg-background min-h-svh' aria-busy='true' />
  }
  if (!blocked) return props.children
  const failed = check.isError || verify.isError || widgetFailed
  const requestID = check.data?.verification_id
  return (
    <div className='snow-shield' lang={toIntlLocale(language)}>
      <main className='snow-shield__main'>
        <div className='snow-shield__content'>
          <h1 className='snow-shield__title'>
            <LatticeLoader
              status={failed ? 'error' : 'working'}
              label={t('We are verifying your access')}
            />
          </h1>
          <p className='snow-shield__description'>
            {t(
              'SnowAPI uses safeguards against malicious automated access. This page will remain visible until your request passes verification.'
            )}
          </p>
          <div
            className='snow-shield__verification'
            aria-busy={verify.isPending || check.isFetching}
          >
            {check.data?.site_key &&
              requestID &&
              !check.isFetching &&
              !verify.isError && (
                <Turnstile
                  key={requestID}
                  siteKey={check.data.site_key}
                  action='snow_shield'
                  cData={requestID}
                  language={language}
                  theme='light'
                  appearance='interaction-only'
                  onError={() => setWidgetFailed(true)}
                  onVerify={(token) => {
                    if (!token) {
                      setWidgetFailed(false)
                      return
                    }
                    if (token === lastToken.current || verify.isPending) return
                    lastToken.current = token
                    setWidgetFailed(false)
                    verify.mutate(token)
                  }}
                />
              )}
            {(check.isError || verify.isError) && (
              <div className='snow-shield__error' role='alert'>
                <p>{t('Security verification failed. Please try again.')}</p>
                <Button
                  variant='outline'
                  onClick={() => {
                    lastToken.current = ''
                    verify.reset()
                    setWidgetFailed(false)
                    void check.refetch()
                  }}
                >
                  {t('Retry verification')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className='snow-shield__footer'>
        <p>
          Powered By Snow<strong>SecurityLab</strong>
        </p>
        <p className='snow-shield__id'>
          {t('Verification ID')}: <span>{requestID ?? '—'}</span>
        </p>
      </footer>
    </div>
  )
}
