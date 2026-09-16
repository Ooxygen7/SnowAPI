import { z } from 'zod'

import type {
  SubscriptionBalanceQuote,
  UserSubscriptionRecord,
} from '@/features/subscriptions/types'

import {
  DEMO_GROUPS,
  DEMO_MONTH,
  DEMO_QUOTA_PER_USD,
  demoChannels,
  demoGroupProfiles,
  demoModels,
  demoOptions,
  demoPlans,
  demoStatus,
  demoUsage,
} from './fixtures'

const STORAGE_KEY = 'snowapi:demo:v1'
const stateSchema = z.object({
  authenticated: z.boolean(),
  balance: z.number().finite().min(0).max(10000),
  planId: z.number().int().min(0).max(4),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
  language: z.string(),
  purchases: z
    .array(
      z.object({
        id: z.number(),
        planId: z.number(),
        amount: z.number().finite().nonnegative(),
        time: z.number(),
      })
    )
    .max(100),
})
type DemoState = z.infer<typeof stateSchema>
type DemoStorage = Pick<Storage, 'getItem' | 'setItem'>
export type DemoResult = {
  status: number
  body: {
    success: boolean
    message?: string
    data?: unknown
    [key: string]: unknown
  }
}

export class DemoEngine {
  private state: DemoState

  constructor(
    private storage?: DemoStorage,
    private now = () => Math.floor(Date.now() / 1000)
  ) {
    this.state = {
      authenticated: false,
      balance: 10000,
      planId: 0,
      startTime: 0,
      endTime: 0,
      language: '',
      purchases: [],
    }
    try {
      const stored = stateSchema.safeParse(
        JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')
      )
      if (stored.success) this.state = stored.data
    } catch {
      /* A restricted browser still gets an isolated in-memory demo. */
    }
  }

