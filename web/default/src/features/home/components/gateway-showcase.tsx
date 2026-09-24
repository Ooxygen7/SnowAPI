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
import { Code2, LayoutDashboard, Terminal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'

export function GatewayShowcase() {
  const { t } = useTranslation()
  const [view, setView] = useState<'terminal' | 'console'>('terminal')
  const endpoint = `${window.location.origin}/v1/chat/completions`

  return (
    <div className='snow-home-showcase'>
      <div className='snow-home-demo-window'>
        <div className='snow-home-window-bar'>
          <span className='snow-home-window-dots' aria-hidden='true'>
            <i />
            <i />
            <i />
          </span>
          <span>snowapi — {view === 'terminal' ? 'API' : t('Console')}</span>
          <span className='snow-home-preview-label'>{t('Preview')}</span>
        </div>
        <div
          role='tabpanel'
          id='snow-home-demo-panel'
          aria-labelledby={`snow-home-demo-${view}`}
          className='snow-home-demo-panel'
          tabIndex={0}
        >
          {view === 'terminal' ? (
            <div className='snow-home-terminal' key='terminal'>
              <p>
                <strong>snowapi</strong> / API
              </p>
              <p className='snow-home-terminal-muted'>
                {t('Your models. One API.')}
              </p>
              <pre className='snow-home-terminal-code'>
                <code>
                  <span>curl {endpoint} \</span>
                  {'\n'}
                  <span>
                    {' '}
                    -H <em>'Authorization: Bearer $SNOWAPI_KEY'</em> \
                  </span>
                  {'\n'}
                  <span>
                    {' '}
                    -H <em>'Content-Type: application/json'</em> \
                  </span>
                  {'\n'}
                  <span> -d '{'{'}</span>
                  {'\n'}
                  <span>
                    {' '}
                    <em>"model"</em>: <em>"deepseek-v4.1-flash"</em>,
                  </span>
                  {'\n'}
                  <span>
                    {' '}
                    <em>"messages"</em>: [
                  </span>
                  {'\n'}
                  <span>
                    {' '}
                    {'{'}
                    <em>"role"</em>: <em>"user"</em>, <em>"content"</em>:{' '}
                    <em>"Hello, SnowAPI."</em>
                    {'}'}
                  </span>
                  {'\n'}
                  <span> ]</span>
                  {'\n'}
                  <span> {'}'}'</span>
                </code>
              </pre>
              <div className='snow-home-terminal-prompt' aria-hidden='true'>
                › <span />
              </div>
            </div>
          ) : (
            <div className='snow-home-console-preview' key='console'>
              <aside aria-hidden='true'>
                <SnowApiLogoMark />
                <span>▦</span>
                <span>⌘</span>
                <span>≡</span>
              </aside>
              <div className='snow-home-console-content'>
                <span className='snow-home-eyebrow'>SNOW API</span>
                <h3>{t('Your console, at a glance')}</h3>
                <div className='snow-home-demo-metrics'>
                  <div>
                    <span>{t('Models')}</span>
                    <b>DeepSeek · GLM</b>
                  </div>
                  <div>
                    <span>{t('API keys')}</span>
                    <b>sk-••••••••</b>
                  </div>
                </div>
                <div className='snow-home-demo-chart' aria-hidden='true'>
                  <svg viewBox='0 0 600 100' preserveAspectRatio='none'>
                    <path
                      d='M0 90H600M0 60H600M0 30H600'
                      className='snow-home-chart-grid'
                    />
                    <path d='M0 90L35 85 55 87 95 60 130 72 175 65 205 35 240 56 280 47 320 55 360 22 395 38 420 23 465 33 500 10 535 22 565 15 600 5' />
                  </svg>
                </div>
                <div className='snow-home-demo-model-row'>
                  <span>deepseek-v4.1-flash</span>
                  <Code2 size={14} />
                </div>
                <div className='snow-home-demo-model-row'>
                  <span>glm-5.3</span>
                  <Code2 size={14} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        className='snow-home-demo-dock'
        role='tablist'
        aria-label={t('Interface preview')}
      >
        <button
          type='button'
          role='tab'
          id='snow-home-demo-terminal'
          aria-selected={view === 'terminal'}
          aria-controls='snow-home-demo-panel'
          tabIndex={view === 'terminal' ? 0 : -1}
          onClick={() => setView('terminal')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault()
              setView('console')
              document
                .querySelector<HTMLButtonElement>('#snow-home-demo-console')
                ?.focus()
            }
          }}
        >
          <span className='snow-home-dock-terminal'>
            <Terminal size={30} />
          </span>
          <span className='snow-home-dock-label'>{t('Terminal')}</span>
        </button>
        <button
          type='button'
          role='tab'
          id='snow-home-demo-console'
          aria-selected={view === 'console'}
          aria-controls='snow-home-demo-panel'
          tabIndex={view === 'console' ? 0 : -1}
          onClick={() => setView('console')}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault()
              setView('terminal')
              document
                .querySelector<HTMLButtonElement>('#snow-home-demo-terminal')
                ?.focus()
            }
          }}
        >
          <span className='snow-home-dock-console'>
            <LayoutDashboard size={30} />
          </span>
          <span className='snow-home-dock-label'>{t('Console')}</span>
        </button>
      </div>
    </div>
  )
}
