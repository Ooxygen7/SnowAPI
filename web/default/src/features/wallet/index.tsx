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
import { useQueryClient } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ContentLoading, ContentReveal } from '@/components/content-loading'
import { Dialog } from '@/components/dialog'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { subscriptionOverviewQueryKey } from '@/features/subscriptions/use-subscription-overview'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getSelf } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { PaymentConfirmDialog } from './components/dialogs/payment-confirm-dialog'
import { MySubscriptionCard } from './components/my-subscription-card'
import { RechargeFormCard } from './components/recharge-form-card'
import { RedemptionCodeCard } from './components/redemption-code-card'
import { WalletBalanceCard } from './components/wallet-balance-card'
import { DEFAULT_DISCOUNT_RATE } from './constants'
import { useTopupInfo, usePayment, useRedemption } from './hooks'
import { getDefaultPaymentType, getMinTopupAmount } from './lib'
import type { UserWalletData, PaymentMethod, PresetAmount } from './types'

interface WalletProps {
  initialShowHistory?: boolean
}

export function Wallet(props: WalletProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const accountQuota = useAuthStore((state) => state.auth.user?.quota)
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [redemptionCode, setRedemptionCode] = useState('')

  const { currency } = useSystemConfig()
  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()

  // Calculate effective exchange rate - when display type is USD, use rate of 1
  const effectiveUsdExchangeRate = useMemo(() => {
    return currency?.quotaDisplayType === 'USD'
      ? 1
      : currency?.usdExchangeRate || 1
  }, [currency?.quotaDisplayType, currency?.usdExchangeRate])
  const {
    amount: paymentAmount,
    calculating,
    processing,
    channelClosed,
    setChannelClosed,
    calculatePaymentAmount,
    processPayment,
  } = usePayment()
  const { redeeming, redeemCode } = useRedemption()

  useEffect(() => {
    if (channelClosed) setConfirmDialogOpen(false)
  }, [channelClosed])

  // Fetch and refresh user data
  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser, accountQuota])

  useEffect(() => {
    if (props.initialShowHistory) {
      setBillingDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [props.initialShowHistory])

  // Initialize topup amount when topup info is loaded
  useEffect(() => {
    if (topupInfo && topupAmount === 0) {
      const minTopup = getMinTopupAmount(topupInfo)
      setTopupAmount(minTopup)

      // Calculate initial payment amount with default payment type
      const defaultPaymentType = getDefaultPaymentType(topupInfo)
      calculatePaymentAmount(minTopup, defaultPaymentType)
    }
  }, [topupInfo, topupAmount, calculatePaymentAmount])

  // Get current payment type (selected or default)
  const getCurrentPaymentType = useCallback(() => {
    return selectedPaymentMethod?.type || getDefaultPaymentType(topupInfo)
  }, [selectedPaymentMethod, topupInfo])

  // Handle preset selection
  const handleSelectPreset = (preset: PresetAmount) => {
    setTopupAmount(preset.value)
    setSelectedPreset(preset.value)
    calculatePaymentAmount(preset.value, getCurrentPaymentType())
  }

  // Handle topup amount change
  const handleTopupAmountChange = (amount: number) => {
    setTopupAmount(amount)
    setSelectedPreset(null)
    calculatePaymentAmount(amount, getCurrentPaymentType())
  }

  // Handle payment method selection
  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    if (topupInfo?.payment_enabled === false) {
      setChannelClosed(true)
      return
    }
    setSelectedPaymentMethod(method)
    setPaymentLoading(method.type)

    try {
      // Validate minimum topup
      const minTopup = getMinTopupAmount(topupInfo)
      if (topupAmount < minTopup) {
        return
      }

      // Calculate payment amount and show confirmation dialog
      await calculatePaymentAmount(topupAmount, method.type)
      setConfirmDialogOpen(true)
    } finally {
      setPaymentLoading(null)
    }
  }

  // Handle payment confirmation
  const handlePaymentConfirm = async () => {
    if (!selectedPaymentMethod) return

    const success = await processPayment(
      topupAmount,
      selectedPaymentMethod.type,
      { onSuccess: fetchUser }
    )

    if (success) {
      setConfirmDialogOpen(false)
    }
  }

  // Handle redemption
  const handleRedeem = async () => {
    if (!redemptionCode) return

    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      await Promise.all([
        fetchUser(),
        queryClient.invalidateQueries({
          queryKey: subscriptionOverviewQueryKey,
        }),
      ])
    }
  }

  // Get discount rate for current topup amount
  const getDiscountRate = useCallback(() => {
    return topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE
  }, [topupInfo, topupAmount])

  const pageLoading = userLoading || topupLoading
  const onlineTopupEnabled = topupInfo?.enable_online_topup === true

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Description>
          {t('Wallet management and personal preferences.')}
        </SectionPageLayout.Description>
        <SectionPageLayout.Actions>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='bg-muted/60 gap-2'
            onClick={() => setBillingDialogOpen(true)}
          >
            <Receipt className='size-4' />
            {t('Order History')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          {pageLoading ? (
            <ContentLoading />
          ) : (
            <ContentReveal className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
              {onlineTopupEnabled ? (
                <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]'>
                  <div
                    id='wallet-add-funds'
                    className='order-2 min-w-0 scroll-mt-4 xl:order-1'
                  >
                    <RechargeFormCard
                      topupInfo={topupInfo}
                      presetAmounts={presetAmounts}
                      selectedPreset={selectedPreset}
                      onSelectPreset={handleSelectPreset}
                      topupAmount={topupAmount}
                      onTopupAmountChange={handleTopupAmountChange}
                      paymentAmount={paymentAmount}
                      calculating={calculating}
                      onPaymentMethodSelect={handlePaymentMethodSelect}
                      paymentLoading={paymentLoading}
                    />
                  </div>
                  <div className='contents xl:order-2 xl:flex xl:min-w-0 xl:flex-col xl:gap-4 xl:self-stretch'>
                    <div className='order-1 min-w-0'>
                      <WalletBalanceCard balance={user?.quota ?? 0} />
                    </div>
                    <div className='order-3 min-w-0 xl:flex-1'>
                      <RedemptionCodeCard
                        topupInfo={topupInfo}
                        code={redemptionCode}
                        onCodeChange={setRedemptionCode}
                        onRedeem={handleRedeem}
                        redeeming={redeeming}
                        className='h-full'
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <RedemptionCodeCard
                  topupInfo={topupInfo}
                  code={redemptionCode}
                  onCodeChange={setRedemptionCode}
                  onRedeem={handleRedeem}
                  redeeming={redeeming}
                />
              )}

              <MySubscriptionCard />
            </ContentReveal>
          )}
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <PaymentConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handlePaymentConfirm}
        topupAmount={topupAmount}
        paymentAmount={paymentAmount}
        paymentMethod={selectedPaymentMethod}
        calculating={calculating}
        processing={processing}
        discountRate={getDiscountRate()}
        usdExchangeRate={effectiveUsdExchangeRate}
      />

      <Dialog
        open={channelClosed}
        onOpenChange={setChannelClosed}
        title={t('Payment unavailable')}
        contentClassName='sm:max-w-sm'
        footer={
          <Button onClick={() => setChannelClosed(false)}>{t('OK')}</Button>
        }
      >
        <p className='text-sm'>
          {t('The payment channel is currently closed.')}
        </p>
      </Dialog>

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
      />
    </>
  )
}
