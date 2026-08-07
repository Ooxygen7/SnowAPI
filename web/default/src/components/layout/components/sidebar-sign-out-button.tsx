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
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { Button } from '@/components/ui/button'

export function SidebarSignOutButton() {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className='snowapi-astryx-footer'>
        <Button
          type='button'
          variant='ghost'
          className='snowapi-sidebar-sign-out'
          onClick={() => setDialogOpen(true)}
        >
          <LogOut className='size-4 shrink-0' aria-hidden='true' />
          <span>{t('Sign out')}</span>
        </Button>
      </div>

      <SignOutDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  )
}
