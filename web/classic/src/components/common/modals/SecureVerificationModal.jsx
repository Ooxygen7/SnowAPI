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

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Banner,
  Button,
  Input,
  Modal,
  TabPane,
  Tabs,
  Typography,
} from '@douyinfe/semi-ui';

const SecureVerificationModal = ({
  visible,
  verificationMethods,
  verificationState,
  onVerify,
  onCancel,
  onCodeChange,
  onMethodSwitch,
  title,
  description,
}) => {
  const { t } = useTranslation();
  const { hasPassword, hasPasskey, passkeySupported } = verificationMethods;
  const { method, loading, code } = verificationState;
  const hasAnyMethod = hasPassword || (hasPasskey && passkeySupported);

  const submit = () => {
    if (!method) return;
    onVerify(method, method === 'password' ? code : undefined);
  };

  return (
    <Modal
      title={title || t('安全验证')}
      visible={visible}
      onCancel={loading ? undefined : onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={loading}>
            {t('取消')}
          </Button>
          <Button
            theme='solid'
            type='primary'
            loading={loading}
            disabled={!hasAnyMethod || (method === 'password' && !code)}
            onClick={submit}
          >
            {t('验证')}
          </Button>
        </>
      }
      width={460}
      centered
    >
      {description && (
        <Typography.Paragraph type='tertiary'>
          {description}
        </Typography.Paragraph>
      )}

      {!hasAnyMethod ? (
        <Banner
          type='warning'
          description={t('请先设置密码或启用 Passkey 才能执行此操作')}
          closeIcon={null}
        />
      ) : (
        <Tabs activeKey={method} onChange={onMethodSwitch} type='line'>
          {hasPassword && (
            <TabPane tab={t('当前密码')} itemKey='password'>
              <Input
                type='password'
                autoComplete='current-password'
                value={code}
                onChange={onCodeChange}
                placeholder={t('请输入当前密码')}
                disabled={loading}
                autoFocus={method === 'password'}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && code && !loading) submit();
                }}
              />
            </TabPane>
          )}
          {hasPasskey && passkeySupported && (
            <TabPane tab={t('Passkey')} itemKey='passkey'>
              <Typography.Text type='tertiary'>
                {t('点击验证按钮，使用您的生物特征或安全密钥')}
              </Typography.Text>
            </TabPane>
          )}
        </Tabs>
      )}
    </Modal>
  );
};

export default SecureVerificationModal;
