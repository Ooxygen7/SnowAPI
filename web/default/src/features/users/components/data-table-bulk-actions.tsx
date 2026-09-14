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
import { useMutation } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { batchDeleteUsers } from '../api'
import type { User } from '../types'
import { useUsers } from './users-provider'

interface DataTableBulkActionsProps {
  table: Table<User>
}

export function DataTableBulkActions({ table }: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const actor = useAuthStore((state) => state.auth.user)
  const { triggerRefresh } = useUsers()
  const [targets, setTargets] = useState<number[]>([])
  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
  const canDelete =
    selected.length > 0 &&
    selected.length <= 100 &&
    selected.every(
      (user) => user.id !== actor?.id && user.role < (actor?.role ?? 0)
    )
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await batchDeleteUsers(targets)
      if (!result.success) {
        throw new Error(result.message || t('Operation failed'))
      }
      return result.data
    },
    onSuccess: (data) => {
      toast.success(
        t('Deleted {{count}} users', { count: data?.count ?? targets.length })
      )
      table.resetRowSelection()
      setTargets([])
      triggerRefresh()
    },
  })
  return (
    <>
      <BulkActionsToolbar table={table} entityName='user'>
        <Button
          variant='destructive'
          size='sm'
          disabled={!canDelete || mutation.isPending}
          onClick={() => setTargets(selected.map((user) => user.id))}
        >
          <Trash2 aria-hidden='true' />
          {t('Delete selected users')}
        </Button>
      </BulkActionsToolbar>
      <ConfirmDialog
        open={targets.length > 0}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setTargets([])
        }}
        title={t('Delete selected users')}
        desc={t(
          'Permanently delete {{count}} selected users? This cannot be undone.',
          { count: targets.length }
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => mutation.mutate()}
      />
    </>
  )
}
