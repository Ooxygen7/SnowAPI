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
import { ArrowLeft01Icon, ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { MinimalPublicShell } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { appPath } from '@/lib/deployment-mode'

import './legal.css'
import type { BuiltInLegalDocument } from './legal-documents'
import type { LegalDocumentResponse } from './types'

type LegalDocumentProps = {
  title: string
  queryKey: string
  fetchDocument?: () => Promise<LegalDocumentResponse>
  builtInDocument?: BuiltInLegalDocument
  sections?: RenderedLegalSection[]
  loading?: boolean
  emptyMessage?: string
}

type RenderedLegalSection = {
  id: string
  title: string
  paragraphs?: string[]
  markdown?: string
}

type LegalSectionCardProps = {
  section: RenderedLegalSection
  index: number
}

function LegalSectionCard(props: LegalSectionCardProps) {
  return (
    <section className='snowapi-legal-section rounded-2xl px-5 py-6 sm:px-8 sm:py-8'>
      <div className='flex items-baseline gap-4'>
        <span className='text-muted-foreground/60 font-mono text-[0.68rem]'>
          {String(props.index + 1).padStart(2, '0')}
        </span>
        <h2 className='text-lg font-semibold tracking-tight sm:text-xl'>
          {props.section.title}
        </h2>
      </div>
      <div className='text-muted-foreground mt-5 flex flex-col gap-4 text-sm leading-7 sm:text-[0.94rem] sm:leading-7'>
        {props.section.markdown !== undefined ? (
          <RichContent
            mode='markdown'
            content={props.section.markdown}
            className='prose-neutral dark:prose-invert max-w-none'
          />
        ) : (
          props.section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))
        )}
      </div>
    </section>
  )
}

function parseCustomMarkdown(title: string, content: string) {
  const lines = content.split(/\r?\n/)
  const sections: RenderedLegalSection[] = []
  let currentTitle = title
  let currentLines: string[] = []

  const commit = () => {
    const markdown = currentLines.join('\n').trim()
    if (!markdown && sections.length > 0) return
    sections.push({
      id: `custom-${sections.length + 1}`,
      title: currentTitle,
      markdown,
    })
  }

  lines.forEach((line) => {
    const heading = /^##\s+(.+)$/.exec(line)
    if (!heading) {
      currentLines.push(line)
      return
    }

    if (currentLines.some((item) => item.trim()) || sections.length > 0) {
      commit()
    }
    currentTitle = heading[1].trim()
    currentLines = []
  })
  commit()
  return sections
}

export function LegalDocument(props: LegalDocumentProps) {
  const { t } = useTranslation()
  const { history } = useRouter()
  const { data, isLoading: documentLoading } = useQuery({
    queryKey: [props.queryKey],
    queryFn: props.fetchDocument ?? skipToken,
    enabled: Boolean(props.fetchDocument) && !props.sections,
    staleTime: 10 * 60 * 1000,
  })
  const isLoading = props.loading ?? documentLoading

  const rawContent = data?.data?.trim() ?? ''
  const isExternal = rawContent.length > 0 && isHttpUrl(rawContent)
  const contentIsHtml = rawContent.length > 0 && isLikelyHtml(rawContent)
  const sections = useMemo<RenderedLegalSection[]>(() => {
    if (props.sections) return props.sections
    if (rawContent && !isExternal && !contentIsHtml) {
      return parseCustomMarkdown(props.title, rawContent)
    }

    return (props.builtInDocument?.sections ?? []).map((section) => ({
      id: section.id,
      title: t(section.titleKey),
      paragraphs: section.contentKeys.map((key) => t(key)),
    }))
  }, [
    contentIsHtml,
    isExternal,
    props.builtInDocument?.sections,
    props.sections,
    props.title,
    rawContent,
    t,
  ])

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      history.go(-1)
      return
    }
    window.location.assign(appPath('/'))
  }, [history])

  return (
    <MinimalPublicShell className='snowapi-legal-page' logoOnly>
      <div className='mx-auto w-full max-w-4xl pb-20 sm:pb-24'>
        <Button
          type='button'
          variant='ghost'
          className='mt-3 -ml-2 rounded-full px-3 text-xs'
          onClick={goBack}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          {t('Back')}
        </Button>

        <header className='max-w-3xl pt-10 pb-12 sm:pt-16 sm:pb-16'>
          <h1 className='text-3xl font-semibold tracking-[-0.035em] sm:text-5xl'>
            {props.title}
          </h1>
        </header>

        {isLoading ? <LoadingState className='min-h-[42svh]' /> : null}
        {!isLoading && sections.length === 0 && props.emptyMessage ? (
          <p className='text-muted-foreground'>{props.emptyMessage}</p>
        ) : null}

        {!isLoading && isExternal ? (
          <section className='snowapi-legal-section rounded-2xl p-6 sm:p-8'>
            <h2 className='text-xl font-semibold tracking-tight'>
              {props.title}
            </h2>
            <p className='text-muted-foreground mt-3 text-sm leading-7'>
              {t(
                'The administrator configured an external link for this document.'
              )}
            </p>
            <Button
              className='mt-6 rounded-full'
              render={
                <a
                  href={rawContent}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {t('View document')}
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} />
            </Button>
          </section>
        ) : null}

        {!isLoading && contentIsHtml ? (
          <div className='snowapi-legal-section overflow-hidden rounded-2xl p-1'>
            <RichContent
              mode='html'
              htmlVariant='isolated'
              content={rawContent}
            />
          </div>
        ) : null}

        {!isLoading && !isExternal && !contentIsHtml ? (
          <article className='snowapi-legal-stack'>
            {sections.map((section, index) => (
              <LegalSectionCard
                key={section.id}
                section={section}
                index={index}
              />
            ))}
          </article>
        ) : null}
      </div>
    </MinimalPublicShell>
  )
}
