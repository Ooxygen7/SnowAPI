# SnowShield browser verification

SnowShield adds a white, localized entry page backed by Cloudflare Turnstile. The
LatticeLoader animation is adapted from React Bits; its third-party license is
included beside the component and in the frontend distribution.

## Deployment

Disabled by default. Configure valid Turnstile site/secret keys in system
settings, then add these environment variables to the backend service:

```env
SNOW_SHIELD_ENABLED=true
SNOW_SHIELD_HOSTNAME=api.example.com
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_TRUSTED_URL=https://api.example.com
```

The hostname must match the Turnstile widget's allowed hostname. The application
fails startup if required settings are absent, rather than silently disabling
protection. Verification requires HTTPS. To disable only this entry gate, remove
`SNOW_SHIELD_ENABLED` or set it to `false` and restart the backend. Existing login
verification and application authentication remain unchanged.

## Security boundary

- Dashboard APIs require a signed, one-hour `__Host-snow_shield` cookie. It is
  Secure, HttpOnly, SameSite=Lax, host-only, and separate from the login session.
- Logged-in users are challenged again when trust expires. The entry gate checks
  on each full load, expires its in-memory state, and checks again when a suspended
  tab resumes. No login identity is created, changed, or refreshed by SnowShield.
- Initial clearance checks keep the normal page background, with neither protected
  content nor a challenge mounted until the server responds. A valid clearance
  therefore does not briefly flash the verification page on reload.
- A five-minute challenge cookie binds the provider response to the verification
  ID. The server checks the provider verdict, hostname, action, and challenge ID.
- A timed-out or failed provider request does not grant clearance. The page offers
  a localized retry. Tokens, secrets, and cookie contents are not logged.
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
