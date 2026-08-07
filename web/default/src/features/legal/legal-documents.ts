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
export type BuiltInLegalSection = {
  id: string
  titleKey: string
  contentKeys: string[]
}

export type BuiltInLegalDocument = {
  summaryKey: string
  sections: BuiltInLegalSection[]
}

export const userAgreementDocument: BuiltInLegalDocument = {
  summaryKey:
    'These terms explain the rules for accessing SnowAPI, using API keys, purchasing subscriptions, and calling upstream AI services.',
  sections: [
    {
      id: 'acceptance',
      titleKey: 'Acceptance and scope',
      contentKeys: [
        'By creating an account, signing in, creating or using an API key, purchasing a subscription, or otherwise accessing SnowAPI, you agree to these Terms. If you use SnowAPI for an organization, you confirm that you are authorized to accept these Terms for that organization.',
        'You must be legally capable of entering into this agreement and comply with the laws that apply to you. If you do not agree, do not use the service.',
      ],
    },
    {
      id: 'accounts',
      titleKey: 'Accounts and API keys',
      contentKeys: [
        'Provide accurate registration information and keep it current. You are responsible for activity performed through your account and API keys, including activity by applications or people to whom you grant access.',
        'Keep passwords, API keys, invitation codes, and recovery information confidential. Notify the administrator promptly if you suspect unauthorized access, and rotate exposed keys without delay.',
      ],
    },
    {
      id: 'service',
      titleKey: 'Service and upstream providers',
      contentKeys: [
        'SnowAPI is an API gateway that routes supported requests to selected third-party AI providers. Model names, features, output quality, latency, context limits, and availability may depend on those providers and may change without notice.',
        'Your use of an upstream model may also be subject to that provider’s terms and policies. SnowAPI does not control upstream services and cannot guarantee that every model or endpoint will remain available.',
      ],
    },
    {
      id: 'acceptable-use',
      titleKey: 'Acceptable use',
      contentKeys: [
        'Do not use SnowAPI to violate law or third-party rights; distribute malware; interfere with networks or accounts; evade security, billing, quotas, or access controls; probe the service without authorization; resell access without permission; or generate, request, or distribute content prohibited by an applicable upstream provider.',
        'You must apply appropriate human review before relying on model output in medical, legal, financial, safety-critical, employment, credit, housing, education, or other high-impact decisions.',
      ],
    },
    {
      id: 'limits',
      titleKey: 'Usage limits and security controls',
      contentKeys: [
        'Requests may be subject to group, subscription, model, concurrency, TPM, rolling-window, abuse-prevention, and upstream limits. Limits may be adjusted to protect stability, security, fair access, or provider requirements.',
        'SnowAPI may automatically restrict or suspend activity that appears abusive or compromised, including unusual IP, country, ASN, credential-sharing, or overlapping-session patterns. Administrators may review and change these controls.',
      ],
    },
    {
      id: 'billing',
      titleKey: 'Billing, quotas, and subscriptions',
      contentKeys: [
        'Charges are calculated from recorded usage and the pricing method shown for the selected model, including token-based or per-request pricing. Token counts, cache usage, model multipliers, subscription windows, and successful-request rules may affect the final charge.',
        'Subscription benefits, quotas, reset periods, five-hour windows, expiry dates, and eligible groups are described at purchase. Except where required by law or expressly approved by the administrator, completed purchases and consumed usage are non-refundable.',
      ],
    },
    {
      id: 'content',
      titleKey: 'API content and intellectual property',
      contentKeys: [
        'You retain any rights you already hold in the prompts, files, and other content you submit. You grant SnowAPI the limited permission needed to process, transmit, secure, meter, and troubleshoot that content to provide the service.',
        'You are responsible for ensuring that you have the rights and permissions required for submitted content and for evaluating model output before use. Rights in output may be limited by law or upstream-provider terms.',
      ],
    },
    {
      id: 'availability',
      titleKey: 'Availability and service changes',
      contentKeys: [
        'The service is provided on an as-available basis. Maintenance, provider incidents, network failures, security events, or capacity limits may interrupt access. We may add, modify, replace, or retire models, endpoints, prices, limits, and features.',
        'When reasonably practical, material changes will be communicated through the service. You are responsible for keeping integrations resilient and maintaining backups of information you need.',
      ],
    },
    {
      id: 'termination',
      titleKey: 'Suspension and termination',
      contentKeys: [
        'Access may be limited, suspended, or terminated when necessary to address suspected abuse, security risk, non-payment, legal obligations, upstream requirements, or a material breach of these Terms. Emergency action may occur without advance notice.',
        'You may stop using SnowAPI at any time. Account deletion does not cancel obligations already incurred and may not immediately remove records that must be retained for security, billing, dispute resolution, or law.',
      ],
    },
    {
      id: 'responsibility',
      titleKey: 'Disclaimers, responsibility, and changes',
      contentKeys: [
        'AI output can be inaccurate, incomplete, offensive, or unsuitable. To the maximum extent permitted by law, SnowAPI and its administrators are not responsible for decisions made solely from model output, upstream-provider failures, or indirect and consequential losses.',
        'These Terms may be updated as the service or law changes. The displayed update date identifies the current version. Continue using SnowAPI after an effective update only if you accept the revised Terms. Questions or disputes should be sent through the administrator contact channel published for the service.',
      ],
    },
  ],
}

