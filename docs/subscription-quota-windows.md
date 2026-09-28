# Subscription quota windows

SnowAPI implements a first-use-anchored, fixed five-hour allowance:

- The first admitted subscription request starts a 300-minute window. Opening
  the wallet or purchasing a subscription does not start it.
- Further requests share that window; they do not move its deadline.
- At the deadline, the current five-hour usage is zero and the full five-hour
  allowance is available, including when the user has made no new request.
- The next admitted request starts a new 300-minute window. Idle windows do not
  accumulate allowance. Subscription expiry always caps the window end.
- Periodic quota is independent. Restoring five-hour allowance does not restore
  exhausted weekly/monthly/custom-period quota or renew an expired subscription.
- A rejected admission creates no window. Upstream failures refund reservations
  using the original request's window references.

For example, usage at 10:00 starts a window ending at 15:00. Usage at 14:59 does
not change that deadline. At 15:00 allowance is restored. If the next use is at
18:00, its window ends at 23:00.

The minute-based maintenance task closes elapsed windows and clears their
current pointers. Admission and summary reads also check the exact deadline,
so maintenance delays never extend an old limit. Ledger usage is retained for
late streaming/task settlement, refunds and audits; no historical row is zeroed.
Transactions lock the subscription before windows and use version checks.

The self-subscription endpoint returns `server_time`. The wallet uses this clock,
refreshes at boundaries and every 30 seconds while visible, and revalidates on
focus. Its current-allowance projection also handles stale responses at expiry.

## Reference and scope

OpenAI's [Codex pricing documentation](https://learn.chatgpt.com/docs/pricing)
describes five-hour usage periods, and its [app-server contract](https://learn.chatgpt.com/docs/app-server)
provides `usedPercent`, `windowDurationMins`, and `resetsAt`. Those public documents
do not disclose the complete server-side accounting/reset implementation.
The fixed first-use policy above is SnowAPI's explicit product rule, not a claim
to reproduce OpenAI's private implementation or model-specific usage weights.
