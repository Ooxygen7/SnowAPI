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
import { useTranslation } from 'react-i18next'

import { useAuthStore } from '@/stores/auth-store'

import { LegalDocument } from './legal-document'

import './legal.css'

export function AutoAccessPage() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const origin = window.location.origin
  const headers = `Authorization: Bearer YOUR_ACCESS_TOKEN\nNew-Api-User: ${userId ?? 'YOUR_USER_ID'}`
  const sections = [
    {
      id: 'authentication',
      title: t('Authentication'),
      markdown: [
        t(
          'Automatic Access lets scripts use your account management API. It is separate from model calls under /v1, which require an API key.'
        ),
        t(
          'Generate a token in Profile → Security → Automatic Access. Send both headers below with every management request. New-Api-User must be your own numeric user ID, not your username.'
        ),
        `\`\`\`http\nGET ${origin}/api/user/self\n${headers}\n\`\`\``,
        t(
          'The base URL is this website origin, not an upstream model provider or a model relay route shown on the overview page.'
        ),
      ].join('\n\n'),
    },
    {
      id: 'quick-start',
      title: t('Quick start'),
      markdown: [
        t(
          'This read-only example retrieves your profile and balance. Replace YOUR_ACCESS_TOKEN and YOUR_USER_ID before running it; in Windows PowerShell, use curl.exe instead of curl.'
        ),
        `\`\`\`bash\ncurl '${origin}/api/user/self' -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' -H 'New-Api-User: ${userId ?? 'YOUR_USER_ID'}'\n\`\`\``,
        t(
          'Successful responses contain success: true and data. Profile fields include id, username, group, quota, used_quota and request_count. Quota fields are internal units: divide by quota_per_unit from GET /api/status to obtain USD.'
        ),
        `\`\`\`json\n{"success":true,"message":"","data":{"id":123,"username":"example","group":"Free","quota":1000000,"used_quota":0,"request_count":0}}\n\`\`\``,
      ].join('\n\n'),
    },
    {
      id: 'read-keys',
      title: t('List API keys'),
      markdown: [
        `\`\`\`http\nGET /api/token/?p=1&page_size=20\nGET /api/token/search?keyword=script&p=1&page_size=20\nGET /api/token/123\n\`\`\``,
        t(
          'p starts at 1; page_size accepts 1–100. List responses return data.items, data.total, data.page and data.page_size. Replace 123 with a key ID from your own list.'
        ),
        t(
          'List and detail responses mask the key. To retrieve the complete sk- key, send POST /api/token/123/key with the same authentication headers; read data.key from the response. Never publish that value.'
        ),
      ].join('\n\n'),
    },
    {
      id: 'create-key',
      title: t('Create an API key'),
      markdown: [
        t(
          'Send JSON with Content-Type: application/json and both authentication headers. The example grants a limited quota; it does not add balance to your account.'
        ),
        `\`\`\`http\nPOST /api/token/\nContent-Type: application/json\n${headers}\n\n{"name":"my-script","expired_time":${Math.floor(Date.now() / 1000) + 30 * 86400},"remain_quota":1000000,"unlimited_quota":false,"model_limits_enabled":false}\n\`\`\``,
        t(
          'name is limited to 50 bytes. expired_time is a Unix timestamp in seconds; -1 means no expiry. remain_quota uses internal quota units. unlimited_quota: true removes only the key quota cap, not account or subscription limits.'
        ),
        t(
          'The server assigns your current account group; scripts cannot choose another group. After upgrading a plan, create a new key. Creation returns success without a key ID: refresh the list, identify the new key, then retrieve its full key if needed.'
        ),
      ].join('\n\n'),
    },
    {
      id: 'manage-key',
      title: t('Enable, disable and delete keys'),
      markdown: [
        t(
          'To change only the status, send the following JSON. status: 1 enables a key; status: 2 disables it. Expired or exhausted keys cannot be enabled until their expiry or quota is corrected.'
        ),
        `\`\`\`http\nPUT /api/token/?status_only=true\nContent-Type: application/json\n${headers}\n\n{"id":123,"status":2}\n\`\`\``,
        t(
          'DELETE /api/token/123 deletes your key permanently and stops future requests using it. Only operate on your own key IDs; test scripts with a dedicated key before automating destructive actions.'
        ),
      ].join('\n\n'),
    },
    {
      id: 'usage',
      title: t('Usage logs and subscriptions'),
      markdown: [
        `\`\`\`http\nGET /api/log/self?p=1&page_size=20\nGET /api/subscription/self\nGET /api/user/model-catalog\n\`\`\``,
        t(
          'Logs support p, page_size, start_timestamp, end_timestamp, model_name and token_name. Times are Unix seconds. The response uses the same pagination fields as the key list.'
        ),
        t(
          'Subscription data contains subscriptions (active) and all_subscriptions (including expired). These are read-only queries; they do not purchase or upgrade a subscription.'
        ),
      ].join('\n\n'),
    },
    {
      id: 'security',
      title: t('Errors and token security'),
      markdown: [
        t(
          'Check both the HTTP status and the JSON success field: a business error can return HTTP 200 with success: false. Read message for details. A 401 usually means missing or mismatched credentials; a 403 means access is denied; on 429, back off before retrying.'
        ),
        t(
          'Management tokens follow the permissions of the account. Ordinary users can access only their own permitted data. Keep tokens out of source code, URLs, screenshots and logs; load them from a private environment variable.'
        ),
        t(
          'Generating a token replaces the previous one. Keep it private; it has no automatic expiry.'
        ),
        t(
          'Opening this documentation does not generate or rotate a token. If a token leaks, regenerate it in Automatic Access and update your scripts. Do not automatically retry writes when the result is uncertain; first check whether the change succeeded.'
        ),
      ].join('\n\n'),
    },
  ]

  return (
    <LegalDocument
      title={t('Management API documentation')}
      queryKey='auto-access-docs'
      sections={sections}
      loading={false}
    />
  )
}
