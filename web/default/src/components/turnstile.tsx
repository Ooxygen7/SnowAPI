/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>
      ) => string | undefined
      remove: (widgetId: string) => void
    }
  }
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
  action?: string
  cData?: string
  language?: string
  theme?: 'light' | 'dark' | 'auto'
  appearance?: 'always' | 'execute' | 'interaction-only'
  onError?: (code: string) => void
  singleAttempt?: boolean
  showError?: boolean
}

let scriptLoading: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptLoading) return scriptLoading
  scriptLoading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('#cf-turnstile')
    const script = existing ?? document.createElement('script')
    const finish = (failed: boolean) => {
      clearTimeout(timeout)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', errored)
      if (failed) {
        script.remove()
        scriptLoading = null
        reject(new Error('Turnstile could not load'))
      } else {
        resolve()
      }
    }
    const loaded = () => finish(!window.turnstile)
    const errored = () => finish(true)
    const timeout = setTimeout(errored, 15000)
    script.addEventListener('load', loaded)
    script.addEventListener('error', errored)
    if (!existing) {
      script.id = 'cf-turnstile'
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      document.head.appendChild(script)
    }
  })
  return scriptLoading
}

export function Turnstile({
  siteKey,
  onVerify,
  onExpire,
  className,
  action,
  cData,
  language: languageOverride,
  theme = 'auto',
  appearance = 'always',
  onError,
  singleAttempt = false,
  showError = true,
}: TurnstileProps) {
  const { t, i18n } = useTranslation(undefined, { lng: languageOverride })
  const ref = useRef<HTMLDivElement | null>(null)
  const callbacks = useRef({ onVerify, onExpire, onError })
  callbacks.current = { onVerify, onExpire, onError }
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const requestedLanguage = languageOverride ?? i18n.language
  const language = requestedLanguage.startsWith('zh')
    ? 'zh-cn'
    : requestedLanguage

  useEffect(() => {
    let cancelled = false
    let widgetId: string | undefined
    let attemptEnded = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    callbacks.current.onVerify('')
    const fail = (code = 'widget_failed') => {
      if (cancelled || (singleAttempt && attemptEnded)) return
      attemptEnded = true
      clearTimeout(timeout)
      callbacks.current.onVerify('')
      setFailed(true)
      callbacks.current.onError?.(code)
      return true
    }
    // Do not leave a silent automatic challenge spinning indefinitely. Once
    // Cloudflare asks for interaction, its own interaction timeout takes over.
    if (singleAttempt) timeout = setTimeout(() => fail('widget_timeout'), 45000)
    void loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          language,
          theme,
          appearance,
          action,
          cData,
          ...(singleAttempt && {
            retry: 'never',
            // End this attempt on failure or expiry instead of retrying.
            // "never" also works with legacy Invisible keys.
            'refresh-expired': 'never',
            'refresh-timeout': 'never',
          }),
          callback: (token: string) => {
            if (cancelled || (singleAttempt && attemptEnded)) return
            attemptEnded = true
            clearTimeout(timeout)
            setFailed(false)
            callbacks.current.onVerify(token)
          },
          'error-callback': fail,
          'before-interactive-callback': () => clearTimeout(timeout),
          'unsupported-callback': () => fail('unsupported_browser'),
          'expired-callback': () => {
            attemptEnded = false
            fail('token_expired')
            if (!cancelled) callbacks.current.onExpire?.()
          },
          'timeout-callback': () => fail('interaction_timeout'),
        })
        if (widgetId === undefined) fail('widget_render_failed')
      })
      .catch(() => fail('script_load_failed'))
    return () => {
      cancelled = true
      clearTimeout(timeout)
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [
    siteKey,
    attempt,
    language,
    theme,
    appearance,
    action,
    cData,
    singleAttempt,
  ])

  return (
    <div className={cn('flex w-full flex-col items-center gap-2', className)}>
      <div ref={ref} />
      {failed && showError && (
        <div
          role='alert'
          className='flex flex-col items-center gap-2 text-center text-sm'
        >
          <p>{t('Security verification failed. Please try again.')}</p>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            {t('Retry verification')}
          </Button>
        </div>
      )}
    </div>
  )
}
