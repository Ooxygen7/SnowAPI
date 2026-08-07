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
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HomeHeader } from './components/home-header'
import { SnowflakeCanvas } from './components/snowflake-canvas'

import './home.css'

export function Home() {
  const { t } = useTranslation()

  return (
    <main className='snowapi-deeix-home'>
      <HomeHeader />

      <section id='home' className='snowapi-deeix-hero'>
        <div className='snowapi-deeix-ambient-particles' aria-hidden='true'>
          <span />
          <span />
        </div>
        <div className='snowapi-deeix-container snowapi-deeix-hero-layout'>
          <div className='snowapi-deeix-hero-copy'>
            <h1>
              <span className='snowapi-deeix-title'>SNOW API</span>
              <span className='snowapi-deeix-subtitle'>
                {t('Intelligence, delivered.')}
              </span>
            </h1>
            <p>
              {t(
                'SnowAPI brings reliable model access, clear pricing, usage visibility, and simple API key management into one focused gateway.'
              )}
            </p>
            <Link to='/sign-in' className='snowapi-deeix-primary-link'>
              {t('Enter SnowAPI')}
              <ArrowUpRight aria-hidden='true' />
            </Link>
          </div>

          <SnowflakeCanvas />
        </div>
      </section>

      <footer className='snowapi-deeix-copyright'>
        <a href='https://unsnow.org' target='_blank' rel='noreferrer'>
          © 2026 unsnow.org
        </a>
      </footer>
    </main>
  )
}
