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
'use client'

import {
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Alert02Icon,
  MultiplicationSignCircleIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useTheme } from '@/context/theme-provider'

const Toaster = (props: ToasterProps) => {
  const { resolvedTheme } = useTheme()
  const neutralBackground =
    resolvedTheme === 'dark' ? 'oklch(0.22 0 0)' : 'oklch(0.985 0 0)'
  const neutralBorder =
    resolvedTheme === 'dark' ? 'oklch(1 0 0 / 16%)' : 'oklch(0.18 0 0 / 18%)'
  const neutralText =
    resolvedTheme === 'dark' ? 'oklch(0.96 0 0)' : 'oklch(0.18 0 0)'

  return (
    <Sonner
      theme={resolvedTheme}
      className='toaster group'
      icons={{
        success: (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            className='size-4'
          />
        ),
        info: (
          <HugeiconsIcon
            icon={InformationCircleIcon}
            strokeWidth={2}
            className='size-4'
          />
        ),
        warning: (
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className='size-4'
          />
        ),
        error: (
          <HugeiconsIcon
            icon={MultiplicationSignCircleIcon}
            strokeWidth={2}
            className='size-4'
          />
        ),
        loading: (
          <HugeiconsIcon
            icon={Loading03Icon}
            strokeWidth={2}
            className='size-4 animate-spin'
          />
        ),
      }}
      style={
        {
          '--normal-bg': neutralBackground,
          '--normal-text': neutralText,
          '--normal-border': neutralBorder,
          '--success-bg': neutralBackground,
          '--success-border': neutralBorder,
          '--success-text': 'var(--success)',
          '--info-bg': neutralBackground,
          '--info-border': neutralBorder,
          '--info-text': 'var(--info)',
          '--warning-bg': neutralBackground,
          '--warning-border': neutralBorder,
          '--warning-text': 'var(--warning)',
          '--error-bg': neutralBackground,
          '--error-border': neutralBorder,
          '--error-text': 'var(--destructive)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
