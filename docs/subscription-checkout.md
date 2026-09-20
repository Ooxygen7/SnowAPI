# Subscription checkout

Subscription checkout uses a SnowAPI-branded, responsive two-column layout. It
requires no billing address or card details. Account balance pays directly from
the wallet; configured Epay methods open the existing gateway in a separate window.

## Pricing and availability

- `GET /api/subscription/checkout?plan_id=...` returns a server-calculated USD
  subscription quote and currently available external methods.
- External methods use `PayMethods[].name` as their display unit and the gateway's
  `Price` (local currency per USD) as the conversion rate. All methods currently
  share the site's Epay gateway and conversion rate.
- Recharge discounts, minimum recharge amounts, and quota display units do not
  change subscription prices. Existing upgrade proration and billing-cycle rules
  remain unchanged.
- Closing external payments or disabling payment compliance hides external
  methods. Balance purchases retain the existing plan and compliance checks.

## Settlement

External checkout posts to `/api/subscription/epay/pay` with a stable request ID
and the displayed amount. The server validates the amount and stores an immutable
plan, account-identity, and upgrade-cycle snapshot. A pending, zero-wallet-credit
entry is included in order history.

The Epay notify and return handlers verify the signature, persisted amount, and
payment provider before settlement. Callbacks remain available when new payments
are disabled. Settlement is transactional and idempotent; external subscription
payments never add wallet balance.

`GET /api/subscription/checkout/status?trade_no=...` only returns orders owned by
the authenticated user. The checkout polls this endpoint; a closed gateway window
is not proof of payment failure. Unconfirmed orders are retained for checking
instead of automatically placing another order.

If the account identity or active subscription/cycle changes before payment
settles, the order is marked `paid_review`. No conflicting subscription is
granted. The UI asks the user to contact an administrator, and the server logs the
trade number for payment reconciliation. Administrators must verify the gateway
payment and resolve/refund it rather than treating it as a wallet recharge.

## Interaction

The slide-to-pay control supports pointer cancellation, keyboard confirmation,
reduced motion, responsive sizing, and duplicate-submit protection. Only confirmed
payment enters the success state; the subscription pack reveal follows after one
second. Navigation/logout cancels local monitoring and reveal timers, not an
already-submitted gateway order.
