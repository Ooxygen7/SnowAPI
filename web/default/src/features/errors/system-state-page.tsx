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
import { MinimalPublicShell } from '@/components/layout'
import { cn } from '@/lib/utils'

type SystemStatePageProps = {
  code?: number
  title: React.ReactNode
  description: React.ReactNode
  note?: React.ReactNode
  actions?: React.ReactNode
  minimal?: boolean
  className?: string
}

export function SystemStatePage(props: SystemStatePageProps) {
  const content = (
    <section
      className={cn(
        'w-full max-w-xl rounded-2xl bg-[var(--snowapi-public-surface)] px-6 py-7 sm:px-9 sm:py-9',
        props.className
      )}
    >
      {props.code != null ? (
        <p className='text-muted-foreground font-mono text-xs tracking-[0.18em]'>
          {props.code}
        </p>
      ) : null}
      <h1 className='mt-5 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl'>
        {props.title}
      </h1>
      <div className='text-muted-foreground mt-3 text-sm leading-6'>
        {props.description}
      </div>
      {props.note != null ? (
        <p className='text-muted-foreground mt-5 text-xs leading-5'>
          {props.note}
        </p>
      ) : null}
      {props.actions != null ? (
        <div className='mt-8 flex flex-wrap gap-2'>{props.actions}</div>
      ) : null}
    </section>
  )

  if (props.minimal) return content

  return (
    <MinimalPublicShell contentClassName='flex items-center justify-center'>
      {content}
    </MinimalPublicShell>
  )
}
