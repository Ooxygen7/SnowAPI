/*
Copyright (C) 2025 QuantumNous

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

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Typography,
} from '@douyinfe/semi-ui';
import { History, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  API,
  renderQuota,
  showError,
  showInfo,
  showSuccess,
} from '../../helpers';
import { UserContext } from '../../context/User';
import SubscriptionPlansCard from './SubscriptionPlansCard';
import TopupHistoryModal from './modals/TopupHistoryModal';

const { Text, Title } = Typography;
const RETIRED_PAYMENT_METHODS = new Set([
  'stripe',
  'creem',
  'waffo',
  'waffo_pancake',
]);

function normalizeEpayMethods(value) {
  let methods = value;
  if (typeof methods === 'string') {
    try {
      methods = JSON.parse(methods);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(methods)) return [];
  return methods.filter((method) => {
    const type = String(method?.type || '').trim();
    return (
      method?.name &&
      type &&
      !RETIRED_PAYMENT_METHODS.has(type) &&
      !type.startsWith('waffo:')
    );
  });
}

function submitEpayForm(url, params) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    throw new Error('invalid checkout URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('invalid checkout URL');
  }

  const form = document.createElement('form');
  form.action = parsed.toString();
  form.method = 'POST';
  const isSafari =
    navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Chrome');
  if (!isSafari) form.target = '_blank';
  Object.entries(params || {}).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = String(value ?? '');
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

const TopUp = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userState, userDispatch] = useContext(UserContext);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [amountLoading, setAmountLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [redemptionCode, setRedemptionCode] = useState('');
  const [topUpCount, setTopUpCount] = useState(1);
  const [amount, setAmount] = useState(0);
  const [minTopUp, setMinTopUp] = useState(1);
  const [payMethods, setPayMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [enableOnlineTopUp, setEnableOnlineTopUp] = useState(false);
  const [enableRedemption, setEnableRedemption] = useState(true);
  const [complianceConfirmed, setComplianceConfirmed] = useState(true);
  const [topUpLink, setTopUpLink] = useState('');
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [billingPreference, setBillingPreference] =
    useState('subscription_first');
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);
  const [allSubscriptions, setAllSubscriptions] = useState([]);

  const paymentOptions = useMemo(
    () =>
      payMethods.map((method) => ({
        value: method.type,
        label: method.name,
      })),
    [payMethods],
  );

  const refreshUser = async () => {
    const res = await API.get('/api/user/self');
    if (res.data?.success) {
      userDispatch({ type: 'login', payload: res.data.data });
    }
  };

  const getSubscriptionPlans = async () => {
    setSubscriptionLoading(true);
    try {
      const res = await API.get('/api/subscription/plans');
      setSubscriptionPlans(res.data?.success ? res.data.data || [] : []);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const getSubscriptionSelf = async () => {
    try {
      const res = await API.get('/api/subscription/self');
      if (!res.data?.success) return;
      setBillingPreference(
        res.data.data?.billing_preference || 'subscription_first',
      );
      setActiveSubscriptions(res.data.data?.subscriptions || []);
      setAllSubscriptions(res.data.data?.all_subscriptions || []);
    } catch {
      setActiveSubscriptions([]);
      setAllSubscriptions([]);
    }
  };

  const updateBillingPreference = async (preference) => {
    const previous = billingPreference;
    setBillingPreference(preference);
    try {
      const res = await API.put('/api/subscription/self/preference', {
        billing_preference: preference,
      });
      if (!res.data?.success) throw new Error(res.data?.message);
      setBillingPreference(res.data.data?.billing_preference || preference);
      showSuccess(t('更新成功'));
    } catch (error) {
      setBillingPreference(previous);
      showError(error?.message || t('更新失败'));
    }
  };

  const getAmount = async (value = topUpCount) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setAmount(0);
      return 0;
    }
    setAmountLoading(true);
    try {
      const res = await API.post('/api/user/amount', { amount: numericValue });
      if (res.data?.message !== 'success') {
        throw new Error(res.data?.data || res.data?.message);
      }
      const nextAmount = Number(res.data.data || 0);
      setAmount(nextAmount);
      return nextAmount;
    } catch (error) {
      setAmount(0);
      showError(error?.message || t('获取金额失败'));
      return 0;
    } finally {
      setAmountLoading(false);
    }
  };

  const getTopupInfo = async () => {
    const res = await API.get('/api/user/topup/info');
    if (!res.data?.success) {
      throw new Error(res.data?.message || t('获取充值配置失败'));
    }
    const data = res.data.data || {};
    const methods = normalizeEpayMethods(data.pay_methods);
    const minimum = Math.max(1, Number(data.min_topup) || 1);
    setPayMethods(methods);
    setPaymentMethod(methods[0]?.type || '');
    setEnableOnlineTopUp(Boolean(data.enable_online_topup && methods.length));
    setEnableRedemption(data.enable_redemption !== false);
    setComplianceConfirmed(data.payment_compliance_confirmed !== false);
    setTopUpLink(data.topup_link || '');
    setMinTopUp(minimum);
    setTopUpCount(minimum);
    await getAmount(minimum);
  };

  useEffect(() => {
    Promise.all([
      refreshUser(),
      getTopupInfo(),
      getSubscriptionPlans(),
      getSubscriptionSelf(),
    ])
      .catch((error) => showError(error?.message || t('请求失败')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (searchParams.get('show_history') !== 'true') return;
    setHistoryOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('show_history');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const redeem = async () => {
    if (!redemptionCode.trim()) {
      showInfo(t('请输入兑换码！'));
      return;
    }
    setRedeeming(true);
    try {
      const res = await API.post('/api/user/topup', {
        key: redemptionCode.trim(),
      });
      if (!res.data?.success) throw new Error(res.data?.message);
      showSuccess(t('兑换成功！'));
      Modal.success({
        title: t('兑换成功！'),
        content: t('成功兑换额度：') + renderQuota(res.data.data),
        centered: true,
      });
      setRedemptionCode('');
      await refreshUser();
    } catch (error) {
      showError(error?.message || t('请求失败'));
    } finally {
      setRedeeming(false);
    }
  };

  const preparePayment = async () => {
    if (!complianceConfirmed) {
      showError(t('管理员尚未确认支付合规信息，在线支付暂不可用'));
      return;
    }
    if (!enableOnlineTopUp || !paymentMethod) {
      showError(t('管理员未开启在线充值！'));
      return;
    }
    if (Number(topUpCount) < minTopUp) {
      showError(t('充值数量不能小于') + minTopUp);
      return;
    }
    await getAmount(topUpCount);
    setConfirmOpen(true);
  };

  const pay = async () => {
    setPaying(true);
    try {
      const res = await API.post('/api/user/pay', {
        amount: Math.trunc(Number(topUpCount)),
        payment_method: paymentMethod,
      });
      if (res.data?.message !== 'success') {
        throw new Error(res.data?.data || res.data?.message);
      }
      submitEpayForm(res.data.url, res.data.data);
      setConfirmOpen(false);
      showSuccess(t('已发起支付'));
    } catch (error) {
      showError(error?.message || t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className='w-full max-w-7xl mx-auto mt-[60px] px-2 pb-8'>
      <Spin spinning={loading}>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          <Card className='!rounded-xl'>
            <div className='flex items-center justify-between mb-5'>
              <div>
                <Title heading={4}>{t('充值')}</Title>
                <Text type='tertiary'>
                  {t('当前余额')}：{renderQuota(userState?.user?.quota || 0)}
                </Text>
              </div>
              <Button
                icon={<History size={16} />}
                onClick={() => setHistoryOpen(true)}
              >
                {t('充值记录')}
              </Button>
            </div>

            {!complianceConfirmed && (
              <Banner
                type='warning'
                className='mb-4 !rounded-xl'
                description={t('管理员尚未确认支付合规信息，在线支付暂不可用')}
                closeIcon={null}
              />
            )}

            {enableOnlineTopUp && (
              <Space vertical align='start' style={{ width: '100%' }}>
                <Text strong>{t('在线充值')}</Text>
                <InputNumber
                  value={topUpCount}
                  min={minTopUp}
                  precision={0}
                  onChange={(value) => {
                    const nextValue = Number(value) || minTopUp;
                    setTopUpCount(nextValue);
                    getAmount(nextValue);
                  }}
                  style={{ width: '100%' }}
                  prefix={t('充值数量')}
                />
                <Select
                  value={paymentMethod}
                  optionList={paymentOptions}
                  onChange={setPaymentMethod}
                  style={{ width: '100%' }}
                  placeholder={t('选择支付方式')}
                />
                <Text type='tertiary'>
                  {t('实付金额')}：
                  {amountLoading ? '…' : `${amount} ${t('元')}`}
                </Text>
                <Button
                  theme='solid'
                  type='primary'
                  icon={<Wallet size={16} />}
                  onClick={preparePayment}
                  disabled={!complianceConfirmed}
                  block
                >
                  {t('充值')}
                </Button>
              </Space>
            )}

            {!enableOnlineTopUp && !topUpLink && (
              <Banner
                type='info'
                className='mb-4 !rounded-xl'
                description={t('管理员未开启在线充值！')}
                closeIcon={null}
              />
            )}

            {topUpLink && (
              <Button
                className='mt-4'
                onClick={() =>
                  window.open(topUpLink, '_blank', 'noopener,noreferrer')
                }
                block
              >
                {t('打开充值链接')}
              </Button>
            )}

            {enableRedemption && (
              <div className='mt-6 pt-5 border-t border-semi-color-border'>
                <Text strong>{t('兑换码')}</Text>
                <div className='flex gap-2 mt-3'>
                  <Input
                    value={redemptionCode}
                    onChange={setRedemptionCode}
                    placeholder={t('请输入兑换码')}
                  />
                  <Button theme='solid' onClick={redeem} loading={redeeming}>
                    {t('兑换')}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <SubscriptionPlansCard
            t={t}
            loading={subscriptionLoading}
            plans={subscriptionPlans}
            payMethods={payMethods}
            enableOnlineTopUp={enableOnlineTopUp && complianceConfirmed}
            billingPreference={billingPreference}
            onChangeBillingPreference={updateBillingPreference}
            activeSubscriptions={activeSubscriptions}
            allSubscriptions={allSubscriptions}
            reloadSubscriptionSelf={getSubscriptionSelf}
          />
        </div>
      </Spin>

      <Modal
        title={t('确认充值')}
        visible={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onOk={pay}
        confirmLoading={paying}
        centered
      >
        <p>
          {t('充值数量')}：{topUpCount}
        </p>
        <p>
          {t('实付金额')}：{amount} {t('元')}
        </p>
      </Modal>

      <TopupHistoryModal
        visible={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        t={t}
      />
    </div>
  );
};

export default TopUp;
