import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ContentLoading, ContentReveal } from '@/components/content-loading'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { getGroupProfiles, mutateGroup, updateGroupProfiles } from './api'
import { DeleteGroupDialog, RenameGroupDialog } from './group-actions-dialog'
import type { GroupProfile } from './types'

const queryKey = ['group-profiles'] as const
type DraftGroup = GroupProfile & { rowId: string; persisted: boolean }

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

export function GroupSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey, queryFn: getGroupProfiles })
  const [draft, setDraft] = useState<DraftGroup[] | null>(null)
  const [action, setAction] = useState<{
    name: string
    type: 'rename' | 'delete'
  } | null>(null)
  const groups =
    draft ??
    (query.data ?? []).map((group) => ({
      ...group,
      rowId: group.name,
      persisted: true,
    }))

  const onSaved = (saved: GroupProfile[]) => {
    queryClient.setQueryData(queryKey, saved)
    setDraft(null)
    setAction(null)
    void queryClient.invalidateQueries({
      predicate: (entry) => entry.queryKey[0] !== queryKey[0],
    })
    toast.success(t('Group settings saved'))
  }
  const mutation = useMutation({
    mutationFn: updateGroupProfiles,
    onSuccess: onSaved,
    onError: (error) => toast.error(error.message),
  })
  const groupMutation = useMutation({
    mutationFn: mutateGroup,
    onSuccess: onSaved,
    onError: (error) => toast.error(error.message),
  })
  const pending = mutation.isPending || groupMutation.isPending

  const updateGroup = <K extends keyof GroupProfile>(
    index: number,
    key: K,
    value: GroupProfile[K]
  ) => {
    setDraft(
      groups.map((group, groupIndex) =>
        groupIndex === index ? { ...group, [key]: value } : group
      )
    )
  }
  const addGroup = () => {
    let suffix = groups.length + 1
    while (groups.some((group) => group.name === `group_${suffix}`)) suffix++
    setDraft([
      ...groups,
      {
        rowId: crypto.randomUUID(),
        persisted: false,
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
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Group Settings')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            aria-label={t('Add group')}
            disabled={pending || !query.data}
            onClick={addGroup}
          >
            <Plus className='size-4' />
            <span className='hidden sm:inline'>{t('Add group')}</span>
          </Button>
          <Button
            aria-label={t('Save changes')}
            disabled={pending || !draft || groups.length === 0}
            onClick={() =>
              mutation.mutate(
                groups.map(
                  ({ rowId: _rowId, persisted: _persisted, ...group }) => group
                )
              )
            }
          >
            <Save className='size-4' />
            <span className='hidden sm:inline'>
              {mutation.isPending ? t('Saving...') : t('Save changes')}
            </span>
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          {query.isLoading ? <ContentLoading /> : null}
          {query.isError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('Failed to load group settings')}
                <Button variant='outline' onClick={() => void query.refetch()}>
                  {t('Retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {query.data ? (
            <ContentReveal className='flex flex-col gap-3'>
              <Alert>
                <AlertDescription>
                  {t(
                    'Use 0 for unlimited. TPM is measured over the latest minute.'
                  )}
                  {draft ? (
                    <p>
                      {t(
                        'Save or discard your edits before renaming or deleting an existing group.'
                      )}{' '}
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setDraft(null)}
                        disabled={pending}
                      >
                        {t('Discard changes')}
                      </Button>
                    </p>
                  ) : null}
                </AlertDescription>
              </Alert>
              {groups.map((group, index) => (
                <section
                  key={group.rowId}
                  className='bg-muted/45 flex flex-col gap-4 rounded-xl p-4 sm:p-5'
                >
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <h2 className='truncate text-sm font-medium'>
                        {group.name}
                      </h2>
                      {group.is_default ? (
                        <Badge variant='outline'>{t('Default')}</Badge>
                      ) : null}
                    </div>
                    <div className='flex gap-2'>
                      {group.persisted ? (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={pending || !!draft}
                          onClick={() =>
                            setAction({ type: 'rename', name: group.name })
                          }
                        >
                          <Pencil className='size-3.5' />
                          {t('Rename group')}
                        </Button>
                      ) : null}
                      <Button
                        size='sm'
                        variant='outline'
                        aria-label={t('Delete group {{name}}?', {
                          name: group.name,
                        })}
                        disabled={pending || (group.persisted && !!draft)}
                        onClick={() =>
                          group.persisted
                            ? setAction({ type: 'delete', name: group.name })
                            : setDraft(
                                groups.filter(
                                  (item) => item.rowId !== group.rowId
                                )
                              )
                        }
                      >
                        <Trash2 className='size-3.5' />
                        {t('Delete')}
                      </Button>
                    </div>
                  </div>
                  <FieldGroup className='grid gap-3 sm:grid-cols-2'>
                    <Field>
                      <FieldLabel htmlFor={`group-name-${group.rowId}`}>
                        {t('Group name')}
                      </FieldLabel>
                      <Input
                        id={`group-name-${group.rowId}`}
                        value={group.name}
                        readOnly={group.persisted}
                        disabled={pending}
                        onChange={(event) =>
                          updateGroup(index, 'name', event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`group-description-${group.rowId}`}>
                        {t('Description')}
                      </FieldLabel>
                      <Input
                        id={`group-description-${group.rowId}`}
                        value={group.description}
                        disabled={pending}
                        onChange={(event) =>
                          updateGroup(index, 'description', event.target.value)
                        }
                      />
                    </Field>
                  </FieldGroup>
                  <FieldGroup className='grid grid-cols-2 gap-3 xl:grid-cols-5'>
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
                      <Field key={key}>
                        <FieldLabel htmlFor={`${key}-${group.rowId}`}>
                          {t(label)}
                        </FieldLabel>
                        <Input
                          id={`${key}-${group.rowId}`}
                          type='number'
                          min={key === 'period_minutes' ? 1 : 0}
                          disabled={pending}
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
                      </Field>
                    ))}
                  </FieldGroup>
                </section>
              ))}
            </ContentReveal>
          ) : null}
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {action?.type === 'rename' ? (
        <RenameGroupDialog
          name={action.name}
          pending={pending}
          onClose={() => setAction(null)}
          onSubmit={(newName) =>
            groupMutation.mutate({ name: action.name, newName })
          }
        />
      ) : null}
      {action?.type === 'delete' ? (
        <DeleteGroupDialog
          name={action.name}
          pending={pending}
          onClose={() => setAction(null)}
          onSubmit={() => groupMutation.mutate({ name: action.name })}
        />
      ) : null}
    </>
  )
}
