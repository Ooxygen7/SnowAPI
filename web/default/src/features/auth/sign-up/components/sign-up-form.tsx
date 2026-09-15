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
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, TicketCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { PasswordInput } from '@/components/password-input'
import { Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { invitationRegister } from '@/features/auth/api'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import { invitationRegisterFormSchema } from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

export function SignUpForm({
  className,
  ...props
}: React.HTMLAttributes<HTMLFormElement>) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { redirectToLogin } = useAuthRedirect()
  const [isLoading, setIsLoading] = useState(false)
  const [agreedToLegal, setAgreedToLegal] = useState(false)
  const {
    isSecurityReady,
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    turnstileAttempt,
    resetTurnstile,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()

  const hasUserAgreement = Boolean(status?.user_agreement_enabled)
  const hasPrivacyPolicy = Boolean(status?.privacy_policy_enabled)
  const requiresLegalConsent = hasUserAgreement || hasPrivacyPolicy

  useEffect(() => {
    setAgreedToLegal(!requiresLegalConsent)
  }, [requiresLegalConsent])

  const form = useForm<z.infer<typeof invitationRegisterFormSchema>>({
    resolver: zodResolver(invitationRegisterFormSchema),
    defaultValues: {
      invitationCode: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(data: z.infer<typeof invitationRegisterFormSchema>) {
    if (requiresLegalConsent && !agreedToLegal) {
      toast.error(t('Please agree to the legal terms first'))
      return
    }
    if (!validateTurnstile()) return

    setIsLoading(true)
    try {
      const response = await invitationRegister({
        invitation_code: data.invitationCode.trim(),
        username: data.username.trim(),
        password: data.password,
        turnstile: turnstileToken,
      })
      if (response.success) {
        toast.success(t('Invited account created. You can now sign in.'))
        redirectToLogin()
      } else {
        toast.error(response.message || t('Failed to create invited account'))
      }
    } catch {
      // Errors are handled by the global interceptor.
    } finally {
      resetTurnstile()
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='invitationCode'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Invitation code')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete='one-time-code'
                  autoCapitalize='characters'
                  placeholder={t('Enter your one-time invitation code')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='username'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Username')}</FormLabel>
              <FormControl>
                <Input
                  autoComplete='username'
                  placeholder={t('Choose a username')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Password')}</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='new-password'
                  placeholder={t('Enter password (8-20 characters)')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Confirm password')}</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete='new-password'
                  placeholder={t('Confirm password')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isTurnstileEnabled && (
          <Turnstile
            key={turnstileAttempt}
            siteKey={turnstileSiteKey}
            onVerify={setTurnstileToken}
          />
        )}

        <LegalConsent
          status={status}
          checked={agreedToLegal}
          onCheckedChange={setAgreedToLegal}
        />

        <Button
          type='submit'
          className='mt-1 h-11 w-full gap-2'
          disabled={
            isLoading ||
            !isSecurityReady ||
            (requiresLegalConsent && !agreedToLegal)
          }
        >
          {isLoading ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <TicketCheck className='h-4 w-4' />
          )}
          {t('Create invited account')}
        </Button>
      </form>
    </Form>
  )
}
