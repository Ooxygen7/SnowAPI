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

import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

import './minimal-public-shell.css'

type MinimalPublicShellProps = {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  tone?: 'default' | 'dark'
  logoOnly?: boolean
}

export function MinimalPublicShell(props: MinimalPublicShellProps) {
  const { systemName } = useSystemConfig()

  return (
    <div
      className={cn(
        'snowapi-minimal-public-shell',
        props.tone === 'dark' && 'snowapi-minimal-public-shell-dark',
        props.className
      )}
    >
      <header className='snowapi-minimal-public-header'>
        <Link
          to='/'
          className='snowapi-minimal-public-brand'
          aria-label={systemName}
        >
          <SnowApiLogoMark className='size-6 dark:invert' />
          {!props.logoOnly && <span>{systemName}</span>}
        </Link>
      </header>
      <main
        className={cn('snowapi-minimal-public-content', props.contentClassName)}
      >
        {props.children}
      </main>
    </div>
  )
}
