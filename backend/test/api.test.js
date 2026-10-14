'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { DeviceStore, RequestHistory } = require('../src/store');

const TOKEN = 'fake-fcm-token-' + 'x'.repeat(60);

/** Starts the real Express app on a random port with a controllable fake FCM sender. */
async function startServer({ sendImpl, sendTimeoutMs = 1000, registered = true } = {}) {
  const sent = [];
  const sender = {
    mode: 'test',
    isConfigured: () => true,
    async send(message) {
      sent.push(message);
      if (sendImpl) return sendImpl(message);
      return { messageId: 'projects/test/messages/123' };
    },
  };
  const deviceStore = new DeviceStore();
  if (registered) deviceStore.set({ token: TOKEN, deviceName: 'Test phone' });
  const history = new RequestHistory();
  const app = createApp({ sender, deviceStore, history, sendTimeoutMs });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, sent, deviceStore, close: () => new Promise((r) => server.close(r)) };
}

const VALID = { phoneNumber: '+91 98765 43210', contactName: 'Rahul Sharma' };

test('POST /api/dial sends a data-only high-priority FCM message with the normalized number', async () => {
  const s = await startServer();
  try {
    const r = await s.call('POST', '/api/dial', VALID);
    assert.equal(r.status, 202);
    assert.equal(r.body.status, 'accepted_by_fcm');
    assert.ok(r.body.requestId);

    assert.equal(s.sent.length, 1);
    const msg = s.sent[0];
    assert.equal(msg.token, TOKEN);
    assert.equal(msg.notification, undefined, 'must be data-only so the app controls the UX');
    assert.equal(msg.android.priority, 'high');
    assert.ok(msg.android.ttl > 0);
    assert.equal(msg.data.type, 'dial_request');
    assert.equal(msg.data.phoneNumber, '+919876543210');
    assert.equal(msg.data.contactName, 'Rahul Sharma');
    assert.equal(msg.data.requestId, r.body.requestId);
    for (const value of Object.values(msg.data)) assert.equal(typeof value, 'string');
  } finally {
    await s.close();
  }
});

