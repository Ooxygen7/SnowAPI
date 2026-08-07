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
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const fallbackLogo = '/snowapi-theme/unsnow-favicon.png?v=20260717-1'

type SnowApiLogoMarkProps = Omit<ComponentProps<'img'>, 'alt' | 'src'>

export function SnowApiLogoMark({ className, ...props }: SnowApiLogoMarkProps) {
  const source =
    typeof document === 'undefined'
      ? fallbackLogo
      : (document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ??
        fallbackLogo)

  return (
    <img
      {...props}
      src={source}
      alt=''
      aria-hidden='true'
      className={cn('object-contain', className)}
    />
  )
}
