import type { PricingModel } from '@/features/pricing/types'
import snowApiLogo from '@/features/subscriptions/animation/assets/snowapi-logo.png'
import type { PlanRecord } from '@/features/subscriptions/types'
import { appPath } from '@/lib/deployment-mode'

export const DEMO_QUOTA_PER_USD = 500000
export const DEMO_GROUPS = ['Free', 'Light', 'Moderate', 'Heavy', 'Storm']
export const DEMO_MONTH = 30 * 24 * 60 * 60

// Handwritten public fixtures only. Never export production records into this file.
export const demoPlans: PlanRecord[] = [
  'Light',
  'Moderate',
  'Heavy',
  'Storm',
].map((title, index) => ({
  plan: {
    id: index + 1,
    title,
    subtitle: '',
    price_amount: [50, 100, 200, 600][index],
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'monthly',
    enabled: true,
    sort_order: index,
    allow_balance_pay: true,
    allow_wallet_overflow: true,
    max_purchase_per_user: 0,
    total_amount: [10, 25, 70, 250][index] * DEMO_QUOTA_PER_USD,
    five_hour_quota: [4, 8, 20, 80][index] * DEMO_QUOTA_PER_USD,
    upgrade_group: title,
    downgrade_group: 'Free',
  },
}))

export const demoModels: PricingModel[] = [
  ['deepseek-v4-flash', 'DeepSeek', 'openai', 0.15, 0.3, 1],
  ['deepseek-v4-pro', 'DeepSeek', 'openai', 0.3, 0.9, 1],
  ['glm-5.2', 'Zhipu', 'openai', 0.4, 1.2, 1],
  ['glm-5.3', 'Zhipu', 'openai', 0.5, 1.5, 1],
  ['grok-4.6', 'Grok', 'openai', 0.6, 1.8, 1],
  ['kimi-k3', 'Moonshot', 'openai', 0.5, 1.5, 2],
  ['kimi-k2.7-code', 'Moonshot', 'openai', 0.4, 1.2, 2],
  ['qwen-3.8-max', 'Qwen', 'anthropic', 0.4, 1.2, 2],
  ['gpt-5.6-luna', 'OpenAI', 'openai-response', 0.3, 1.2, 2],
  ['gpt-5.6-terra', 'OpenAI', 'openai-response', 0.5, 2, 2],
  ['gpt-5.6-sol', 'OpenAI', 'openai-response', 0.8, 3.2, 2],
  ['gpt-6-astra', 'OpenAI', 'openai-response', 1.5, 6, 3],
  ['claude-opus-4.8', 'Claude', 'anthropic', 1, 5, 2],
  ['claude-opus-5', 'Claude', 'anthropic', 1.5, 7.5, 2],
  ['claude-fable-5.1', 'Claude', 'anthropic', 2, 10, 3],
  ['claude-sonnet-5', 'Claude', 'anthropic', 0.6, 3, 2],
  ['mimo-v2.5-pro', 'Xiaomi', 'openai', 0.2, 0.6, 1],
].map(([name, icon, endpoint, input, output, tier], index) => ({
  id: index + 1,
  model_name: String(name),
  icon: String(icon),
  vendor_name: String(icon),
  vendor_id: index + 1,
  vendor_icon: String(icon),
  quota_type: 0,
  model_ratio: Number(input) / 2,
  completion_ratio: Number(output) / Number(input),
  cache_ratio: 0.1,
  enable_groups: DEMO_GROUPS.slice(Number(tier)),
  supported_endpoint_types: [String(endpoint)],
}))

export const demoGroupProfiles = DEMO_GROUPS.map((name, index) => ({
  name,
  description: name,
  is_default: index === 0,
  max_requests: [10, 20, 30, 60, 120][index],
  max_successful_requests: 0,
  period_minutes: 1,
  concurrency_limit: [1, 5, 10, 20, 50][index],
  tpm_limit: [100000, 1000000, 3000000, 6000000, 12000000][index],
}))

