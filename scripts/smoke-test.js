const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  process.exitCode = 1;
}

const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
const rendererIdRefs = new Set([
  ...[...renderer.matchAll(/\$\('#([^']+)'\)/g)].map(m => m[1]),
  ...[...renderer.matchAll(/\$\("#([^"]+)"\)/g)].map(m => m[1])
]);
for (const id of [...rendererIdRefs].sort()) {
  if (!htmlIds.has(id)) fail(`renderer.js references missing HTML id #${id}`);
}

const declared = new Set([
  ...[...renderer.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]),
  ...[...renderer.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1])
]);
const directHandlers = new Set([
  ...[...renderer.matchAll(/addEventListener\([^,]+,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)].map(m => m[1]),
  ...[...renderer.matchAll(/api\.on\w+\(\s*([A-Za-z_$][\w$]*)\s*\)/g)].map(m => m[1])
]);
for (const handler of [...directHandlers].sort()) {
  if (!declared.has(handler)) fail(`renderer.js uses undefined event handler ${handler}`);
}

const invoked = new Set([...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m => m[1]));
const handled = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m => m[1]));
for (const channel of [...invoked].sort()) {
  if (!handled.has(channel)) fail(`preload invokes IPC channel without main handler: ${channel}`);
}


// Beta 8 authentication invariants: one-PC system-browser localhost PKCE only.
for (const legacy of ['auth-relay-open-site', 'auth-relay-redeem', 'auth-relay-health', 'authRelayUrl', 'relayLoginModal']) {
  if ([main, preload, renderer, html].some(text => text.includes(legacy))) fail(`legacy relay login reference remains: ${legacy}`);
}
if (/client_secret/i.test(main)) fail('main.js must not contain a Microsoft client secret in the public desktop flow');
for (const required of [
  "server.listen(0, 'localhost')",
  "code_challenge_method', 'S256'",
  "response_type', 'code'",
  "grant_type: 'authorization_code'",
  "returnedState !== state"
]) {
  if (!main.includes(required)) fail(`localhost PKCE invariant missing: ${required}`);
}
if (!html.includes('id="microsoftClientIdInput"') || !renderer.includes("$('#saveMicrosoftClientIdBtn')")) {
  fail('Microsoft Client ID settings UI is incomplete');
}

const conflictMarkers = ['<<<<<<<', '=======', '>>>>>>>'];
for (const [name, text] of [['renderer.js', renderer], ['preload.js', preload], ['main.js', main], ['index.html', html]]) {
  if (conflictMarkers.some(marker => text.includes(marker))) fail(`${name} contains a Git conflict marker`);
}

if (!process.exitCode) {
  console.log(`SMOKE OK: ${rendererIdRefs.size} UI ids, ${directHandlers.size} direct handlers, ${invoked.size} IPC invokes, localhost PKCE invariants checked.`);
}
