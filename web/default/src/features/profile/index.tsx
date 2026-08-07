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
import { useTranslation } from 'react-i18next'

import { ContentLoading, ContentReveal } from '@/components/content-loading'
import { SectionPageLayout } from '@/components/layout'
import { useStatus } from '@/hooks/use-status'

import { CheckinCalendarCard } from './components/checkin-calendar-card'
import { ProfileHeader } from './components/profile-header'
import { ProfilePreferencesCard } from './components/profile-preferences-card'
import { ProfileSecurityCard } from './components/profile-security-card'
import { useProfile } from './hooks'

export function Profile() {
  const { t } = useTranslation()
  const { profile, loading } = useProfile()
  const { status } = useStatus()

  const checkinEnabled = status?.checkin_enabled === true
  const turnstileEnabled = !!(
    status?.turnstile_check && status?.turnstile_site_key
  )
  const turnstileSiteKey = status?.turnstile_site_key || ''

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Profile')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        {loading ? <ContentLoading /> : null}
        {!loading && profile ? (
          <ContentReveal className='flex w-full flex-col gap-4'>
            <ProfileHeader profile={profile} />
            <ProfilePreferencesCard />

            <div
              className={
                checkinEnabled
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.42fr)] xl:items-start'
                  : 'grid gap-4'
              }
            >
              <ProfileSecurityCard profile={profile} />
              {checkinEnabled ? (
                <CheckinCalendarCard
                  checkinEnabled={checkinEnabled}
                  turnstileEnabled={turnstileEnabled}
                  turnstileSiteKey={turnstileSiteKey}
                />
              ) : null}
            </div>
          </ContentReveal>
        ) : null}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
