import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ContentLoading, ContentReveal } from '@/components/content-loading'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { getGroupProfiles, updateGroupProfiles } from './api'
import type { GroupProfile } from './types'

const queryKey = ['group-profiles'] as const

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

export function GroupSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey, queryFn: getGroupProfiles })
  const [groups, setGroups] = useState<GroupProfile[]>([])

  useEffect(() => {
    if (query.data) setGroups(query.data)
  }, [query.data])

  const mutation = useMutation({
    mutationFn: updateGroupProfiles,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved)
      setGroups(saved)
      toast.success(t('Group settings saved'))
    },
    onError: (error) => toast.error(error.message),
  })

  const updateGroup = <K extends keyof GroupProfile>(
    index: number,
    key: K,
    value: GroupProfile[K]
  ) => {
    setGroups((current) =>
      current.map((group, groupIndex) =>
        groupIndex === index ? { ...group, [key]: value } : group
      )
    )
  }

  const addGroup = () => {
    let suffix = groups.length + 1
    while (groups.some((group) => group.name === `group_${suffix}`)) suffix++
    setGroups((current) => [
      ...current,
      {
        name: `group_${suffix}`,
        description: t('New group'),
        max_requests: 0,
        max_successful_requests: 0,
        period_minutes: 1,
        concurrency_limit: 0,
        tpm_limit: 0,
      },
    ])
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Group Settings')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' onClick={addGroup}>
          <Plus className='size-4' />
          {t('Add group')}
        </Button>
        <Button
          onClick={() => mutation.mutate(groups)}
          disabled={mutation.isPending || groups.length === 0}
        >
          <Save className='size-4' />
          {mutation.isPending ? t('Saving...') : t('Save changes')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {query.isLoading ? <ContentLoading /> : null}
        {!query.isLoading ? (
          <ContentReveal className='space-y-3'>
            <div className='bg-muted/45 text-muted-foreground rounded-[12px] px-4 py-3 text-xs'>
              {t(
                'Use 0 for unlimited. TPM is measured over the latest minute.'
              )}
            </div>
            {groups.map((group, index) => (
              <section
                key={group.name}
                className='bg-muted/45 rounded-[12px] p-4 sm:p-5'
              >
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='space-y-1.5 text-xs'>
                    <span className='text-muted-foreground'>
                      {t('Group name')}
                    </span>
                    <Input
                      value={group.name}
                      disabled={
                        group.name === 'Free' ||
                        Boolean(
                          query.data?.some((item) => item.name === group.name)
                        )
                      }
                      onChange={(event) =>
                        updateGroup(index, 'name', event.target.value)
                      }
                    />
                  </label>
                  <label className='space-y-1.5 text-xs'>
                    <span className='text-muted-foreground'>
                      {t('Description')}
                    </span>
                    <Input
                      value={group.description}
                      onChange={(event) =>
                        updateGroup(index, 'description', event.target.value)
                      }
                    />
                  </label>
                </div>

                <div className='mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
                  {(
                    [
                      ['max_requests', 'Maximum requests'],
                      [
                        'max_successful_requests',
                        'Maximum successful requests',
                      ],
                      ['period_minutes', 'Period (minutes)'],
                      ['concurrency_limit', 'Concurrency'],
                      ['tpm_limit', 'TPM'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className='space-y-1.5 text-xs'>
                      <span className='text-muted-foreground'>{t(label)}</span>
                      <Input
                        type='number'
                        min={key === 'period_minutes' ? 1 : 0}
                        value={group[key]}
                        onChange={(event) =>
                          updateGroup(
                            index,
                            key,
                            toNumber(
                              event.target.value,
                              key === 'period_minutes' ? 1 : 0
                            )
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </ContentReveal>
        ) : null}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
