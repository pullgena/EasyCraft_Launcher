const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const target = path.join(root, 'src', 'account-server.json');
const envValue = String(process.env.EASYCRAFT_ACCOUNT_SERVER_URL || '').trim();
const DEFAULT_ACCOUNT_SERVER_URL = 'https://waffle-gangway-actress.ngrok-free.dev';
let existing = '';
try { existing = String(JSON.parse(fs.readFileSync(target, 'utf8')).baseUrl || '').trim(); } catch {}
let value = envValue || existing || DEFAULT_ACCOUNT_SERVER_URL;
if (value && !/^https?:\/\//i.test(value)) value = 'https://' + value;
if (!value) {
  console.error('BUILD BLOCKED: EasyCraft account server URL is missing.');
  process.exit(1);
}
let u;
try { u = new URL(value); } catch { console.error('BUILD BLOCKED: Invalid EasyCraft account server URL.'); process.exit(1); }
if (!['http:', 'https:'].includes(u.protocol)) {
  console.error('BUILD BLOCKED: EasyCraft account server URL must start with http:// or https://.');
  process.exit(1);
}
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(String(u.hostname || '').toLowerCase());
if (!loopback && u.protocol !== 'https:') { console.error('BUILD BLOCKED: remote EasyCraft account server must use HTTPS (ngrok domain).'); process.exit(1); }
if (loopback && process.env.EASYCRAFT_ALLOW_LOCAL_ACCOUNT_SERVER !== '1') {
  console.error('BUILD BLOCKED: 127.0.0.1/localhost is only for local testing. Put the ngrok HTTPS domain in EASYCRAFT_ACCOUNT_SERVER_URL.');
  process.exit(1);
}
const normalized = value.replace(/\/+$/, '');
fs.writeFileSync(target, JSON.stringify({ baseUrl: normalized, protocol: 'easycraft-account-v2-srp' }, null, 2) + '\n');
console.log(`EasyCraft account server configured: ${normalized}`);
