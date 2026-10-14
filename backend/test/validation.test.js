'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePhoneNumber,
  normalizeContactName,
  validateDialInput,
  validateDeviceToken,
} = require('../src/validation');

test('phone: strips formatting and keeps a leading +', () => {
  assert.deepEqual(normalizePhoneNumber('+91 98765 43210'), { ok: true, value: '+919876543210' });
  assert.deepEqual(normalizePhoneNumber('(022) 2345-6789'), { ok: true, value: '02223456789' });
  assert.deepEqual(normalizePhoneNumber('  9876543210  '), { ok: true, value: '9876543210' });
});

test('phone: rejects empty, missing and non-string values', () => {
  for (const bad of [undefined, null, '', '   ']) {
    const r = normalizePhoneNumber(bad);
    assert.equal(r.ok, false);
    assert.match(r.error, /required/);
  }
  assert.equal(normalizePhoneNumber(9876543210).ok, false);
  assert.equal(normalizePhoneNumber({}).ok, false);
});

test('phone: rejects letters and USSD/MMI characters', () => {
  for (const bad of ['98-ABC-12', '*#06#', '*21*123456789#', '+91 98765 4321O', '12345;rm', '++919876543210', '9198+76543210']) {
    assert.equal(normalizePhoneNumber(bad).ok, false, `${bad} should be rejected`);
  }
});

test('phone: enforces 7-15 digits', () => {
  assert.equal(normalizePhoneNumber('123456').ok, false);
  assert.equal(normalizePhoneNumber('1234567').ok, true);
  assert.equal(normalizePhoneNumber('+123456789012345').ok, true);
  assert.equal(normalizePhoneNumber('+1234567890123456').ok, false);
});

test('contactName: optional, trimmed, control characters removed, length capped', () => {
  assert.deepEqual(normalizeContactName(undefined), { ok: true, value: '' });
  assert.deepEqual(normalizeContactName('  Rahul\n Sharma  '), { ok: true, value: 'Rahul Sharma' });
  assert.equal(normalizeContactName('x'.repeat(81)).ok, false);
  assert.equal(normalizeContactName(42).ok, false);
});

test('validateDialInput: collects all field errors', () => {
  const r = validateDialInput({ phoneNumber: 'abc', contactName: 5 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.phoneNumber);
  assert.ok(r.errors.contactName);
});

test('validateDialInput: rejects non-object bodies', () => {
  for (const bad of [null, undefined, 'x', 5, []]) {
    assert.equal(validateDialInput(bad).ok, false);
  }
});

test('validateDialInput: returns normalized value', () => {
  const r = validateDialInput({ phoneNumber: '+91 98765 43210', contactName: 'Rahul Sharma' });
  assert.deepEqual(r, { ok: true, value: { phoneNumber: '+919876543210', contactName: 'Rahul Sharma' } });
});

test('device token: rejects empty, whitespace and absurd lengths', () => {
  assert.equal(validateDeviceToken('').ok, false);
  assert.equal(validateDeviceToken(undefined).ok, false);
  assert.equal(validateDeviceToken('short').ok, false);
  assert.equal(validateDeviceToken('a'.repeat(30) + ' ' + 'b'.repeat(30)).ok, false);
  assert.equal(validateDeviceToken('a'.repeat(5000)).ok, false);
  assert.equal(validateDeviceToken('  ' + 'a'.repeat(152) + '  ').value, 'a'.repeat(152));
});
