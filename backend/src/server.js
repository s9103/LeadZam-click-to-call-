'use strict';

require('dotenv').config();

const os = require('os');
const path = require('path');
const { createApp } = require('./app');
const { createFirebaseSender, createMockSender } = require('./fcm');
const { DeviceStore, RequestHistory } = require('./store');

const port = Number(process.env.PORT) || 3000;
const mode = (process.env.FCM_MODE || 'live').toLowerCase();

const sender = mode === 'mock' ? createMockSender() : createFirebaseSender(process.env);
const deviceStore = new DeviceStore({
  filePath: path.join(__dirname, '..', 'data', 'device.json'),
  fallbackToken: process.env.DEVICE_FCM_TOKEN,
});
const history = new RequestHistory();
const app = createApp({
  sender,
  deviceStore,
  history,
  webRoot: path.join(__dirname, '..', '..', 'web'),
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`LeadZam Click-to-Call backend running (FCM mode: ${sender.mode})`);
  console.log(`  Dashboard:        http://localhost:${port}`);
  for (const ip of lanAddresses()) {
    console.log(`  From your phone:  http://${ip}:${port}   (same Wi-Fi network)`);
  }
  console.log('  Emulator reaches this machine at http://10.0.2.2:' + port);
  if (!sender.isConfigured()) {
    console.warn(
      '\n  WARNING: no Firebase credentials found. Calls will fail with FCM_NOT_CONFIGURED.\n' +
        '  Set GOOGLE_APPLICATION_CREDENTIALS in backend/.env, or run `npm run start:mock`.\n'
    );
  }
  const device = deviceStore.get();
  console.log(device ? `  Device: "${device.deviceName}" (${device.source})` : '  Device: none registered yet');
});
