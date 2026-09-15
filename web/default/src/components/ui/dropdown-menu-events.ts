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
import type * as React from 'react'

export type DropdownMenuItemSelectEvent = React.MouseEvent<HTMLElement> & {
  preventBaseUIHandler?: () => void
}

export type DropdownMenuItemSelectHandler = (
  event: DropdownMenuItemSelectEvent
) => void

export function handleDropdownMenuItemSelect(
  event: DropdownMenuItemSelectEvent,
  onClick?: React.MouseEventHandler<HTMLElement>,
  onSelect?: DropdownMenuItemSelectHandler
) {
  // Base UI prevents the native Enter/Space action before invoking onClick on
  // non-button menu items. Only a consumer's cancellation should stop selection.
  const keyboardActivation = event.type === 'keydown' || event.type === 'keyup'
  let selectionPrevented = event.defaultPrevented && !keyboardActivation
  const preventDefault = event.preventDefault
  event.preventDefault = () => {
    selectionPrevented = true
    preventDefault.call(event)
  }

  try {
    onClick?.(event)

    if (!selectionPrevented) {
      onSelect?.(event)
    }

    if (selectionPrevented) {
      event.preventBaseUIHandler?.()
    }
  } finally {
    event.preventDefault = preventDefault
  }
}
