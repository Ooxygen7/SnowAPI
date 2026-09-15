/* Copyright (C) 2023-2026 QuantumNous — AGPL-3.0-or-later */
import assert from 'node:assert/strict'
import { before, test } from 'node:test'

import i18next from 'i18next'

import { localizeApiMessage } from './api-messages'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zh from './locales/zh.json'

before(async () => {
  await i18next.init({
    lng: 'ja',
    resources: { en, ja, zhCN: zh },
    keySeparator: false,
    nsSeparator: false,
  })
})

test('known server errors use the selected language, including legacy Chinese and lowercase errors', async () => {
  await i18next.changeLanguage('ja')
  assert.equal(
    localizeApiMessage('Subscription changed; refresh before saving'),
    ja.translation['Subscription changed; refresh before saving']
  )
  assert.equal(
    localizeApiMessage('subscription changed; refresh before saving'),
    ja.translation['Subscription changed; refresh before saving']
  )
  assert.equal(
    localizeApiMessage('邀请码已被使用'),
    ja.translation['Invitation code already used']
  )
  await i18next.changeLanguage('zhCN')
  assert.equal(
    localizeApiMessage('Redemption code has expired'),
    '兑换码已过期'
  )
})

test('control markers and unknown diagnostics are preserved exactly', () => {
  for (const message of [
    '',
    'success',
    'error',
    'bind',
    'Unknown upstream error: request abc-123',
  ]) {
    assert.equal(localizeApiMessage(message), message)
  }
})
