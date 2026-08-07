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
import { Languages, Palette, SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { ThemeSwitch } from '@/components/theme-switch'
import { IconBadge } from '@/components/ui/icon-badge'
import { TitledCard } from '@/components/ui/titled-card'

export function ProfilePreferencesCard() {
  const { t } = useTranslation()
  const preferences = [
    {
      key: 'language',
      icon: Languages,
      label: t('Interface Language'),
      control: <LanguageSwitcher />,
    },
    {
      key: 'theme',
      icon: Palette,
      label: t('Theme'),
      control: <ThemeSwitch />,
    },
  ]

  return (
    <TitledCard
      title={t('Preferences')}
      icon={<SlidersHorizontal className='size-4' />}
      iconTone='neutral'
      disableHoverEffect
    >
      <div className='grid gap-2.5 sm:grid-cols-2 sm:gap-3'>
        {preferences.map((preference) => (
          <div
            key={preference.key}
            className='bg-muted/45 flex min-h-20 items-center justify-between gap-3 rounded-lg p-4'
          >
            <div className='flex min-w-0 items-center gap-3'>
              <IconBadge tone='neutral' size='sm'>
                <preference.icon />
              </IconBadge>
              <p className='truncate text-sm font-medium'>{preference.label}</p>
            </div>
            <div className='shrink-0'>{preference.control}</div>
          </div>
        ))}
      </div>
    </TitledCard>
  )
}
