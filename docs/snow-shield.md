# SnowShield browser verification

SnowShield adds a white, localized entry page backed by Cloudflare Turnstile. The
LatticeLoader animation is adapted from React Bits; its third-party license is
included beside the component and in the frontend distribution.

## Deployment

Disabled by default. Manage it under **System Settings → Authentication → Bot
Protection**. The SnowShield toggle is separate from login/registration
Turnstile verification. Save the protected hostname and trust duration (1–1440
minutes); these settings take effect without a restart. New clearances use the
saved duration; existing clearances keep their signed expiration.

The form shares Turnstile keys with login verification. Blank key fields preserve
the existing keys; secrets are never returned by the options endpoint. The whole
form is validated and committed in one database transaction. Enabling requires
HTTPS, secure cookies, both keys, and the current site's hostname. When enabling
Cloudflare entry protection, disable SnowShield to avoid stacked entry checks.

These environment variables remain bootstrap defaults for existing deployments
until a settings form is saved. Saved database configuration takes precedence:

```env
SNOW_SHIELD_ENABLED=true
SNOW_SHIELD_HOSTNAME=api.example.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_TRUSTED_URL=https://api.example.com
```

The hostname must match the Turnstile widget's allowed hostname. The application
fails startup if required settings are absent, rather than silently disabling
protection. Verification requires HTTPS. Use the SnowShield toggle to disable
only this entry gate. Changing a bootstrap environment variable does not override
saved settings. Existing login verification and authentication remain independent.

## Security boundary

- Dashboard APIs require a signed `__Host-snow_shield` cookie (one hour by default). It is
  Secure, HttpOnly, SameSite=Lax, host-only, and separate from the login session.
- Logged-in users are challenged again when trust expires. The entry gate checks
  on each full load, expires its in-memory state, and checks again when a suspended
  tab resumes. No login identity is created, changed, or refreshed by SnowShield.
- Initial clearance checks keep the normal page background, with neither protected
  content nor a challenge mounted until the server responds. A valid clearance
  therefore does not briefly flash the verification page on reload.
- Status checks use the normal API rate limit, not the stricter login/verification
  budget. Proof submission uses the same configured critical-operation limit
  in a separate IP bucket, so browser checks cannot exhaust the login budget.
- A five-minute challenge cookie binds the provider response to the verification
  ID. The server checks the provider verdict, hostname, action, and challenge ID.
- A timed-out or failed provider request does not grant clearance. The page offers
  a localized manual-verification button. Automatic SDK retries and expired-token
  refreshes are disabled for the entry gate. A silent challenge stops after 45
  seconds; a visible interactive challenge uses Cloudflare's interaction timeout.
  A manual attempt rechecks server state and shows the official widget. Use a
  **Managed** Turnstile sitekey for checkbox fallback; Cloudflare decides whether
  a checkbox is needed. Invisible/non-interactive sitekeys cannot offer one.
  Tokens, secrets, and cookie contents are not logged.
- Model relay routes are not browser-challenged; normal API-key checks and rate
  limits remain in force. OAuth callbacks and payment notifications preserve
  their existing state/signature checks. Valid automation access tokens can still
  use dashboard APIs, which continue to enforce their normal authorization.
- Public status, setup, and legal endpoints remain available. Static application
  files are public; the gate is not a confidentiality boundary for frontend code.
- Cloudflare edge WAF/challenge settings are independent of this feature.

The UI uses device language: Chinese, Japanese, or English for all other locales.
The site-language preference does not override this page. The static demo bypasses
SnowShield and never contacts the production verification service.

## Availability and release checks

- The shield's scoped CSS is also embedded in the entry HTML. A failed external
  stylesheet cannot strip the verification screen or its recovery controls.
- Install hashed frontend assets before switching the HTML/backend release.
  Missing static files must return `Cache-Control: no-store` (see the Nginx
  template), never a CDN-cacheable error. Existing negative CDN cache entries
  need a purge or a new content-hashed filename; changing origin headers alone
  does not evict them.
- The screen distinguishes rate limiting, expired/missing challenge cookies,
  network/service failure, and a provider verdict. Its diagnostic code and ID
  should be correlated with backend/access logs; an ID of `—` means no challenge
  ID was obtained, not that Cloudflare necessarily rejected the visitor.
- Provider errors are logged as known categories only. Upstream outages use 503;
  invalid proofs still fail closed. Do not exempt protected APIs to fix an outage.