  private save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      /* Keep this tab usable without storage. */
    }
  }

  private activePlan() {
    if (this.state.endTime <= this.now()) return undefined
    return demoPlans.find((item) => item.plan.id === this.state.planId)?.plan
  }

  private profile() {
    const plan = this.activePlan()
    const group = plan?.title || 'Free'
    return {
      id: 1,
      username: 'snowapidemo',
      display_name: 'SnowAPI Demo',
      email: 'demo@example.invalid',
      role: 100,
      status: 1,
      group,
      quota: Math.round(this.state.balance * DEMO_QUOTA_PER_USD),
      used_quota: 0,
      request_count: 72,
      total_topup: 10000 * DEMO_QUOTA_PER_USD,
      created_at: this.now() - DEMO_MONTH,
      created_time: this.now() - DEMO_MONTH,
      last_login_at: this.now(),
      has_password: true,
      group_expires_at: plan ? this.state.endTime : 0,
      group_policy: demoGroupProfiles.find((item) => item.name === group),
      setting: JSON.stringify({
        language: this.state.language,
        billing_preference: 'subscription_first',
      }),
      subscription: plan
        ? {
            subscription_id: 1,
            plan_id: plan.id,
            plan_title: plan.title,
            source: 'order',
            group,
            period_total: plan.total_amount,
            period_remaining: plan.total_amount,
            five_hour_total: plan.five_hour_quota,
            five_hour_remaining: plan.five_hour_quota,
            end_time: this.state.endTime,
            version: this.state.purchases.length,
          }
        : null,
    }
  }

  private subscriptions(): UserSubscriptionRecord[] {
    const plan = this.activePlan()
    if (!plan) return []
    return [
      {
        subscription: {
          id: 1,
          user_id: 1,
          plan_id: plan.id,
          status: 'active',
          source: 'order',
          start_time: this.state.startTime,
          end_time: this.state.endTime,
          amount_total: plan.total_amount,
          amount_used: 0,
          five_hour_quota: plan.five_hour_quota,
          next_reset_time: this.state.endTime,
        },
        five_hour_window: {
          state: 'idle',
          amount_total: plan.five_hour_quota,
          amount_used: 0,
          remaining: plan.five_hour_quota,
        },
      },
    ]
  }

  private quote(planId: number): SubscriptionBalanceQuote | undefined {
    const target = demoPlans.find((item) => item.plan.id === planId)?.plan
    if (!target) return undefined
    const current = this.activePlan()
    if (current && target.price_amount <= current.price_amount) return undefined
    const fraction = current
      ? Math.min(
          1,
          Math.max(
            0,
            (this.state.endTime - this.now()) /
              Math.max(1, this.state.endTime - this.state.startTime)
          )
        )
      : 1
    const amount =
      Math.round(
        (target.price_amount - (current?.price_amount || 0)) * fraction * 100
      ) / 100
    return {
      plan_id: planId,
      original_price: target.price_amount,
      upgrade_credit: target.price_amount - amount,
      amount_due: amount,
      required_quota: Math.round(amount * DEMO_QUOTA_PER_USD),
      is_upgrade: Boolean(current),
      current_subscription_id: current ? 1 : undefined,
      current_plan_id: current?.id,
      current_plan_title: current?.title,
    }
  }

  request(method: string, url: string, payload: unknown = {}): DemoResult {
    const parsed = new URL(url, 'https://demo.invalid')
    const path = parsed.pathname.replace(/\/+$/, '')
    const params = parsed.searchParams
    const data =
      payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {}
    const ok = (value: unknown = null, extra = {}): DemoResult => ({
      status: 200,
      body: { success: true, message: '', data: value, ...extra },
    })
    const fail = (message: string, status = 403): DemoResult => ({
      status,
      body: { success: false, message },
    })
    const now = this.now()

    if (method === 'GET' && path === '/api/status') return ok(demoStatus())
    if (method === 'GET' && path === '/api/setup') {
      return ok({ status: true, root_init: true })
    }
    if (
      method === 'GET' &&
      ['/api/user-agreement', '/api/privacy-policy'].includes(path)
    ) {
      return ok('')
    }
    if (method === 'GET' && path === '/api/subscription/plans') {
      return ok(demoPlans)
    }
    if (method === 'POST' && path === '/api/user/login') {
      if (data.username !== 'snowapidemo' || data.password !== '1234567890') {
        return fail('Invalid demo credentials', 400)
      }
      this.state.authenticated = true
      this.save()
      return ok(this.profile())
    }
    if (method === 'GET' && path === '/api/user/logout') {
      this.state.authenticated = false
      this.save()
      return ok()
    }
    if (!this.state.authenticated) {
      return fail('Please sign in to the demo first', 401)
    }
    // Read-only quote used by the wallet form; it never creates a payment.
    if (method === 'POST' && path === '/api/user/amount') {
      const amount = Number(data.amount)
      return ok(
        String(
          Number.isFinite(amount) && amount > 0
            ? Math.min(amount, 10000) * 10
            : 0
        )
      )
    }
    if (
      method === 'PUT' &&
      path === '/api/user/self' &&
      Object.keys(data).length === 1 &&
      typeof data.language === 'string'
    ) {
      this.state.language = data.language
      this.save()
      return ok(this.profile())
    }
    if (method === 'POST' && path === '/api/subscription/balance/pay') {
      const quote = this.quote(Number(data.plan_id))
      if (!quote) return fail('This plan cannot be purchased', 400)
      if (quote.amount_due > this.state.balance) {
        return fail('Insufficient demo balance', 400)
      }
      this.state.balance =
        Math.round((this.state.balance - quote.amount_due) * 100) / 100
      if (!quote.is_upgrade) {
        this.state.startTime = now
        this.state.endTime = now + DEMO_MONTH
      }
      this.state.planId = quote.plan_id
      this.state.purchases.push({
        id: this.state.purchases.length + 1,
        planId: quote.plan_id,
        amount: quote.amount_due,
        time: now,
      })
      this.save()
      return ok(quote)
    }
    // These POST endpoints only reveal fictional display data, never a real credential.
    if (method === 'POST' && /^\/api\/token\/\d+\/key$/.test(path)) {
      return ok({ key: 'demo-not-a-real-api-key' })
    }
    if (method !== 'GET') {
      return fail(
        'Demo mode is read-only. Only virtual plan purchases are available.'
      )
    }

    const profile = this.profile()
    const groups = Object.fromEntries(
      DEMO_GROUPS.map((group) => [group, { desc: group, ratio: 1 }])
    )
    const ratios = Object.fromEntries(DEMO_GROUPS.map((group) => [group, 1]))
    const channels = demoChannels(now)
    const page = <T extends object>(items: T[]) => {
      let filtered = items
      const keyword = params.get('keyword')?.trim().toLowerCase()
      if (keyword) {
        filtered = filtered.filter((item) =>
          JSON.stringify(item).toLowerCase().includes(keyword)
        )
      }
      for (const field of [
        'status',
        'role',
        'group',
        'model_name',
        'username',
      ]) {
        const value = params.get(field)
        if (value) {
          filtered = filtered.filter(
            (item) => String((item as Record<string, unknown>)[field]) === value
          )
        }
      }
      const size = Math.min(
        100,
        Math.max(1, Number(params.get('page_size') || params.get('size')) || 10)
      )
      const number = Math.max(1, Number(params.get('p')) || 1)
      return {
        items: filtered.slice((number - 1) * size, number * size),
        total: filtered.length,
        page: number,
        page_size: size,
      }
    }
    const users = [
      profile,
      ...Array.from({ length: 29 }, (_, index) => ({
        ...profile,
        id: index + 2,
        username: `demo_user_${String(index + 1).padStart(2, '0')}`,
        display_name: `Demo ${index + 1}`,
        email: `demo${index + 1}@example.invalid`,
        role: 1,
        quota: (120 + index * 10) * DEMO_QUOTA_PER_USD,
        group: DEMO_GROUPS[index % 5],
        subscription: null,
      })),
    ]
    if (path === '/api/user/self') return ok(profile)
    if (path === '/api/user' || path === '/api/user/search') {
      return ok(page(users))
    }
    if (/^\/api\/user\/\d+$/.test(path)) {
      return ok(
        users.find((user) => user.id === Number(path.split('/').pop())) ||
          profile
      )
    }
    if (/^\/api\/user\/\d+\/subscription-status$/.test(path)) {
      return ok(
        path === '/api/user/1/subscription-status' ? profile.subscription : null
      )
    }
    if (path === '/api/user/announcements') return ok(null)
    if (path === '/api/user/relay-ban') {
      return ok({
        active: false,
        code: 'user_relay_banned',
        starts_at: 0,
        expires_at: 0,
      })
    }
    const readiness = {
      configured_mode: 'disabled',
      effective_mode: 'disabled',
      proxy_ready: true,
      resolver: {
        ready: true,
        country_ready: true,
        asn_ready: true,
        version: 'demo',
      },
      enforced_ready: false,
      blocking: [],
    }
    if (path === '/api/user-relay-bans/readiness') return ok(readiness)
    if (path === '/api/user-relay-bans') return ok(page([]))
    if (/^\/api\/user-relay-bans\/\d+\/events$/.test(path)) return ok([])
    if (path === '/api/log/ip-audit') {
      return ok({
        generated_at: now,
        start_at: now - 600,
        end_at: now,
        retention_days: 7,
        items: [],
        page: 1,
        page_size: 20,
        total: 0,
        thresholds: { request_count: 200, user_count: 5, rpm: 60 },
        summary: {
          total_ips: 0,
          total_users: 0,
          total_requests: 0,
          count_anomaly_ips: 0,
          rpm_anomaly_ips: 0,
          any_anomaly_ips: 0,
        },
        readiness,
        risk: {
          generated_at: now,
          start_at: now - 600,
          end_at: now,
          retention_days: 7,
          items: [],
          page: 1,
          page_size: 20,
          total: 0,
          summary: {
            total_users: 0,
            total_requests: 0,
            triggering_users: 0,
            actively_banned: 0,
          },
        },
      })
    }
    if (path === '/api/perf-metrics/summary') {
      return ok({
        models: demoModels.map((model) => ({
          model_name: model.model_name,
          avg_latency_ms: 1200,
          success_rate: 99.2,
          avg_tps: 48,
          recent_success_rates: [100, 99, 98, 100],
          request_count: 120,
        })),
      })
    }
    if (path === '/api/perf-metrics') {
      return ok({
        model_name: params.get('model_name'),
        groups: DEMO_GROUPS.slice(1).map((group) => ({
          group,
          avg_ttft_ms: 180,
          avg_latency_ms: 1200,
          success_rate: 99.2,
          avg_tps: 48,
          series: Array.from({ length: 12 }, (_, index) => ({
            ts: now - (11 - index) * 300,
            avg_ttft_ms: 180,
            avg_latency_ms: 1200,
            success_rate: 99.2,
            avg_tps: 48,
          })),
        })),
      })
    }
    if (path.includes('/oauth/bindings') || path === '/api/user/oauth') {
      return ok([])
    }
    if (path === '/api/user/2fa/status') {
      return ok({ enabled: false, backup_codes_remaining: 0 })
    }
    if (path.includes('/passkey')) {
      return ok({ enabled: false, credentials: [] })
    }
    if (path === '/api/group') return ok(DEMO_GROUPS)
    if (path === '/api/group/policies') return ok(demoGroupProfiles)
    if (path === '/api/user/self/groups') return ok(groups)
    if (path === '/api/user/models' || path === '/api/channel/models_enabled') {
      return ok(demoModels.map((model) => model.model_name))
    }
    if (path === '/api/subscription/admin/plans') return ok(demoPlans)
    if (path === '/api/subscription/self') {
      return ok({
        billing_preference: 'subscription_first',
        subscriptions: this.subscriptions(),
        all_subscriptions: this.subscriptions(),
      })
    }
    if (/^\/api\/subscription\/admin\/users\/\d+\/subscriptions$/.test(path)) {
      return ok(path.includes('/users/1/') ? this.subscriptions() : [])
    }
    if (path === '/api/subscription/balance/quote') {
      const quote = this.quote(Number(params.get('plan_id')))
      return quote ? ok(quote) : fail('This plan cannot be purchased', 400)
    }
    if (path === '/api/user/model-catalog') {
      return ok(demoModels, {
        vendors: demoModels.map((model) => ({
          id: model.vendor_id,
          name: model.vendor_name,
          icon: model.icon,
        })),
        current_group: profile.group,
        group_ratio: ratios,
        usable_group: groups,
        auto_groups: [],
        supported_endpoint: {
          openai: { path: '/v1/chat/completions', method: 'POST' },
          'openai-response': { path: '/v1/responses', method: 'POST' },
          anthropic: { path: '/v1/messages', method: 'POST' },
        },
      })
    }
    if (path === '/api/user/model-health') {
      return ok({
        generated_at: now,
        start_hour: Math.floor(now / 3600) * 3600 - 23 * 3600,
        end_hour: Math.floor(now / 3600) * 3600,
        window_hours: 24,
        models: demoModels.map((model, index) => ({
          model_name: model.model_name,
          buckets: Array.from({ length: 24 }, (_, hour) => ({
            hour: Math.floor(now / 3600) * 3600 - (23 - hour) * 3600,
            total_count: 100,
            success_count: 100 - ((hour + index) % 5),
            probe_count: 0,
            success_rate: 100 - ((hour + index) % 5),
          })),
        })),
      })
    }
    if (path === '/api/token' || path === '/api/token/search') {
      return ok(
        page(
          Array.from({ length: 4 }, (_, index) => ({
            id: index + 1,
            user_id: 1,
            name: ['Demo key', 'Playground', 'Development', 'Archive'][index],
            key: `demo-display-only-${index + 1}`,
            status: index === 3 ? 2 : 1,
            remain_quota: 100 * DEMO_QUOTA_PER_USD,
            used_quota: 0,
            unlimited_quota: true,
            expired_time: -1,
            created_time: now - DEMO_MONTH,
            accessed_time: now - 60,
            group: profile.group,
            model_limits_enabled: false,
            model_limits: '',
            allow_ips: '',
            cross_group_retry: false,
          }))
        )
      )
    }
    if (path === '/api/user/topup/info') {
      return ok({
        enable_online_topup: true,
        payment_enabled: false,
        pay_methods: [{ name: 'LDC', type: 'epay', min_topup: 1 }],
        min_topup: 1,
        amount_options: [5, 10, 50, 100],
        discount: {},
        enable_redemption: true,
      })
    }
    if (path === '/api/user/topup' || path === '/api/user/topup/self') {
      return ok(
        page(
          this.state.purchases.map((order) => ({
            id: order.id,
            user_id: 1,
            amount: order.amount,
            money: order.amount,
            trade_no: `DEMO-${order.id}`,
            create_time: order.time,
            complete_time: order.time,
            status: 'success',
            payment_method: 'balance',
            type: 'subscription',
            plan_title: demoPlans[order.planId - 1].plan.title,
          }))
        )
      )
    }
    if (path === '/api/log' || path === '/api/log/self') {
      return ok(page(demoUsage(now)))
    }
    if (path === '/api/log/stat' || path === '/api/log/self/stat') {
      return ok({ quota: 63000, rpm: 12, tpm: 18600 })
    }
    if (path === '/api/data/token-usage/overview') {
      return ok({
        total_tokens: 2400000,
        last_24h_tokens: 840000,
        hourly: Array.from({ length: 24 }, (_, index) => ({
          timestamp: now - (23 - index) * 3600,
          tokens: 24000 + index * 950,
        })),
      })
    }
    if (path.startsWith('/api/data')) {
      return ok(
        demoUsage(now).map((log) => ({
          ...log,
          count: 1,
          token_used: log.prompt_tokens + log.completion_tokens,
          channel_id: log.channel,
          use_group: log.group,
          node_name: 'demo-browser',
        }))
      )
    }
    if (path === '/api/option') return ok(demoOptions())
    if (path === '/api/performance/logs') {
      return ok({
        enabled: false,
        log_dir: 'demo',
        file_count: 0,
        total_size: 0,
      })
    }
    if (path === '/api/performance/stats') {
      return ok({
        cache_stats: {
          current_disk_usage_bytes: 0,
          disk_cache_max_bytes: 1e9,
          active_disk_files: 0,
          disk_cache_hits: 0,
          current_memory_usage_bytes: 8e6,
          active_memory_buffers: 12,
          memory_cache_hits: 72,
        },
        disk_space_info: {
          total: 100e9,
          free: 88e9,
          used: 12e9,
          used_percent: 12,
        },
        memory_stats: {
          alloc: 64e6,
          total_alloc: 256e6,
          sys: 128e6,
          num_gc: 24,
          num_goroutine: 32,
        },
        disk_cache_info: { path: 'demo', file_count: 0, total_size: 0 },
        config: { is_running_in_container: false },
      })
    }
    if (path === '/api/option/channel_affinity_cache') {
      return ok({
        enabled: false,
        total: 0,
        unknown: 0,
        by_rule_name: {},
        cache_capacity: 10000,
        cache_algo: 'LRU',
      })
    }
    if (path === '/api/channel' || path === '/api/channel/search') {
      return ok(page(channels), { type_counts: { 1: 3 } })
    }
    if (/^\/api\/channel\/\d+$/.test(path)) {
      return ok(
        channels.find((channel) => channel.id === Number(path.split('/').pop()))
      )
    }
    if (path === '/api/channel/models') {
      return ok(
        demoModels.map((model) => ({
          id: model.model_name,
          name: model.model_name,
        }))
      )
    }
    if (path === '/api/channel/ops') return ok({})
    if (path === '/api/minimal-mode') {
      return ok({
        enabled: true,
        private_upstreams_enabled: false,
        private_host_allowlist: [],
        private_cidr_allowlist: [],
        cache_degraded: false,
        channel_types: [
          { id: 1, name: 'OpenAI' },
          { id: 14, name: 'Anthropic' },
        ],
        icon_keys: [...new Set(demoModels.map((model) => model.icon))],
        groups: DEMO_GROUPS,
        sources: channels.map((channel) => ({
          id: channel.id,
          channel_id: channel.id,
          revision: 1,
          name: channel.name,
          provider_name: '',
          base_url: channel.base_url,
          channel_type: 1,
          groups: DEMO_GROUPS.slice(1),
          has_api_key: true,
          sync_state: 'in_sync',
          models: demoModels
            .filter((model) =>
              channel.models.split(',').includes(model.model_name)
            )
            .map((model) => ({
              display_model: model.model_name,
              upstream_model: model.model_name,
              icon_key: model.icon,
              endpoint_type: model.supported_endpoint_types?.[0],
              billing_mode: 'token',
              model_ratio: model.model_ratio,
              completion_ratio: model.completion_ratio,
              cache_ratio: 0.1,
            })),
        })),
      })
    }
    if (path === '/api/models' || path === '/api/models/search') {
      return ok(
        page(
          demoModels.map((model) => ({
            ...model,
            status: 1,
            name_rule: 0,
            created_time: now - DEMO_MONTH,
            updated_time: now,
            sync_official: 0,
          }))
        )
      )
    }
    if (path === '/api/vendors' || path === '/api/vendors/search') {
      return ok(
        page(
          demoModels.map((model) => ({
            id: model.id,
            name: model.vendor_name,
            icon: model.icon,
            description: '',
            status: 1,
          }))
        )
      )
    }
    if (path === '/api/redemption' || path === '/api/redemption/search') {
      return ok(
        page(
          Array.from({ length: 15 }, (_, index) => ({
            id: index + 1,
            user_id: 1,
            name: 'Demo Light',
            key: `DEMO-NOT-REDEEMABLE-${index + 1}`,
            status: index % 3 ? 1 : 3,
            quota: 0,
            type: 'group',
            group_name: 'Light',
            group_duration_minutes: 4320,
            created_time: now - 3600,
            redeemed_time: 0,
            expired_time: now + 86400,
            used_user_id: index % 3 ? 0 : index + 2,
          }))
        )
      )
    }
    if (path === '/api/invitation') {
      return ok(
        page(
          Array.from({ length: 8 }, (_, index) => ({
            id: index + 1,
            name: 'Demo invite',
            code_prefix: `DEMO${index + 1}`,
            status: 1,
            created_by: 1,
            used_by: 0,
            created_at: now - 3600,
            used_at: 0,
            creator_username: 'snowapidemo',
            used_username: '',
          }))
        )
      )
    }
    if (path === '/api/system-info/instances') {
      return ok([
        {
          node_name: 'demo-browser',
          status: 'online',
          stale_after_seconds: 60,
          started_at: now - 86400,
          last_seen_at: now,
          info: {
            node: { name: 'demo-browser' },
            role: { is_master: true },
            runtime: {
              version: 'frontend-demo',
              goos: 'browser',
              goarch: 'virtual',
              started_at: now - 86400,
            },
            host: { hostname: 'demo' },
            resources: {
              cpu: { usage_percent: 12 },
              memory: { usage_percent: 28 },
              storage: {
                total_bytes: 100e9,
                used_bytes: 12e9,
                free_bytes: 88e9,
                used_percent: 12,
              },
            },
          },
        },
      ])
    }
    if (
      path === '/api/system-info/stale-instances' ||
      path === '/api/system-task/list' ||
      path === '/api/prefill_group' ||
      path === '/api/models/missing' ||
      path === '/api/custom-oauth-provider' ||
      path === '/api/ratio_sync/channels'
    ) {
      return ok([])
    }
    if (path === '/api/system-task/current') return ok(null)
    if (path === '/api/authz/catalog') return ok({ resources: [], roles: [] })
    return fail('This action is not available in the frontend demo', 403)
  }
}
