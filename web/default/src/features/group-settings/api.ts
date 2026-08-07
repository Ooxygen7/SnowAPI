import { api } from '@/lib/api'

import type { GroupProfile, GroupProfilesResponse } from './types'

export async function getGroupProfiles(): Promise<GroupProfile[]> {
  const response = await api.get<GroupProfilesResponse>('/api/group/policies')
  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to load group settings')
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
    throw new Error(response.data.message || 'Failed to save group settings')
  }
  return response.data.data ?? groups
}
