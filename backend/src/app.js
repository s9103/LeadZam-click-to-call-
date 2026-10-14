'use strict';

const express = require('express');
const {
  ACK_STATUSES,
  validateDialInput,
  validateDeviceToken,
  validateDeviceName,
} = require('./validation');
const { buildMessage, describeSendError } = require('./fcm');
const { maskToken } = require('./store');
const { listLeads } = require('./leads');

const DEFAULT_SEND_TIMEOUT_MS = 10_000;

function errorBody(code, message, fields) {
  const error = { code, message };
  if (fields) error.fields = fields;
  return { error };
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`FCM send timed out after ${ms}ms`);
      err.code = 'app/network-timeout';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function publicDevice(device) {
  if (!device) return { registered: false };
  return {
    registered: true,
    deviceName: device.deviceName,
    tokenPreview: maskToken(device.token),
    registeredAt: device.registeredAt,
    source: device.source,
  };
}

/**
 * Builds the Express app. Dependencies are injected so tests can swap in a fake FCM
 * sender and an in-memory device store.
 */
function createApp({ sender, deviceStore, history, webRoot, sendTimeoutMs = DEFAULT_SEND_TIMEOUT_MS }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, fcmMode: sender.mode, fcmConfigured: sender.isConfigured() });
  });

  app.get('/api/leads', (_req, res) => res.json({ leads: listLeads() }));

  // ---- Device registration -------------------------------------------------
  app.get('/api/device', (_req, res) => res.json(publicDevice(deviceStore.get())));

  app.post('/api/device', (req, res) => {
    const body = req.body || {};
    const token = validateDeviceToken(body.token);
    const name = validateDeviceName(body.deviceName);
    const errors = {};
    if (!token.ok) errors.token = token.error;
    if (!name.ok) errors.deviceName = name.error;
    if (Object.keys(errors).length > 0) {
      return res.status(400).json(errorBody('VALIDATION_ERROR', 'Invalid device registration', errors));
    }
    const device = deviceStore.set({ token: token.value, deviceName: name.value });
    console.log(`[device] registered "${device.deviceName}" (${maskToken(device.token)})`);
    return res.status(201).json(publicDevice(device));
  });

  app.delete('/api/device', (_req, res) => {
    deviceStore.clear();
    res.json(publicDevice(deviceStore.get()));
  });

  // ---- Click-to-Call -------------------------------------------------------
  app.post('/api/dial', async (req, res) => {
    const input = validateDialInput(req.body);
    if (!input.ok) {
      return res.status(400).json(errorBody('VALIDATION_ERROR', 'Invalid call request', input.errors));
    }

    const device = deviceStore.get();
    if (!device) {
      return res
        .status(409)
        .json(
          errorBody(
            'NO_DEVICE',
            'No Android device is registered. Open the Android app and tap "Register with backend", or paste its token on this page.'
          )
        );
    }

    const record = history.create(input.value);
    try {
      const message = buildMessage(device.token, { requestId: record.requestId, ...input.value });
      const { messageId } = await withTimeout(sender.send(message), sendTimeoutMs);
      history.markAccepted(record.requestId, messageId);
      return res.status(202).json({
        requestId: record.requestId,
        status: 'accepted_by_fcm',
        fcmMessageId: messageId,
        message: 'FCM accepted the request. This does not yet confirm that the phone received it.',
      });
    } catch (err) {
      const described = describeSendError(err);
      if (described.clearToken && device.source === 'registered') deviceStore.clear();
      history.markFailed(record.requestId, { code: described.code, message: described.message });
      console.error(`[dial] ${record.requestId} failed: ${err.code || ''} ${err.message}`);
      return res.status(described.status).json({
        requestId: record.requestId,
        error: { code: described.code, message: described.message, retryable: described.retryable },
      });
    }
  });

  // ---- Acknowledgements from the Android app --------------------------------
  app.post('/api/ack', (req, res) => {
    const { requestId, status } = req.body || {};
    if (typeof requestId !== 'string' || !ACK_STATUSES.includes(status)) {
      return res
        .status(400)
        .json(errorBody('VALIDATION_ERROR', `requestId and status (${ACK_STATUSES.join(' | ')}) are required`));
    }
    const record = history.applyAck(requestId, status);
    if (!record) return res.status(404).json(errorBody('UNKNOWN_REQUEST', 'No such call request'));
    return res.json({ ok: true, status: record.status });
  });

  app.get('/api/requests', (_req, res) => res.json({ requests: history.list() }));

  // ---- Static dashboard ----------------------------------------------------
  if (webRoot) app.use(express.static(webRoot));

  app.use('/api', (_req, res) => res.status(404).json(errorBody('NOT_FOUND', 'Unknown API route')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json(errorBody('INVALID_JSON', 'Request body is not valid JSON'));
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'));
    }
    console.error('[server] unexpected error:', err);
    return res.status(500).json(errorBody('INTERNAL_ERROR', 'Unexpected server error'));
  });

  return app;
}

module.exports = { createApp };
