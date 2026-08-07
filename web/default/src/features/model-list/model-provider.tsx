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
import { getLobeIcon } from '@/lib/lobe-icon'

import type { CatalogModel } from './types'

export function ModelProvider(props: { model: CatalogModel }) {
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='bg-muted flex size-7 shrink-0 items-center justify-center rounded-md border'>
        {props.model.providerIcon ? (
          getLobeIcon(props.model.providerIcon, 16)
        ) : (
          <span className='text-muted-foreground text-[10px] font-semibold'>
            {props.model.provider.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className='truncate text-xs font-medium'>
        {props.model.provider}
      </span>
    </div>
  )
}