test('POST /api/dial rejects an invalid number with field errors and does not call FCM', async () => {
  const s = await startServer();
  try {
    const r = await s.call('POST', '/api/dial', { phoneNumber: '98-ABC-12', contactName: 'Anita' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'VALIDATION_ERROR');
    assert.ok(r.body.error.fields.phoneNumber);
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test('POST /api/dial rejects empty body and malformed JSON', async () => {
  const s = await startServer();
  try {
    assert.equal((await s.call('POST', '/api/dial', {})).status, 400);
    const bad = await s.call('POST', '/api/dial', '{not json');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_JSON');
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test('POST /api/dial returns 409 NO_DEVICE when nothing is registered', async () => {
  const s = await startServer({ registered: false });
  try {
    const r = await s.call('POST', '/api/dial', VALID);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'NO_DEVICE');
    assert.equal(s.sent.length, 0);
  } finally {
    await s.close();
  }
});

test('device registration validates the token, then enables dialing', async () => {
  const s = await startServer({ registered: false });
  try {
    const bad = await s.call('POST', '/api/device', { token: 'nope' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.token);

    const ok = await s.call('POST', '/api/device', { token: TOKEN, deviceName: 'Pixel 7' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.registered, true);
    assert.equal(ok.body.deviceName, 'Pixel 7');
    assert.ok(!JSON.stringify(ok.body).includes(TOKEN), 'full token must never be echoed back');

    assert.equal((await s.call('POST', '/api/dial', VALID)).status, 202);
  } finally {
    await s.close();
  }
});

test('unregistered token: returns 410, forgets the token and records the failure', async () => {
  const s = await startServer({
    sendImpl: async () => {
      const err = new Error('gone');
      err.code = 'messaging/registration-token-not-registered';
      throw err;
    },
  });
  try {
    const r = await s.call('POST', '/api/dial', VALID);
    assert.equal(r.status, 410);
    assert.equal(r.body.error.code, 'DEVICE_TOKEN_UNREGISTERED');
    assert.equal((await s.call('GET', '/api/device')).body.registered, false);

    const history = (await s.call('GET', '/api/requests')).body.requests;
    assert.equal(history[0].status, 'failed');
    assert.equal(history[0].error.code, 'DEVICE_TOKEN_UNREGISTERED');
  } finally {
    await s.close();
  }
});

test('generic FCM failure: 502 and retryable, token kept', async () => {
  const s = await startServer({
    sendImpl: async () => {
      throw new Error('boom');
    },
  });
  try {
    const r = await s.call('POST', '/api/dial', VALID);
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, 'FCM_SEND_FAILED');
    assert.equal(r.body.error.retryable, true);
    assert.equal((await s.call('GET', '/api/device')).body.registered, true);
  } finally {
    await s.close();
  }
});

test('FCM that never answers is cut off with 503 instead of hanging the dashboard', async () => {
  const s = await startServer({ sendImpl: () => new Promise(() => {}), sendTimeoutMs: 50 });
  try {
    const r = await s.call('POST', '/api/dial', VALID);
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'FCM_UNAVAILABLE');
  } finally {
    await s.close();
  }
});

test('missing server credentials surface as FCM_NOT_CONFIGURED (503)', async () => {
  const s = await startServer({
    sendImpl: async () => {
      const err = new Error('no creds');
      err.code = 'app/not-configured';
      throw err;
    },
  });
  try {
    const r = await s.call('POST', '/api/dial', VALID);
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'FCM_NOT_CONFIGURED');
  } finally {
    await s.close();
  }
});

test('acks move a request forward and never backwards', async () => {
  const s = await startServer();
  try {
    const { body } = await s.call('POST', '/api/dial', VALID);
    const id = body.requestId;
    const statusOf = async () => (await s.call('GET', '/api/requests')).body.requests[0].status;

    assert.equal(await statusOf(), 'accepted_by_fcm');
    await s.call('POST', '/api/ack', { requestId: id, status: 'received' });
    assert.equal(await statusOf(), 'received_by_device');
    await s.call('POST', '/api/ack', { requestId: id, status: 'dialer_opened' });
    assert.equal(await statusOf(), 'dialer_opened');
    // A late/duplicate "received" must not downgrade the status.
    await s.call('POST', '/api/ack', { requestId: id, status: 'received' });
    assert.equal(await statusOf(), 'dialer_opened');
  } finally {
    await s.close();
  }
});

test('ack validation: unknown request is 404, bad status is 400', async () => {
  const s = await startServer();
  try {
    assert.equal((await s.call('POST', '/api/ack', { requestId: 'nope', status: 'received' })).status, 404);
    assert.equal((await s.call('POST', '/api/ack', { requestId: 'x', status: 'delivered' })).status, 400);
    assert.equal((await s.call('POST', '/api/ack', {})).status, 400);
  } finally {
    await s.close();
  }
});

test('multiple quick requests each get their own requestId and FCM message', async () => {
  const s = await startServer();
  try {
    const [a, b] = await Promise.all([
      s.call('POST', '/api/dial', VALID),
      s.call('POST', '/api/dial', { phoneNumber: '+91 91234 56780', contactName: 'Priya Nair' }),
    ]);
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    assert.notEqual(a.body.requestId, b.body.requestId);
    assert.equal(s.sent.length, 2);
    assert.equal(s.sent[0].collapseKey, undefined);
    assert.equal(s.sent[0].android.collapseKey, undefined);
  } finally {
    await s.close();
  }
});

test('GET /api/leads returns sample leads; unknown API routes return JSON 404', async () => {
  const s = await startServer();
  try {
    const leads = await s.call('GET', '/api/leads');
    assert.equal(leads.status, 200);
    assert.ok(leads.body.leads.length >= 3);
    const unknown = await s.call('GET', '/api/nope');
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, 'NOT_FOUND');
  } finally {
    await s.close();
  }
});
