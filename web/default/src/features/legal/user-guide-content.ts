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

export function useUserGuideSections() {
  const { t } = useTranslation()
  return [
    {
      id: 'welcome',
      title: t('SnowAPI user guide'),
      markdown: t(
        'SnowAPI connects your applications to AI models through one gateway. This guide covers ordinary accounts only. Available models, prices, subscription rights and payment methods come from the live site configuration; screenshots, examples and model names are not promises of availability. Never send a password, API key or access token to another person.'
      ),
    },
    {
      id: 'sign-in',
      title: t('Sign in'),
      markdown: t(
        'Choose “Continue with SnowAuth” to sign in with your username and password, or choose an OAuth provider when offered. Register only through an available registration entry; a closed entry means registration is unavailable. A signed-in visit to the home address opens the overview. Sign out on shared devices. If SnowShield blocks access, check your network and browser; do not repeatedly submit login requests. There is no password-recovery page.'
      ),
    },
    {
      id: 'overview',
      title: t('Overview'),
      markdown: t(
        'The overview summarizes your account and usage. Use its API addresses instead of guessing an upstream URL. Click a route tag to read its explanation, and copy the address appropriate for your client. The latest announcement appears in its card; “All announcements” opens the archive. A new announcement may appear on entry; acknowledging it hides that announcement and older ones for your account, not future updates.'
      ),
    },
    {
      id: 'quick-start',
      title: t('Quick start'),
      markdown: t(
        '1. Sign in and open the model list. Choose a model marked available and copy its exact model ID.\n2. Check the endpoint, input/output price and your subscription or wallet balance.\n3. Open API keys, create a dedicated key and copy its full value securely.\n4. In your client select the matching protocol, paste the API address and key, and set the model ID. Send a short test message.\n5. Open usage logs to confirm the result and charge. If you upgraded your plan, create a new key before testing.'
      ),
    },
    {
      id: 'connection',
      title: t('API connection'),
      markdown: t(
        'An API key authenticates model requests; your website password and Automatic Access token do not replace it. Send Authorization: Bearer YOUR_API_KEY and Content-Type: application/json. An OpenAI-compatible client usually expects a base URL ending in /v1 and appends /chat/completions itself: do not duplicate /v1. Other protocols use different paths; copy the endpoint shown in model details. A display name is not necessarily a valid model ID.'
      ),
    },
    {
      id: 'keys',
      title: t('API keys'),
      markdown: t(
        'Name keys by application so you can identify their logs. Set an expiry and a spending cap, or choose unlimited key quota; unlimited removes only that key cap, not wallet, plan or rate limits. Model restrictions and IP allowlists further narrow access and cannot grant unavailable models. In minimal mode the server assigns the account group. After a plan upgrade create a new key. Copy, edit, disable or delete keys from their row actions; a deleted key cannot be recovered.'
      ),
    },
    {
      id: 'models',
      title: t('Models'),
      markdown: t(
        'Search the model list and check the available/no-permission badge before integrating. Open a model for its exact ID, provider, endpoints and input/output pricing per million tokens. Input, output and cached tokens may have different rates. The final charge follows the site billing rules, not simply the visible text length. A model being listed does not grant permission; your current group, key restrictions and remaining budget still apply.'
      ),
    },
    {
      id: 'health',
      title: t('Model health'),
      markdown: t(
        'Health uses real model requests from all site users; it never sends automatic health-check requests. Each block is one hour in your device time zone: successful requests divided by total requests determines its color. Hover or focus a block for the time and success rate. The overall percentage is the arithmetic mean of observed hourly rates in the last 24 hourly slots, including the current partial hour. Hours without requests are unknown and excluded, not 0% or 100%. It is a historical indicator, not an uptime guarantee.'
      ),
    },
    {
      id: 'logs',
      title: t('Usage logs'),
      markdown: t(
        'Select a time range and search; narrow results by model or key when those filters are available. Expand a request to inspect tokens, latency, cost and billing details. Input can include system instructions, tool messages and conversation history, not only your latest message. Cached input is still input and is not automatically free or exempt from limits. The actual upstream model is visible only when site policy permits it. Share the request ID and error message when asking for help, never the key or private conversation.'
      ),
    },
    {
      id: 'wallet',
      title: t('Wallet'),
      markdown: t(
        'Your wallet balance and subscription allowance are different budgets. Adding wallet funds does not automatically purchase a plan. Enter a whole-number recharge amount or choose a preset, then select an available payment method and review its final amount and currency. Gateway exchange rates can make this different from the displayed USD amount. If a channel is closed, it cannot be used. Check order history and the updated balance before making a second payment.'
      ),
    },
    {
      id: 'subscriptions',
      title: t('Subscriptions'),
      markdown: t(
        'Open SnowEvent in the wallet and compare the current monthly plans. Check model access, the 5-hour allowance, period allowance and validity; Storm can have a separate group rather than inheriting every other group. Only one active subscription is retained. Checkout shows your username, purchase and amount. Choose wallet balance when allowed or a configured gateway, then slide to confirm. Do not close the page while payment is pending. A verified successful payment is followed by the subscription card animation after one second.'
      ),
    },
    {
      id: 'upgrades',
      title: t('Upgrades and usage windows'),
      markdown: t(
        'An upgrade keeps the existing subscription end date and changes the rights for its remaining period; the server quotes the upgrade difference. The old subscription is replaced, not stacked. Read the quote instead of subtracting full monthly prices yourself. The wallet shows 5-hour and period usage to three decimal places, reset times and expiry. “Starts after first request” means the window has not started. Key quota, wallet balance and plan allowances are independent limits. After upgrading, create a new key for the new group.'
      ),
    },
    {
      id: 'redemption',
      title: t('Redemption codes'),
      markdown: t(
        'Paste the complete code into the wallet redemption field and submit once. Codes can add balance or grant time-limited subscription rights; they do not all have the same effect. The code redemption deadline and the granted subscription duration are separate. Used or expired codes cannot be redeemed. An existing active subscription, whether paid or redeemed, prevents redemption of another subscription code. After a successful group change, create a new API key. Never post an unused code publicly.'
      ),
    },
    {
      id: 'orders',
      title: t('Order History'),
      markdown: t(
        'Open Order History in the wallet, search by order number and use pagination to find a recharge. Check the amount, channel, time and status. A payment-provider success page is not final proof that the site received confirmation. Pending payments may need time for the gateway callback. If you paid but the balance or subscription did not update, retain the order number and payment receipt and contact the administrator; do not repeatedly purchase the same order.'
      ),
    },
    {
      id: 'profile',
      title: t('Profile'),
      markdown: t(
        'Your profile shows account identity and preferences. Change the interface language and light/dark theme there; this does not change API model output. Daily check-in is available only when enabled by the site. Automatic Access generates a separate management token, documented below. Deleting your account is destructive: stop integrations and save any records you need before confirming. Logging out is the safe choice when you only want to end a browser session.'
      ),
    },
    {
      id: 'limits',
      title: t('Rate limits and context'),
      markdown: t(
        'RPM limits requests per minute; TPM limits token throughput. Long conversations resend context and can hit TPM even when wallet funds remain. Start a new conversation, summarize history, remove unnecessary files and tool output, lower the maximum output budget, and reduce parallel requests. On 429, wait and retry with exponential backoff rather than a tight loop. A 5-hour allowance reset and a subscription expiry are different events; consult their displayed times.'
      ),
    },
    {
      id: 'troubleshooting',
      title: t('Troubleshooting'),
      markdown: t(
        '401: verify the complete key, Bearer header and correct credential type. 403 or no permission: check your group and model restrictions; create a new key after an upgrade. 404 or unsupported endpoint: verify base URL, path and exact model ID. Insufficient quota: inspect wallet, subscription windows and key quota separately. 429: reduce concurrency and context. 5xx or timeout: check model health and retry cautiously. For support, include time, model ID, request ID and a redacted error; never publish Authorization headers.'
      ),
    },
  ]
}
