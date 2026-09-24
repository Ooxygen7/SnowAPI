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
import { lazy, Suspense } from 'react'

import { useStatus } from '@/hooks/use-status'

const PoolsideHome = lazy(() => import('./poolside-home'))
const SnowflakeHome = lazy(() => import('./snowflake-home'))

export function Home() {
  const { status, loading } = useStatus()
  if (loading) {
    return <div className='bg-background min-h-dvh' aria-busy='true' />
  }

  return (
    <Suspense
      fallback={<div className='bg-background min-h-dvh' aria-busy='true' />}
    >
      {status?.home_design === 'snowflake' ? (
        <SnowflakeHome />
      ) : (
        <PoolsideHome />
      )}
    </Suspense>
  )
}
