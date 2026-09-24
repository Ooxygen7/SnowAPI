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

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { MinimalPublicShell } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { ThemeSwitch } from '@/components/theme-switch'
import { useFAQ } from '@/features/dashboard/hooks/use-status-data'

import { useAutoAccessSections } from './auto-access'
import { PublicResourceLinks } from './public-resource-links'
import { useUserGuideSections } from './user-guide-content'

import './legal.css'
import './user-guide.css'

export function UserGuide() {
  const { t } = useTranslation()
  const guide = useUserGuideSections()
  const automation = useAutoAccessSections()
  const faq = useFAQ()
  const [active, setActive] = useState('welcome')
  const sections = [
    ...guide,
    {
      id: 'examples',
      title: t('Request examples'),
      markdown: [
        t(
          'Use environment variables for secrets. Replace MODEL_ID with an available model. Set SNOWAPI_BASE_URL to the configured OpenAI-compatible address including /v1. These examples send one real request and may incur a charge.'
        ),
        '```bash\ncurl "$SNOWAPI_BASE_URL/chat/completions" \\\n  -H "Authorization: Bearer $SNOWAPI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"MODEL_ID","messages":[{"role":"user","content":"Hello"}],"stream":false}\'\n```',
        '```python\nimport os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ["SNOWAPI_API_KEY"],\n    base_url=os.environ["SNOWAPI_BASE_URL"],\n)\nreply = client.chat.completions.create(\n    model="MODEL_ID",\n    messages=[{"role": "user", "content": "Hello"}],\n)\nprint(reply.choices[0].message.content)\n```',
        t(
          'For streaming, set stream to true and consume SSE events until completion. A browser address bar cannot send this authenticated POST request. In PowerShell use curl.exe; adapt shell quoting and environment-variable syntax. Install the OpenAI Python package before using the Python example.'
        ),
      ].join('\n\n'),
    },
    {
      id: 'automatic-access',
      title: t('Automatic Access'),
      markdown: t(
        'Model API keys call models; Automatic Access tokens manage your own account. The following reference covers only ordinary-user endpoints. No administrator token is required.'
      ),
    },
    ...automation,
    {
      id: 'faq',
      title: t('Frequently Asked Questions'),
      markdown: faq.loading
        ? t('Loading...')
        : t(
            'Common answers are collected here together with the site administrator’s published FAQ.'
          ),
    },
    ...faq.items
      .filter((item) => item.question?.trim() && item.answer?.trim())
      .map((item, index) => ({
        id: `faq-${index}`,
        title: item.question,
        markdown: item.answer,
      })),
  ]
  const ids = sections.map((section) => section.id).join('|')
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -65% 0px' }
    )
    for (const id of ids.split('|')) {
      const element = document.querySelector(`#${CSS.escape(id)}`)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids])
  useEffect(() => {
    const goToHash = () => {
      const id = window.location.hash.slice(1)
      if (id) document.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView()
    }
    const frame = requestAnimationFrame(goToHash)
    window.addEventListener('hashchange', goToHash)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', goToHash)
    }
  }, [])
  const contents = (
    <nav aria-label={t('On this page')}>
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          aria-current={active === section.id ? 'location' : undefined}
          onClick={() => setActive(section.id)}
        >
          {section.title}
        </a>
      ))}
    </nav>
  )
  return (
    <MinimalPublicShell
      logoOnly
      className='snowapi-legal-page snowapi-guide-page'
      contentClassName='snowapi-guide-layout'
    >
      <aside className='snowapi-guide-sidebar'>
        <div className='snowapi-guide-preferences'>
          <ThemeSwitch />
          <LanguageSwitcher />
        </div>
        <p className='snowapi-guide-index-label'>{t('On this page')}</p>
        {contents}
        <nav className='snowapi-guide-resources' aria-label={t('Navigation')}>
          <PublicResourceLinks />
        </nav>
      </aside>
      <div className='snowapi-guide-content'>
        <div className='snowapi-guide-mobile-preferences'>
          <ThemeSwitch />
          <LanguageSwitcher />
        </div>
        <header className='snowapi-guide-heading'>
          <p>SnowAPI</p>
          <h1>{t('SnowAPI user guide')}</h1>
        </header>
        <details className='snowapi-guide-mobile-index'>
          <summary>{t('On this page')}</summary>
          {contents}
        </details>
        <article>
          {sections.map((section) => (
            <section
              id={section.id}
              key={section.id}
              className='snowapi-guide-section'
            >
              <h2>{section.title}</h2>
              <RichContent
                mode='markdown'
                content={section.markdown}
                className='prose-neutral dark:prose-invert max-w-none'
              />
            </section>
          ))}
        </article>
        <footer className='snowapi-guide-footer'>
          <PublicResourceLinks />
        </footer>
      </div>
    </MinimalPublicShell>
  )
}
