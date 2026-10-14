/*
 * LeadZam CRM dashboard (demo).
 *
 * The browser only talks to our own backend (/api/*). It holds NO Firebase credentials:
 * the backend is the only thing that can send FCM messages.
 *
 * Status wording is deliberate. "accepted_by_fcm" means Firebase took the message, it
 * does NOT mean the phone has it. We only say "Received by the phone" after the Android
 * app has acknowledged the request itself.
 */
(function () {
  'use strict';

  var STATUS_LABEL = {
    ready: 'Ready',
    sending: 'Sending…',
    accepted_by_fcm: 'Request accepted by FCM',
    received_by_device: 'Received by the phone',
    dialer_opened: 'Dialer opened on the phone',
    dismissed: 'Dismissed on the phone',
    failed: 'Error',
  };

  var STATUS_DETAIL = {
    accepted_by_fcm: 'Waiting for the phone to confirm. (FCM accepting a message is not the same as delivery.)',
    received_by_device: 'Tap Call on the phone notification or in the app.',
    dialer_opened: 'The user opened the dialer with this number.',
    dismissed: 'The user dismissed the request on the phone.',
  };

  var POLL_MS = 2000;

  var leadCards = {}; // lead.id -> { root, pill, detail, button, lead }
  var leadState = {}; // lead.id -> { status, requestId, error }

  // ---------- tiny DOM helpers (textContent only: lead data is never parsed as HTML) ----------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function announce(message) {
    document.getElementById('live-region').textContent = message;
  }

  function formatTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString();
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    });
  }

  function errorText(data) {
    var err = data && data.error;
    if (!err) return 'Something went wrong.';
    if (err.fields) {
      var parts = Object.keys(err.fields).map(function (k) { return err.fields[k]; });
      if (parts.length) return parts.join('; ');
    }
    return err.message || 'Something went wrong.';
  }

  // ---------- leads ----------
  function setLeadState(leadId, patch) {
    var current = leadState[leadId] || { status: 'ready', requestId: null, error: null };
    leadState[leadId] = Object.assign({}, current, patch);
    updateLeadCard(leadId);
  }

  function updateLeadCard(leadId) {
    var card = leadCards[leadId];
    var state = leadState[leadId] || { status: 'ready' };
    if (!card) return;

    card.pill.className = 'pill ' + state.status;
    card.pill.textContent = STATUS_LABEL[state.status] || state.status;

    var detail = state.status === 'failed' ? state.error : STATUS_DETAIL[state.status] || '';
    card.detail.textContent = detail || '';
    card.detail.className = 'status-detail' + (state.status === 'failed' ? ' error' : '');

    var busy = state.status === 'sending';
    card.button.disabled = busy;
    card.button.textContent = busy ? 'Sending…' : state.status === 'ready' ? 'Call' : 'Call again';
    card.root.classList.toggle('active', state.status !== 'ready' && state.status !== 'failed');
  }

  function renderLeads(leads) {
    var list = document.getElementById('leads');
    list.textContent = '';
    leads.forEach(function (lead) {
      var li = el('li', 'lead');

      var info = el('div');
      info.appendChild(el('div', 'lead-name', lead.name));
      info.appendChild(el('div', 'lead-phone', lead.phone));
      info.appendChild(el('div', 'lead-meta', 'Stage: ' + lead.stage + (lead.company ? ' · ' + lead.company : '')));

      var button = el('button', 'btn', 'Call');
      button.type = 'button';
      button.setAttribute('aria-label', 'Call ' + lead.name + ' on ' + lead.phone);
      button.addEventListener('click', function () { dial(lead); });

      var statusRow = el('div', 'lead-status');
      var pill = el('span', 'pill ready', STATUS_LABEL.ready);
      var detail = el('span', 'status-detail');
      statusRow.appendChild(pill);
      statusRow.appendChild(detail);

      li.appendChild(info);
      li.appendChild(button);
      li.appendChild(statusRow);
      list.appendChild(li);

      leadCards[lead.id] = { root: li, pill: pill, detail: detail, button: button, lead: lead };
      leadState[lead.id] = { status: 'ready', requestId: null, error: null };
    });
  }

  function dial(lead) {
    setLeadState(lead.id, { status: 'sending', requestId: null, error: null });
    announce('Sending call request for ' + lead.name);

    return api('POST', '/api/dial', { phoneNumber: lead.phone, contactName: lead.name })
      .then(function (res) {
        if (!res.ok) {
          var message = errorText(res.data);
          setLeadState(lead.id, { status: 'failed', requestId: res.data.requestId || null, error: message });
          announce('Call request for ' + lead.name + ' failed. ' + message);
          // e.g. the token was dropped as invalid: refresh the device banner.
          refreshDevice();
        } else {
          setLeadState(lead.id, { status: res.data.status, requestId: res.data.requestId, error: null });
          announce('Request for ' + lead.name + ' accepted by Firebase. Waiting for the phone.');
        }
        return refreshRequests();
      })
      .catch(function () {
        var message = 'Could not reach the CRM backend. Is the server running?';
        setLeadState(lead.id, { status: 'failed', error: message });
        announce(message);
      });
  }

  // ---------- device panel ----------
  function renderDevice(device) {
    var box = document.getElementById('device-status');
    box.textContent = '';
    if (device && device.registered) {
      box.className = 'device-status ok';
      var when = device.registeredAt ? ' · registered ' + formatTime(device.registeredAt) : '';
      box.appendChild(
        document.createTextNode(
          'Connected device: ' + device.deviceName + ' · token ' + device.tokenPreview + when
        )
      );
      if (device.source === 'registered') {
        var remove = el('button', 'link-btn', 'Remove');
        remove.type = 'button';
        remove.addEventListener('click', function () {
          api('DELETE', '/api/device').then(refreshDevice);
        });
        box.appendChild(remove);
      }
    } else {
      box.className = 'device-status warn';
      box.textContent =
        'No device registered. Open the Android app and tap "Register with backend" (or paste its token below).';
    }
  }

  function refreshDevice() {
    return api('GET', '/api/device')
      .then(function (res) { renderDevice(res.data); })
      .catch(function () {
        var box = document.getElementById('device-status');
        box.className = 'device-status warn';
        box.textContent = 'Cannot reach the backend.';
      });
  }

  function initDeviceForm() {
    var form = document.getElementById('device-form');
    var error = document.getElementById('device-form-error');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.textContent = '';
      api('POST', '/api/device', {
        token: document.getElementById('device-token').value,
        deviceName: document.getElementById('device-name').value,
      })
        .then(function (res) {
          if (!res.ok) {
            error.textContent = errorText(res.data);
            return;
          }
          document.getElementById('device-token').value = '';
          renderDevice(res.data);
        })
        .catch(function () { error.textContent = 'Could not reach the backend.'; });
    });
  }

  // ---------- history + live status from phone acknowledgements ----------
  function renderHistory(requests) {
    var body = document.getElementById('history');
    body.textContent = '';
    document.getElementById('history-empty').hidden = requests.length > 0;
    requests.slice(0, 10).forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', '', formatTime(r.createdAt)));
      tr.appendChild(el('td', '', r.contactName || '—'));
      tr.appendChild(el('td', '', r.phoneNumber));
      var statusCell = el('td');
      statusCell.appendChild(el('span', 'pill ' + r.status, STATUS_LABEL[r.status] || r.status));
      tr.appendChild(statusCell);
      body.appendChild(tr);
    });
  }

  function syncLeadsFromRequests(requests) {
    var byId = {};
    requests.forEach(function (r) { byId[r.requestId] = r; });
    Object.keys(leadState).forEach(function (leadId) {
      var state = leadState[leadId];
      var record = state.requestId && byId[state.requestId];
      if (record && record.status !== state.status && state.status !== 'sending') {
        setLeadState(leadId, { status: record.status });
        if (record.status === 'dialer_opened') {
          announce('Dialer opened on the phone for ' + leadCards[leadId].lead.name);
        }
      }
    });
  }

  function refreshRequests() {
    return api('GET', '/api/requests')
      .then(function (res) {
        var requests = (res.data && res.data.requests) || [];
        renderHistory(requests);
        syncLeadsFromRequests(requests);
      })
      .catch(function () { /* transient; the next poll will retry */ });
  }

  // ---------- boot ----------
  function init() {
    initDeviceForm();
    api('GET', '/api/leads')
      .then(function (res) { renderLeads((res.data && res.data.leads) || []); })
      .catch(function () {
        document.getElementById('leads').textContent = 'Could not load leads. Is the backend running?';
      })
      .then(function () {
        refreshDevice();
        refreshRequests();
        setInterval(refreshRequests, POLL_MS);
        setInterval(refreshDevice, POLL_MS * 3);
      });
  }

  init();
})();
