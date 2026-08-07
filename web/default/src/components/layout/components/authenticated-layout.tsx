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
import { useLayoutEffect } from 'react'

import { SearchProvider } from '@/context/search-provider'
import { RelayBanToastProvider } from '@/features/ip-audit/ban-toast-provider'

import { AstryxAppShell } from './astryx-app-shell'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  useLayoutEffect(() => {
    document.body.dataset.snowapiConsole = 'true'

    return () => {
      delete document.body.dataset.snowapiConsole
    }
  }, [])

  return (
    <SearchProvider>
      <RelayBanToastProvider />
      <AstryxAppShell>{props.children}</AstryxAppShell>
    </SearchProvider>
  )
}
