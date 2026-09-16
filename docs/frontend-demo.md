# Frontend demonstration

SnowAPI can be built as a standalone, browser-only demonstration of the current
new-api-derived frontend. It requires no Go service, database, Redis, OAuth
application, payment provider, or upstream model credentials.

## Build

From `web/default/`, with the workspace dependencies installed:

```sh
VITE_SNOWAPI_DEMO=true VITE_APP_BASE_PATH=/snowapi bun run build
```

Serve the generated `dist/` under `/snowapi/`, with SPA fallback to
`/snowapi/index.html`. The example Nginx configuration is
`deploy/nginx/frontend-demo.conf`. Add TLS using your normal certificate process.
Use a dedicated hostname, never a subpath on a production account hostname.

Normal builds leave both variables unset. The demo API adapter is dynamically
loaded behind a compile-time flag; its account and fixtures are excluded from
normal production output. Never enable this flag for a real API deployment.

## Behavior

- A new browser starts on the signed-out homepage.
- Password login is prefilled with `snowapidemo` / `1234567890`; OAuth and
  registration are unavailable.
- The account has a virtual $10,000 balance and the super-administrator interface.
- All management writes are rejected. Purchases and upgrades modify only virtual
  balance and subscription state; upgrades preserve the current expiry date.
- Interface language may be saved locally. Sample keys cannot call any model.
- Unknown API routes fail closed. There is no fallback to the production API.
- All fixtures are authored sample data, not exported production records.

State is stored in the visitor's local browser storage (`snowapi:demo:v1`).
Different browser profiles and private sessions do not share accounts. A shared
browser profile shares its local demonstration state. Clear this site's storage
to reset the demo. This is not an authentication or authorization system: visitors
can inspect and change their own local state, but no server account exists.

## Deployment checks

1. Confirm both `/snowapi/` and deep links load without a backend.
2. Confirm API/relay paths return an error rather than being proxied or served HTML.
3. Sign in, buy a virtual plan, refresh, and check its balance and expiry.
4. Open an independent browser context; it must start signed out with $10,000.
5. Attempt a management write and check the read-only error.
6. Verify the normal production build contains neither demo credentials nor fixtures.

Keep license notices and the source repository link available with the demo,
including new-api / QuantumNous attribution and third-party bundled licenses.
