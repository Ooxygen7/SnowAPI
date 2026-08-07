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
import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

import { Main } from './main'
import { PageFooterProvider } from './page-footer'

type SlotProps = { children?: ReactNode }

function SectionPageLayoutTitle(_props: SlotProps) {
  return null
}
SectionPageLayoutTitle.displayName = 'SectionPageLayout.Title'

function SectionPageLayoutActions(_props: SlotProps) {
  return null
}
SectionPageLayoutActions.displayName = 'SectionPageLayout.Actions'

function SectionPageLayoutDescription(_props: SlotProps) {
  return null
}
SectionPageLayoutDescription.displayName = 'SectionPageLayout.Description'

function SectionPageLayoutContent(_props: SlotProps) {
  return null
}
SectionPageLayoutContent.displayName = 'SectionPageLayout.Content'

function SectionPageLayoutBreadcrumb(_props: SlotProps) {
  return null
}
SectionPageLayoutBreadcrumb.displayName = 'SectionPageLayout.Breadcrumb'

export type SectionPageLayoutProps = {
  children: ReactNode
  fixedContent?: boolean
  'data-visual-region'?: string
}

export function SectionPageLayout(props: SectionPageLayoutProps) {
  const [footerContainer, setFooterContainer] = useState<HTMLDivElement | null>(
    null
  )

  let title: ReactNode = null
  let actions: ReactNode = null
  let description: ReactNode = null
  let content: ReactNode = null
  let breadcrumb: ReactNode = null

  Children.forEach(props.children, (node) => {
    if (!isValidElement(node)) return
    const child = node as ReactElement<SlotProps>
    if (child.type === SectionPageLayoutTitle) {
      title = child.props.children
    } else if (child.type === SectionPageLayoutActions) {
      actions = child.props.children
    } else if (child.type === SectionPageLayoutDescription) {
      description = child.props.children
    } else if (child.type === SectionPageLayoutContent) {
      content = child.props.children
    } else if (child.type === SectionPageLayoutBreadcrumb) {
      breadcrumb = child.props.children
    }
  })

  const hasHeading =
    title != null ||
    description != null ||
    actions != null ||
    breadcrumb != null

  return (
    <PageFooterProvider container={footerContainer}>
      <Main
        data-visual-region={props['data-visual-region'] ?? 'section-page'}
        className='touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain md:touch-auto md:overflow-hidden'
      >
        {hasHeading ? (
          <div
            data-visual-region='page-heading'
            className='w-full shrink-0 px-4 pt-5 pb-5 sm:px-6 lg:px-8'
          >
            {breadcrumb != null && <div className='mb-3'>{breadcrumb}</div>}
            <div className='flex flex-wrap items-start justify-between gap-x-4 gap-y-3'>
              <div className='min-w-0 flex-1'>
                {title != null ? (
                  <h1 className='truncate text-xl leading-7 font-medium tracking-tight'>
                    {title}
                  </h1>
                ) : null}
                {description != null ? (
                  <p className='text-muted-foreground mt-1 text-xs leading-4'>
                    {description}
                  </p>
                ) : null}
              </div>
              {actions != null && (
                <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
                  {actions}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div
          className={
            props.fixedContent
              ? `w-full min-w-0 shrink-0 overflow-visible px-4 pb-6 md:min-h-0 md:flex-1 md:overflow-hidden md:px-6 lg:px-8 ${hasHeading ? 'pt-4' : ''}`
              : `w-full min-w-0 shrink-0 overflow-visible px-4 pb-8 md:min-h-0 md:flex-1 md:touch-pan-y md:[scrollbar-gutter:stable] md:overflow-x-hidden md:overflow-y-auto md:overscroll-contain md:px-6 lg:px-8 ${hasHeading ? 'pt-4' : ''}`
          }
          data-visual-region='page-content'
        >
          {content}
        </div>

        <div
          ref={setFooterContainer}
          className='bg-background w-full shrink-0 border-t px-4 py-2.5 empty:hidden sm:px-6 lg:px-8'
        />
      </Main>
    </PageFooterProvider>
  )
}

SectionPageLayout.Title = SectionPageLayoutTitle
SectionPageLayout.Actions = SectionPageLayoutActions
SectionPageLayout.Description = SectionPageLayoutDescription
SectionPageLayout.Content = SectionPageLayoutContent
SectionPageLayout.Breadcrumb = SectionPageLayoutBreadcrumb
