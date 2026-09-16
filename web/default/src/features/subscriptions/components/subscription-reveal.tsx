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

import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

import { SubscriptionPack } from '../animation/subscription-pack'
import { useSubscriptionRevealStore } from '../subscription-reveal-store'

import './subscription-reveal.css'

export function SubscriptionReveal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const planTitle = useSubscriptionRevealStore((state) => state.planTitle)
  const tier = useSubscriptionRevealStore((state) => state.tier)
  const open = useSubscriptionRevealStore((state) => state.open)
  const close = useSubscriptionRevealStore((state) => state.close)

  useEffect(() => {
    // Leaving the authenticated console must not replay this for another login.
    return () => useSubscriptionRevealStore.getState().close()
  }, [])

  if (!planTitle) return null

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent
        className='snowapi-subscription-reveal inset-0 max-w-none translate-x-0 translate-y-0 rounded-none p-0 ring-0 sm:max-w-none'
        overlayClassName='snowapi-subscription-reveal-overlay'
        showCloseButton={false}
      >
        <Button
          className='snowapi-subscription-reveal-close'
          variant='ghost'
          size='icon-lg'
          aria-label={t('Close')}
          onClick={close}
        >
          <HugeiconsIcon icon={Cancel01Icon} aria-hidden='true' />
        </Button>
        <div className='snowapi-subscription-reveal-layout'>
          <header>
            <DialogTitle className='snowapi-subscription-reveal-title'>
              {t('Your {{plan}} is ready.', { plan: planTitle })}
            </DialogTitle>
          </header>
          <div className='snowapi-subscription-reveal-stage'>
            <SubscriptionPack
              key={planTitle}
              planTitle={planTitle}
              tier={tier}
            />
          </div>
          <footer className='snowapi-subscription-reveal-footer'>
            <DialogDescription>
              {t(
                'Your subscription benefits are now active. Enjoy what comes next.'
              )}
            </DialogDescription>
            <Button
              size='lg'
              onClick={() => {
                close()
                void navigate({ to: '/wallet' })
              }}
            >
              {t('View my subscription')}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}
