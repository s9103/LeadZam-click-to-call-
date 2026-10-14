'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Holds the single demo device. Kept deliberately tiny: one token, optionally persisted
 * to a git-ignored JSON file so a server restart does not lose the registration.
 * (Production would be a table keyed by user + device; see README "Multiple devices".)
 */
class DeviceStore {
  constructor({ filePath = null, fallbackToken = null } = {}) {
    this.filePath = filePath;
    this.fallbackToken = fallbackToken || null;
    this.device = null;
    this._load();
  }

  _load() {
    if (!this.filePath) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed && typeof parsed.token === 'string') this.device = parsed;
    } catch (_err) {
      // Missing or corrupt file: start unregistered.
    }
  }

  _persist() {
    if (!this.filePath) return;
    try {
      if (this.device) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this.device, null, 2), { mode: 0o600 });
      } else {
        fs.rmSync(this.filePath, { force: true });
      }
    } catch (err) {
      console.warn(`[store] could not persist device registration: ${err.message}`);
    }
  }

  /** Returns { token, deviceName, registeredAt, source } or null. */
  get() {
    if (this.device) return { ...this.device, source: 'registered' };
    if (this.fallbackToken) {
      return {
        token: this.fallbackToken,
        deviceName: 'Device from DEVICE_FCM_TOKEN',
        registeredAt: null,
        source: 'env',
      };
    }
    return null;
  }

  set({ token, deviceName }) {
    this.device = { token, deviceName, registeredAt: new Date().toISOString() };
    this._persist();
    return this.get();
  }

  clear() {
    this.device = null;
    this._persist();
  }
}

function maskToken(token) {
  if (!token) return null;
  if (token.length <= 16) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 8)}…${token.slice(-6)}`;
}

// Acks can arrive out of order (or be retried). A request only ever moves "forward".
const STATUS_RANK = {
  sending: 0,
  failed: 0,
  accepted_by_fcm: 1,
  received_by_device: 2,
  dismissed: 3,
  dialer_opened: 4,
};

const ACK_TO_STATUS = {
  received: 'received_by_device',
  dismissed: 'dismissed',
  dialer_opened: 'dialer_opened',
};

/** In-memory ring buffer of recent call requests (the "call request history"). */
class RequestHistory {
  constructor(limit = 50) {
    this.limit = limit;
    this.items = [];
  }

  create({ phoneNumber, contactName }) {
    const now = new Date().toISOString();
    const record = {
      requestId: crypto.randomUUID(),
      phoneNumber,
      contactName,
      status: 'sending',
      fcmMessageId: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      events: [{ status: 'sending', at: now }],
    };
    this.items.unshift(record);
    if (this.items.length > this.limit) this.items.length = this.limit;
    return record;
  }

  get(requestId) {
    return this.items.find((r) => r.requestId === requestId) || null;
  }

  _transition(record, status) {
    const now = new Date().toISOString();
    record.status = status;
    record.updatedAt = now;
    record.events.push({ status, at: now });
  }

  markAccepted(requestId, fcmMessageId) {
    const record = this.get(requestId);
    if (!record) return null;
    record.fcmMessageId = fcmMessageId;
    this._transition(record, 'accepted_by_fcm');
    return record;
  }

  markFailed(requestId, error) {
    const record = this.get(requestId);
    if (!record) return null;
    record.error = error;
    this._transition(record, 'failed');
    return record;
  }

  /** Applies an acknowledgement from the Android app. Never moves a request backwards. */
  applyAck(requestId, ackStatus) {
    const record = this.get(requestId);
    if (!record) return null;
    const next = ACK_TO_STATUS[ackStatus];
    if (!next) return record;
    if (record.status !== 'failed' && STATUS_RANK[next] > STATUS_RANK[record.status]) {
      this._transition(record, next);
    }
    return record;
  }

  list() {
    return this.items.map((r) => ({ ...r, events: [...r.events] }));
  }
}

module.exports = { DeviceStore, RequestHistory, maskToken };
