# Security Policy

## Supported code

Security fixes are applied to the current SnowAPI source tree. Historical deployment snapshots are not maintained as separate supported releases.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials, user data, payment data, authentication bypasses or remote code execution.

Report the issue privately to the repository owner through GitHub. Include:

- the affected commit and component;
- reproduction steps;
- expected and actual behavior;
- the security impact;
- any suggested mitigation.

Remove real access tokens, passwords, cookies, personal data and production host details from the report.

## Deployment responsibility

Operators must generate unique session and encryption secrets, use HTTPS, restrict database and Redis access, keep dependencies updated, and back up data before upgrades.