export const privacyPolicyDocument: BuiltInLegalDocument = {
  summaryKey:
    'This policy describes what SnowAPI processes, why it is needed, when information reaches upstream providers, and the choices available to you.',
  sections: [
    {
      id: 'scope',
      titleKey: 'Scope of this policy',
      contentKeys: [
        'This Privacy Policy applies when you visit SnowAPI, create or use an account, manage API keys, purchase or redeem access, or send requests through the API. It does not replace the privacy policies of upstream AI providers or other third-party services.',
      ],
    },
    {
      id: 'collection',
      titleKey: 'Information we collect',
      contentKeys: [
        'We process account and authentication information such as username, email when provided, user and group identifiers, password verifiers, session data, passkeys, invitation or redemption records, and security settings.',
        'We also process service and transaction records such as API-key identifiers, model and endpoint selections, timestamps, token and cache counts, request status, quota changes, subscriptions, payments, refunds, and administrator actions.',
      ],
    },
    {
      id: 'api-content',
      titleKey: 'API requests and model content',
      contentKeys: [
        'Prompts, messages, files, images, and other request content are processed so the request can be validated, routed, transmitted to the selected upstream provider, and returned to you. Do not submit sensitive information unless it is necessary and you are authorized to do so.',
        'Upstream providers receive the content and technical metadata needed to answer a request and process it under their own terms and privacy practices. SnowAPI does not sell your prompts or use them for targeted advertising.',
      ],
    },
    {
      id: 'purposes',
      titleKey: 'How information is used',
      contentKeys: [
        'Information is used to provide and secure the service, authenticate users, route requests, calculate charges and limits, deliver subscriptions, maintain logs, respond to support requests, investigate errors or abuse, enforce these Terms, and meet legal obligations.',
        'Where applicable, processing is based on performing the service you request, protecting legitimate security and operational interests, complying with law, or your consent for an optional feature.',
      ],
    },
    {
      id: 'security-audit',
      titleKey: 'Logs, IP audit, and automated protection',
      contentKeys: [
        'Security and usage logs may include IP address, approximate country, ASN or network provider, user agent, request timing, model, usage, cost, status, and error details. This information supports account protection, fraud prevention, troubleshooting, metering, and service reliability.',
        'SnowAPI may compare recent IP, country, ASN, and overlapping request patterns to detect credential sharing or compromise and may automatically block an account. Administrators can review or change a block. You may request human review through the administrator contact channel.',
      ],
    },
    {
      id: 'third-parties',
      titleKey: 'Service providers and disclosures',
      contentKeys: [
        'Information may be shared with upstream AI providers, infrastructure and hosting operators, network and security services, payment providers when enabled, and professional advisers only as needed for their role. It may also be disclosed when required by law or to protect users, the service, or others.',
        'SnowAPI uses Cloudflare Turnstile to help distinguish people from abusive automation. Turnstile may process browser and device signals and issues a token that SnowAPI validates with Cloudflare.',
      ],
    },
    {
      id: 'storage',
      titleKey: 'Cookies and local storage',
      contentKeys: [
        'SnowAPI uses cookies or browser storage that are necessary for sign-in, session security, language, theme, interface state, and abuse prevention. Blocking required storage may prevent parts of the service from working.',
        'We do not use SnowAPI account data to build third-party advertising profiles.',
      ],
    },
    {
      id: 'retention',
      titleKey: 'Retention and deletion',
      contentKeys: [
        'Information is kept only for as long as reasonably needed for the purposes described here. Retention differs by record type: active account and subscription records may last for the account lifetime, while billing, security, audit, backup, and dispute records may be kept longer where necessary.',
        'Deleting an account removes or de-identifies information when reasonably possible, but does not require deletion of records that must be retained for law, fraud prevention, accounting, security, or the establishment and defense of legal claims.',
      ],
    },
    {
      id: 'transfers',
      titleKey: 'International processing and security',
      contentKeys: [
        'SnowAPI and its providers may process information in countries other than your own. Where applicable law requires safeguards for cross-border transfers, appropriate contractual or legal mechanisms should be used.',
        'We use access controls, credential protection, encrypted transport, audit logging, and operational safeguards appropriate to the service. No internet service is completely secure, so protect your credentials and report suspected compromise promptly.',
      ],
    },
    {
      id: 'rights',
      titleKey: 'Your choices, rights, and contact',
      contentKeys: [
        'Depending on your location, you may have rights to request access, correction, deletion, restriction, objection, portability, or human review of certain automated decisions. Some requests may be limited where identity cannot be verified or retention is required by law or security needs.',
        'SnowAPI is not intended for children who cannot legally consent to the service in their location. This Policy may be updated as the service or law changes; the displayed update date identifies the current version. Submit privacy requests through the administrator contact channel published for SnowAPI.',
      ],
    },
  ],
}
