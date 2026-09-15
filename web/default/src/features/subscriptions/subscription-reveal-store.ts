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

import { create } from 'zustand'

interface SubscriptionRevealState {
  planTitle: string | null
  open: boolean
  show: (planTitle: string) => void
  close: () => void
}

// Ephemeral purchase feedback: never replay on refresh or restore from storage.
export const useSubscriptionRevealStore = create<SubscriptionRevealState>(
  (set) => ({
    planTitle: null,
    open: false,
    show: (planTitle) => set({ planTitle, open: true }),
    close: () => set({ open: false }),
  })
)
