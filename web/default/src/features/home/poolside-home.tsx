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
import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { ThemeSwitch } from '@/components/theme-switch'
import { useStatus } from '@/hooks/use-status'

import { GatewayShowcase } from './components/gateway-showcase'
import { HomeArtwork } from './components/home-artwork'
import { PlatformArtwork } from './components/platform-artwork'
import { StripedWordmark } from './components/striped-wordmark'

import './poolside-home.css'

export default function PoolsideHome() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className='snow-poolside-home'>
      <a href='#snow-home-content' className='snow-home-skip'>
        {t('Skip to content')}
      </a>
      <div className='snow-home-shell'>
        <header
          className='snow-home-header'
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenuOpen(false)
          }}
        >
          <Link to='/' className='snow-home-brand' aria-label='SnowAPI'>
            <SnowApiLogoMark />
            <span>SnowAPI</span>
          </Link>
          <button
            type='button'
            className='snow-home-menu-toggle'
            aria-expanded={menuOpen}
            aria-controls='snow-home-nav'
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? t('Close') : t('Menu')}
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <nav
            id='snow-home-nav'
            className='snow-home-nav'
            data-open={menuOpen}
            aria-label={t('Navigation')}
            onClick={() => setMenuOpen(false)}
          >
            <Link to='/model-list'>{t('Models')}</Link>
            <Link to='/sign-in'>{t('Get started')}</Link>
            <a href='#developers'>{t('Developers')}</a>
            <a href='#platform'>{t('Platform')}</a>
            <Link to='/auto-access'>{t('Docs')}</Link>
            <a
              href='https://github.com/Ooxygen7/SnowAPI'
              target='_blank'
              rel='noreferrer'
            >
              GitHub
            </a>
          </nav>
        </header>

        <main id='snow-home-content' className='snow-home-main'>
          <section className='snow-home-hero' aria-labelledby='snow-home-title'>
            <h1 id='snow-home-title'>
              {t('Build with leading AI models,')}{' '}
              <Link to='/model-list' className='snow-home-model-link'>
                DeepSeek{' '}
                <span className='snow-home-chip'>
                  <b>V4.1</b>
                  <span>Flash</span>
                </span>
              </Link>{' '}
              {t('and')}{' '}
              <Link to='/model-list' className='snow-home-model-link'>
                GLM{' '}
                <span className='snow-home-chip snow-home-chip-pink'>
                  <b>5.3</b>
                </span>
              </Link>{' '}
              {t('through one SnowAPI gateway.')}
            </h1>
            <div className='snow-home-hero-actions'>
              <Link
                className='snow-home-button snow-home-button-primary'
                to='/sign-in'
              >
                {t('Get started with SnowAPI')}
                <ArrowRight size={14} aria-hidden='true' />
              </Link>
              <Link className='snow-home-button' to='/model-list'>
                {t('Explore models')}
                <ArrowUpRight size={14} aria-hidden='true' />
              </Link>
              <Link className='snow-home-button' to='/auto-access'>
                {t('Read the documentation')}
                <ArrowUpRight size={14} aria-hidden='true' />
              </Link>
            </div>
            <GatewayShowcase />
          </section>

          <section
            id='developers'
            className='snow-home-section'
            aria-labelledby='snow-developers-title'
          >
            <h2 id='snow-developers-title'>
              {t('Built for your next idea.')}{' '}
              <span>
                {t(
                  'A closer look at the APIs, the tools, and the details behind every request.'
                )}
              </span>
            </h2>
            <Link to='/auto-access' className='snow-home-feature-card'>
              <HomeArtwork kind='polyhedron' />
              <div className='snow-home-card-content'>
                <h3>{t('Automate your workflow with SnowAPI')}</h3>
                <p>
                  {t(
                    'Connect your tools and automate your workflow with SnowAPI.'
                  )}
                </p>
                <span className='snow-home-card-meta'>
                  {t('Docs')} <ArrowUpRight size={14} />
                </span>
              </div>
            </Link>
            <div className='snow-home-resource-grid'>
              <Link to='/keys' className='snow-home-resource-card'>
                <span className='snow-home-eyebrow'>01 / API</span>
                <h3>{t('Create and manage your API keys')}</h3>
                <span className='snow-home-card-meta'>
                  {t('Get started')}
                  <ArrowUpRight size={14} />
                </span>
              </Link>
              <Link to='/model-list' className='snow-home-resource-card'>
                <span className='snow-home-eyebrow'>02 / API</span>
                <h3>{t('Follow model health in real time')}</h3>
                <span className='snow-home-card-meta'>
                  {t('Models')}
                  <ArrowUpRight size={14} />
                </span>
              </Link>
              <Link to='/usage-logs' className='snow-home-resource-card'>
                <span className='snow-home-eyebrow'>03 / API</span>
                <h3>{t('Understand every request with usage logs')}</h3>
                <span className='snow-home-card-meta'>
                  {t('Usage logs')}
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            </div>
            <Link className='snow-home-section-link' to='/auto-access'>
              {t('Read the documentation')}
              <ArrowRight size={16} />
            </Link>
          </section>

          <section
            id='platform'
            className='snow-home-section'
            aria-labelledby='snow-platform-title'
          >
            <h2 id='snow-platform-title'>
              {t('Go further with SnowAPI.')}{' '}
              <span>
                {t(
                  'A place for your models, your workflow, and what comes next.'
                )}
              </span>
            </h2>
            <div className='snow-home-platform-grid'>
              <Link to='/wallet' className='snow-home-platform-card'>
                <PlatformArtwork kind='contours' />
                <div className='snow-home-card-content'>
                  <h3>SnowEvent</h3>
                  <p>{t('Choose a subscription that fits your workflow')}</p>
                  <span className='snow-home-card-meta'>
                    {t('Subscriptions')}
                    <ArrowUpRight size={14} />
                  </span>
                </div>
              </Link>
              <Link to='/privacy-policy' className='snow-home-platform-card'>
                <PlatformArtwork kind='canopy' />
                <div className='snow-home-card-content'>
                  <h3>{t('Privacy and security')}</h3>
                  <p>{t('Manage your account and security')}</p>
                  <span className='snow-home-card-meta'>
                    {t('Privacy Policy')}
                    <ArrowUpRight size={14} />
                  </span>
                </div>
              </Link>
              <a
                href='https://github.com/Ooxygen7/SnowAPI'
                target='_blank'
                rel='noreferrer'
                className='snow-home-platform-card'
              >
                <PlatformArtwork kind='puzzle' />
                <div className='snow-home-card-content'>
                  <h3>{t('Build with us.')}</h3>
                  <p>{t('Explore the SnowAPI source code')}</p>
                  <span className='snow-home-card-meta'>
                    GitHub
                    <ArrowUpRight size={14} />
                  </span>
                </div>
              </a>
            </div>
          </section>
        </main>

        <footer className='snow-home-footer'>
          <nav aria-label={t('Footer navigation')}>
            <a href='#platform'>{t('Platform')}</a>
            <Link to='/auto-access'>{t('Docs')}</Link>
            {status?.faq_enabled ? <Link to='/faq'>{t('FAQ')}</Link> : null}
            <Link to='/privacy-policy'>{t('Privacy Policy')}</Link>
            <Link to='/user-agreement'>{t('Terms of Service')}</Link>
            <div className='snow-home-preferences'>
              <ThemeSwitch />
              <LanguageSwitcher />
            </div>
            <a href='https://unsnow.org' target='_blank' rel='noreferrer'>
              © {new Date().getFullYear()} unsnow.org
            </a>
          </nav>
          <StripedWordmark />
        </footer>
      </div>
    </div>
  )
}
