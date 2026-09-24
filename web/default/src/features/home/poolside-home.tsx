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
import { ArrowRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { SnowApiLogoMark } from '@/components/snowapi-logo-mark'
import { ThemeSwitch } from '@/components/theme-switch'
import { PublicResourceLinks } from '@/features/legal/public-resource-links'

import { GatewayShowcase } from './components/gateway-showcase'
import { HomeArtwork } from './components/home-artwork'
import { PlatformArtwork } from './components/platform-artwork'
import { StripedWordmark } from './components/striped-wordmark'

import './poolside-home.css'

export default function PoolsideHome() {
  const { t } = useTranslation()
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
            <PublicResourceLinks />
          </nav>
        </header>
        <main id='snow-home-content' className='snow-home-main'>
          <section className='snow-home-hero' aria-labelledby='snow-home-title'>
            <h1 id='snow-home-title'>
              <Trans
                i18nKey='Leading AI models, together in the SnowAPI <beta>beta</beta> gateway.'
                components={{
                  beta: (
                    <span className='snow-home-chip'>
                      <b />
                    </span>
                  ),
                }}
              />
            </h1>
            <div className='snow-home-hero-actions'>
              <Link
                className='snow-home-button snow-home-button-primary'
                to='/sign-in'
              >
                {t('Get started with SnowAPI')}
                <ArrowRight size={14} aria-hidden='true' />
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
            <article className='snow-home-feature-card'>
              <HomeArtwork kind='polyhedron' />
              <div className='snow-home-card-content'>
                <h3>{t('Automate your workflow with SnowAPI')}</h3>
                <p>
                  {t(
                    'Connect your tools and automate your workflow with SnowAPI.'
                  )}
                </p>
              </div>
            </article>
            <div className='snow-home-resource-grid'>
              <article className='snow-home-resource-card'>
                <h3>{t('Create and manage your API keys')}</h3>
                <p>
                  {t(
                    'Give every application its own key. Set an expiry, spending cap, model restrictions and IP allowlist; disable or replace a key without interrupting your other projects.'
                  )}
                </p>
              </article>
              <article className='snow-home-resource-card'>
                <h3>{t('Follow model health in real time')}</h3>
                <p>
                  {t(
                    'Explore 24 hourly success rates from real requests across the site. Colors reveal changes at a glance; hover over any hour for its result. Hours without requests remain unknown.'
                  )}
                </p>
              </article>
              <article className='snow-home-resource-card'>
                <h3>{t('Understand every request with usage logs')}</h3>
                <p>
                  {t(
                    'Filter requests by time, model or API key. Review token usage, latency and charges, and inspect billing details to trace spending and diagnose failed requests.'
                  )}
                </p>
              </article>
            </div>
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
              <article className='snow-home-platform-card'>
                <PlatformArtwork kind='contours' />
                <div className='snow-home-card-content'>
                  <h3>SnowEvent</h3>
                  <p>{t('Choose a subscription that fits your workflow')}</p>
                </div>
              </article>
              <article className='snow-home-platform-card'>
                <PlatformArtwork kind='canopy' />
                <div className='snow-home-card-content'>
                  <h3>{t('Privacy and security')}</h3>
                  <p>{t('Manage your account and security')}</p>
                </div>
              </article>
              <article className='snow-home-platform-card'>
                <PlatformArtwork kind='puzzle' />
                <div className='snow-home-card-content'>
                  <h3>{t('Build with us.')}</h3>
                  <p>{t('Explore the SnowAPI source code')}</p>
                </div>
              </article>
            </div>
          </section>
        </main>
        <footer className='snow-home-footer'>
          <nav aria-label={t('Footer navigation')}>
            <PublicResourceLinks />
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