export function demoStatus() {
  return {
    system_name: 'SnowAPI',
    logo: snowApiLogo,
    version: 'snowapi-frontend-demo',
    setup: true,
    demo_site_enabled: true,
    display_in_currency: true,
    display_token_stat_enabled: true,
    quota_display_type: 'USD',
    quota_per_unit: DEMO_QUOTA_PER_USD,
    usd_exchange_rate: 1,
    password_login_enabled: true,
    invitation_registration_enabled: false,
    linuxdo_oauth: false,
    github_oauth: false,
    discord_oauth: false,
    oidc_enabled: false,
    telegram_oauth: false,
    wechat_login: false,
    passkey_login: false,
    custom_oauth_providers: [],
    turnstile_check: false,
    checkin_enabled: false,
    user_agreement_enabled: false,
    privacy_policy_enabled: false,
    server_address: appPath(''),
    minimal_mode_enabled: true,
    api_info_enabled: true,
    faq_enabled: true,
    announcements_enabled: true,
    api_info: [
      {
        id: 'demo-api',
        url: 'https://api.example.invalid/v1',
        route: 'Demo',
        description: 'Browser-only demo; no upstream connection.',
        color: 'blue',
      },
    ],
    faq: [
      {
        question: 'Is this a live account?',
        answer: 'No. All data and purchases are simulated in your browser.',
      },
    ],
    announcements: [
      {
        id: 'demo-welcome',
        content:
          'Welcome to the SnowAPI demo. All balances, models and purchases are virtual.',
        publishDate: '2026-09-17',
        revision: 1,
      },
    ],
    'console_setting.api_info': JSON.stringify([
      {
        id: 'demo-api',
        route: '/v1',
        url: 'https://api.example.invalid/v1',
        description: 'Browser-only demo; no upstream connection.',
        route_description: 'Demo',
        color: 'blue',
      },
    ]),
    'console_setting.faq': JSON.stringify([
      {
        question: 'Is this a live account?',
        answer: 'No. All data and purchases are simulated in your browser.',
      },
    ]),
    'console_setting.announcements': JSON.stringify([
      {
        id: 'demo-welcome',
        content:
          'Welcome to the SnowAPI demo. All balances, models and purchases are virtual.',
        publishDate: '2026-09-17',
        revision: 1,
      },
    ]),
  }
}

export function demoOptions() {
  const status = demoStatus()
  const options: Record<string, unknown> = {
    SystemName: 'SnowAPI',
    Logo: snowApiLogo,
    ServerAddress: 'https://demo.unsnow.online/snowapi',
    PasswordLoginEnabled: true,
    RegisterEnabled: false,
    PasswordRegisterEnabled: false,
    EmailVerificationEnabled: false,
    DefaultUserGroup: 'Free',
    QuotaPerUnit: DEMO_QUOTA_PER_USD,
    DisplayInCurrencyEnabled: true,
    DisplayTokenStatEnabled: true,
    'general_setting.quota_display_type': 'USD',
    Price: 10,
    MinTopUp: 1,
    GroupRatio: Object.fromEntries(DEMO_GROUPS.map((group) => [group, 1])),
    GroupPolicies: Object.fromEntries(
      demoGroupProfiles.map((group) => [group.name, group])
    ),
    ModelRatio: Object.fromEntries(
      demoModels.map((model) => [model.model_name, model.model_ratio])
    ),
    CompletionRatio: Object.fromEntries(
      demoModels.map((model) => [model.model_name, model.completion_ratio])
    ),
    ModelPrice: {},
    CacheRatio: {},
    CreateCacheRatio: {},
    ModelRequestRateLimitEnabled: false,
    'minimal_mode_setting.enabled': true,
    'payment_setting.enable': false,
    PayMethods: [{ name: 'LDC', type: 'epay' }],
    'console_setting.api_info': status['console_setting.api_info'],
    'console_setting.faq': status['console_setting.faq'],
    'console_setting.announcements': status['console_setting.announcements'],
  }
  return Object.entries(options).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }))
}

export function demoChannels(now: number) {
  return ['OpenAI Demo', 'Anthropic Demo', 'DeepSeek Demo'].map(
    (name, index) => ({
      id: index + 1,
      type: 1,
      key: '',
      name,
      status: 1,
      priority: 0,
      weight: 1,
      created_time: now - DEMO_MONTH,
      test_time: now - 60,
      response_time: 180 + index * 60,
      base_url: 'https://upstream.example.invalid',
      models: demoModels
        .filter((_, i) => i % 3 === index)
        .map((model) => model.model_name)
        .join(','),
      group: DEMO_GROUPS.slice(1).join(','),
      balance: 1000,
      balance_updated_time: now - 60,
      used_quota: 250 * DEMO_QUOTA_PER_USD,
      other: '',
      model_mapping: '{}',
      status_code_mapping: '{}',
      setting: '{}',
      param_override: '{}',
      header_override: '{}',
      tag: 'Demo',
      channel_info: {
        is_multi_key: false,
        multi_key_size: 1,
        multi_key_status_list: {},
        multi_key_mode: 'random',
      },
    })
  )
}

export function demoUsage(now: number) {
  return Array.from({ length: 72 }, (_, index) => ({
    id: index + 1,
    user_id: 1,
    username: 'snowapidemo',
    created_at: now - index * 1200,
    type: 2,
    content: '',
    model_name: demoModels[index % demoModels.length].model_name,
    quota: 400 + index * 13,
    prompt_tokens: 1000 + index * 123,
    completion_tokens: 200 + index * 17,
    use_time: 1 + (index % 4),
    is_stream: true,
    token_name: 'Demo key',
    token_id: 1,
    channel: (index % 3) + 1,
    channel_name: 'Demo',
    group: 'Light',
    ip: '192.0.2.10',
    request_id: `demo-request-${index + 1}`,
    other: JSON.stringify({
      model_ratio: 0.15,
      completion_ratio: 3,
      cache_tokens: 0,
      group_ratio: 1,
      frt: 250,
    }),
  }))
}
