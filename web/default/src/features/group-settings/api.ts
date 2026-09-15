import { t } from 'i18next'

import { api } from '@/lib/api'

import type { GroupProfile, GroupProfilesResponse } from './types'

export async function getGroupProfiles(): Promise<GroupProfile[]> {
  const response = await api.get<GroupProfilesResponse>('/api/group/policies')
  if (!response.data.success) {
    throw new Error(response.data.message || t('Failed to load group settings'))
  }
  return response.data.data ?? []
}

export async function updateGroupProfiles(
  groups: GroupProfile[]
): Promise<GroupProfile[]> {
  const response = await api.put<GroupProfilesResponse>('/api/group/policies', {
    groups,
  })
  if (!response.data.success) {
    throw new Error(response.data.message || t('Failed to save group settings'))
  }
  return response.data.data ?? groups
}

export async function mutateGroup(input: {
  name: string
  newName?: string
}): Promise<GroupProfile[]> {
  const url = `/api/group/${encodeURIComponent(input.name)}`
  const config = {
    skipBusinessError: true,
    skipErrorHandler: true,
    validateStatus: (status: number) => status >= 200 && status < 500,
  }
  const response =
    input.newName === undefined
      ? await api.delete<
          GroupProfilesResponse & { code?: string; names?: string[] }
        >(url, config)
      : await api.post<
          GroupProfilesResponse & { code?: string; names?: string[] }
        >(`${url}/rename`, { name: input.newName }, config)
  if (!response.data.success) {
    switch (response.data.code) {
      case 'group_has_pending_tasks':
        throw new Error(
          t('This group has unfinished tasks. Try again after they complete.')
        )
      case 'group_channel_names_too_long':
        throw new Error(
          t(
            'This name makes a channel group list exceed 64 characters. Use a shorter name.'
          )
        )
      case 'group_bound_subscription':
        throw new Error(
          t('This group is bound to subscription {{names}}.', {
            names: response.data.names?.join(', '),
          })
        )
      case 'group_is_default':
        throw new Error(t('The default group cannot be deleted.'))
      case 'group_in_use':
        throw new Error(
          t(
            'This group is still used by users, keys, channels or redemption codes.'
          )
        )
      case 'group_name_exists':
        throw new Error(t('This group name already exists.'))
      case 'group_not_found':
        throw new Error(t('Group not found. Refresh the page.'))
      case 'invalid_group_name':
        throw new Error(
          t(
            'Use 1-64 letters, numbers, underscores or hyphens; start with a letter or number.'
          )
        )
      default:
        throw new Error(
          response.data.message || t('Failed to save group settings')
        )
    }
  }
  return response.data.data ?? []
}
