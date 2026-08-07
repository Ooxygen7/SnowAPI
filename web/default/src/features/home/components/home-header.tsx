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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconGithub } from '@/assets/brand-icons'
import { LanguageSwitcher } from '@/components/language-switcher'
import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { ThemeSwitch } from '@/components/theme-switch'

export function HomeHeader() {
  const { t } = useTranslation()

  return (
    <header className='snowapi-deeix-header'>
      <div className='snowapi-deeix-header-inner'>
        <a href='#home' className='snowapi-deeix-wordmark' aria-label='SnowAPI'>
          <SnowApiLogoMark />
        </a>

        <nav
          className='snowapi-deeix-header-actions'
          aria-label={t('Navigation')}
        >
          <a
            className='snowapi-deeix-icon-link snowapi-deeix-github-link'
            href='https://github.com/Ooxygen7/SnowAPI'
            target='_blank'
            rel='noreferrer'
            aria-label='GitHub'
          >
            <IconGithub aria-hidden='true' />
          </a>
          <ThemeSwitch />
          <LanguageSwitcher />
          <Link
            to='/sign-in'
            className='snowapi-deeix-login-link'
            aria-label={t('Sign in')}
          >
            <LogIn className='snowapi-deeix-login-icon' aria-hidden='true' />
            <span>{t('Sign in')}</span>
            <ArrowUpRight aria-hidden='true' />
          </Link>
        </nav>
      </div>
    </header>
  )
}
