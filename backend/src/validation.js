'use strict';

/**
 * Input validation for the API. Pure functions, no I/O, so they are easy to unit test.
 * Each validator returns either { ok: true, value } or { ok: false, error }.
 */

const MAX_CONTACT_NAME_LENGTH = 80;
const MAX_DEVICE_NAME_LENGTH = 60;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15; // E.164 upper bound

// Digits, spaces, dashes, dots, parentheses, and ONE optional leading "+".
// This deliberately rejects "*", "#" and letters so a request can never carry a
// USSD / MMI code (e.g. "*#06#") into the dialer.
const PHONE_ALLOWED_CHARS = /^\+?[0-9\s\-().]+$/;

const ACK_STATUSES = ['received', 'dialer_opened', 'dismissed'];

function normalizePhoneNumber(raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { ok: false, error: 'phoneNumber is required' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'phoneNumber must be a string' };
  }
  const trimmed = raw.trim();
  if (!PHONE_ALLOWED_CHARS.test(trimmed)) {
    return {
      ok: false,
      error: 'phoneNumber may only contain digits, spaces, - . ( ) and an optional leading +',
    };
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return {
      ok: false,
      error: `phoneNumber must contain ${MIN_PHONE_DIGITS}-${MAX_PHONE_DIGITS} digits`,
    };
  }
  return { ok: true, value: (trimmed.startsWith('+') ? '+' : '') + digits };
}

function normalizeContactName(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'contactName must be a string' };
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > MAX_CONTACT_NAME_LENGTH) {
    return { ok: false, error: `contactName must be at most ${MAX_CONTACT_NAME_LENGTH} characters` };
  }
  return { ok: true, value: cleaned };
}

/** Validates the body of POST /api/dial. */
function validateDialInput(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: { body: 'A JSON object is expected' } };
  }
  const errors = {};
  const phone = normalizePhoneNumber(body.phoneNumber);
  if (!phone.ok) errors.phoneNumber = phone.error;
  const name = normalizeContactName(body.contactName);
  if (!name.ok) errors.contactName = name.error;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { phoneNumber: phone.value, contactName: name.value } };
}

/**
 * Cheap sanity check on an FCM registration token. We cannot know whether a token is
 * really valid without asking FCM, so this only rejects obvious garbage early.
 */
function validateDeviceToken(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'token is required' };
  }
  const token = raw.trim();
  if (/\s/.test(token)) return { ok: false, error: 'token must not contain whitespace' };
  if (token.length < 20 || token.length > 4096) {
    return { ok: false, error: 'token does not look like an FCM registration token' };
  }
  return { ok: true, value: token };
}

function validateDeviceName(raw) {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 'Android device' };
  if (typeof raw !== 'string') return { ok: false, error: 'deviceName must be a string' };
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > MAX_DEVICE_NAME_LENGTH) {
    return { ok: false, error: `deviceName must be at most ${MAX_DEVICE_NAME_LENGTH} characters` };
  }
  return { ok: true, value: cleaned || 'Android device' };
}

module.exports = {
  ACK_STATUSES,
  normalizePhoneNumber,
  normalizeContactName,
  validateDialInput,
  validateDeviceToken,
  validateDeviceName,
};
