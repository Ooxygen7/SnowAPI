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
import { Loader2, Send, Shield, UserRound, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SiGithub, SiLinux, SiWechat } from 'react-icons/si'

import { MinimalPublicShell } from '@/components/layout'

type OAuthCallbackScreenProps = {
  provider: string
  mode: 'login' | 'bind'
}

type ProviderMeta = {
  label: string
  Icon: LucideIcon | ((props: { className?: string }) => React.JSX.Element)
}

const providerDictionary: Record<string, ProviderMeta> = {
  github: {
    label: 'GitHub',
    Icon: (props: { className?: string }) => (
      <SiGithub className={props.className} focusable='false' />
    ),
  },
  oidc: { label: 'OIDC', Icon: Shield },
  linuxdo: {
    label: 'LinuxDO',
    Icon: (props: { className?: string }) => (
      <SiLinux className={props.className} focusable='false' />
    ),
  },
  telegram: { label: 'Telegram', Icon: Send },
  wechat: {
    label: 'WeChat',
    Icon: (props: { className?: string }) => (
      <SiWechat className={props.className} focusable='false' />
    ),
  },
}

export function OAuthCallbackScreen({
  provider,
  mode,
}: OAuthCallbackScreenProps) {
  const { t } = useTranslation()
  const { label, Icon } = useMemo(() => {
    const normalized = provider?.toLowerCase() ?? ''
    return (
      providerDictionary[normalized] || {
        label: 'account',
        Icon: UserRound,
      }
    )
  }, [provider])

  const providerLabel = t(label)
  const isBindMode = mode === 'bind'

  const headline = isBindMode
    ? t('Binding your {{provider}} account', { provider: providerLabel })
    : t('Signing you in with {{provider}}', { provider: providerLabel })

  const description = isBindMode
    ? t('Hang tight while we securely link this account to your profile.')
    : t('Hang tight while we finish connecting your account.')

  const secondaryNote = isBindMode
    ? t(
        'You can close this tab once the binding completes or a success message appears in the original window.'
      )
    : t(
        "You'll be redirected automatically. You can return to the previous page if nothing happens after a few seconds."
      )

  return (
    <MinimalPublicShell
      tone='dark'
      contentClassName='flex items-center justify-center'
    >
      <section className='w-full max-w-lg rounded-2xl bg-[var(--snowapi-public-surface)] px-6 py-7 sm:px-9 sm:py-9'>
        <div className='flex items-center gap-3'>
          <div className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--snowapi-public-surface-strong)]'>
            <Icon className='size-5' aria-hidden='true' />
          </div>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-xs'>{providerLabel}</p>
            <h1 className='mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl'>
              {headline}
            </h1>
          </div>
        </div>

        <p className='text-muted-foreground mt-5 text-sm leading-6'>
          {description}
        </p>

        <div className='mt-7 rounded-xl bg-[var(--snowapi-public-surface-strong)] px-4 py-3.5'>
          <div className='flex items-center gap-2 text-sm font-medium'>
            <Loader2 className='size-4 animate-spin' aria-hidden='true' />
            <span>{t('Processing OAuth response...')}</span>
          </div>
        </div>

        <p className='text-muted-foreground mt-5 text-xs leading-5'>
          {secondaryNote}
        </p>
        <p className='text-muted-foreground mt-2 text-xs leading-5'>
          {t(
            'This may take a few moments while we validate the request and update your session.'
          )}
        </p>
      </section>
    </MinimalPublicShell>
  )
}
