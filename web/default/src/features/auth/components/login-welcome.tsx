/*
Copyright (C) 2023-2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useLoginTransition } from '@/stores/login-transition-store'

import './login-welcome.css'

export function LoginWelcomeBoundary(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const { phase, username, entranceComplete, reset } = useLoginTransition()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase === 'idle') return
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    if (phase === 'welcome') {
      headingRef.current?.focus({ preventScroll: true })
      // The last segment finishes at 1.2s; hold for another half second.
      const timer = setTimeout(() => entranceComplete?.(), reduced ? 500 : 1700)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(reset, reduced ? 0 : 350)
    return () => clearTimeout(timer)
  }, [phase, entranceComplete, reset])

  return (
    <>
      <div
        className='contents'
        inert={phase !== 'idle'}
        aria-hidden={phase !== 'idle' || undefined}
      >
        {props.children}
      </div>
      {phase !== 'idle' && (
        <div className='snowapi-login-welcome' data-phase={phase}>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className='snowapi-login-welcome-heading'
            aria-label={t('Welcome back, {{name}}!', { name: username })}
          >
            <span aria-hidden='true'>
              <span className='snowapi-login-welcome-segment'>
                {t('Welcome greeting')}
              </span>
              <span className='snowapi-login-welcome-segment'>
                {t('Welcome return')}
              </span>
            </span>
            <span
              className='snowapi-login-welcome-segment snowapi-login-welcome-name'
              aria-hidden='true'
            >
              {username}!
            </span>
          </h1>
        </div>
      )}
    </>
  )
}
