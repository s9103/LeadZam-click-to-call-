'use strict';

const crypto = require('crypto');

/**
 * FCM message construction, sending, and error classification.
 *
 * Design notes (also explained in the README):
 *  - DATA-ONLY message (no `notification` block). With a `notification` block Android
 *    shows the tray notification itself while the app is in the background and our
 *    code is NOT called, so we could not attach a "Call" action or record the request.
 *    A data message always reaches FirebaseMessagingService.onMessageReceived, so the
 *    app decides what to show for foreground vs background.
 *  - priority "high" so the message is delivered promptly even in Doze.
 *  - ttl of 5 minutes: a "call this lead now" request is worthless an hour later, so
 *    FCM should drop it instead of delivering it when the phone comes back online.
 *  - No collapse_key: two different leads clicked in a row must both be delivered.
 */

const FCM_TTL_MS = 5 * 60 * 1000;

function buildMessage(token, { requestId, phoneNumber, contactName }) {
  return {
    token,
    data: {
      type: 'dial_request',
      requestId,
      phoneNumber,
      contactName: contactName || '',
      sentAt: new Date().toISOString(),
    },
    android: {
      priority: 'high',
      ttl: FCM_TTL_MS,
    },
  };
}

function notConfigured(message) {
  const err = new Error(message);
  err.code = 'app/not-configured';
  return err;
}

/** Real sender using firebase-admin. Credentials are read from env, never from the repo. */
function createFirebaseSender(env = process.env) {
  let messaging = null;

  function hasCredentials() {
    return Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON || env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  function init() {
    if (messaging) return messaging;
    // Required lazily so mock mode and tests do not need Firebase at all.
    const admin = require('firebase-admin');
    let credential;
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      let parsed;
      try {
        parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (_err) {
        throw notConfigured('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON');
      }
      credential = admin.credential.cert(parsed);
    } else if (env.GOOGLE_APPLICATION_CREDENTIALS) {
      credential = admin.credential.applicationDefault();
    } else {
      throw notConfigured(
        'Firebase credentials are not configured (set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON)'
      );
    }
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential });
    messaging = admin.messaging(app);
    return messaging;
  }

  return {
    mode: 'live',
    isConfigured: hasCredentials,
    async send(message) {
      const messageId = await init().send(message);
      return { messageId };
    },
  };
}

/**
 * Mock sender: logs instead of calling Firebase. Lets you try the dashboard without a
 * Firebase project. Tokens starting with "invalid" / "unregistered" simulate the two
 * most common real FCM failures so the error UI can be demonstrated.
 */
function createMockSender() {
  return {
    mode: 'mock',
    isConfigured: () => true,
    async send(message) {
      if (message.token.startsWith('invalid')) {
        const err = new Error('Mock: invalid registration token');
        err.code = 'messaging/invalid-registration-token';
        throw err;
      }
      if (message.token.startsWith('unregistered')) {
        const err = new Error('Mock: token not registered');
        err.code = 'messaging/registration-token-not-registered';
        throw err;
      }
      console.log('[mock-fcm] would send:', JSON.stringify(message.data));
      return { messageId: `mock-${crypto.randomUUID()}` };
    },
  };
}

/**
 * Maps a send failure to an HTTP status + stable error code for the dashboard.
 * `clearToken` means the stored token is useless and should be forgotten.
 * `retryable` means trying again later may work.
 */
function describeSendError(err) {
  const code = err && err.code ? String(err.code) : '';
  switch (code) {
    case 'messaging/registration-token-not-registered':
      return {
        status: 410,
        code: 'DEVICE_TOKEN_UNREGISTERED',
        message:
          'The device token is no longer registered (app reinstalled or token rotated). Open the Android app and register again.',
        clearToken: true,
        retryable: false,
      };
    case 'messaging/invalid-registration-token':
    case 'messaging/invalid-argument':
      return {
        status: 400,
        code: 'DEVICE_TOKEN_INVALID',
        message: 'FCM rejected the device token as invalid. Register the device again.',
        clearToken: true,
        retryable: false,
      };
    case 'app/not-configured':
      return {
        status: 503,
        code: 'FCM_NOT_CONFIGURED',
        message: 'The server has no Firebase credentials configured. Check the backend setup in the README.',
        clearToken: false,
        retryable: false,
      };
    case 'messaging/authentication-error':
    case 'messaging/third-party-auth-error':
    case 'messaging/mismatched-credential':
    case 'app/invalid-credential':
      return {
        status: 500,
        code: 'FCM_CREDENTIALS_ERROR',
        message: 'The server could not authenticate with Firebase. Check the service-account credentials.',
        clearToken: false,
        retryable: false,
      };
    case 'messaging/server-unavailable':
    case 'messaging/internal-error':
    case 'messaging/message-rate-exceeded':
    case 'messaging/device-message-rate-exceeded':
    case 'messaging/quota-exceeded':
    case 'app/network-error':
    case 'app/network-timeout':
      return {
        status: 503,
        code: 'FCM_UNAVAILABLE',
        message: 'Firebase is temporarily unavailable or rate limiting. Please try again in a moment.',
        clearToken: false,
        retryable: true,
      };
    default:
      return {
        status: 502,
        code: 'FCM_SEND_FAILED',
        message: 'Firebase could not accept the message. Please try again.',
        clearToken: false,
        retryable: true,
      };
  }
}

module.exports = {
  FCM_TTL_MS,
  buildMessage,
  createFirebaseSender,
  createMockSender,
  describeSendError,
};
