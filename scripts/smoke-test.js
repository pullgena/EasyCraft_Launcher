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
const htmlIdList = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
for (const id of new Set(htmlIdList)) {
  if (htmlIdList.filter(x => x === id).length > 1) fail(`duplicate HTML id #${id}`);
}
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

// Beta 11 authentication invariants.
for (const legacy of [
  'auth-relay-open-site', 'auth-relay-redeem', 'relayLoginModal', 'microsoftClientIdInput',
  'saveMicrosoftClientIdBtn', "ipcMain.handle('login-microsoft'", '/api/link/start', '/api/minecraft/account',
  'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'client_secret', 'redirect_uri', "_easycraftAuthFlow = 'account-server-v1'"
]) {
  if ([main, preload, renderer, html].some(text => text.includes(legacy))) fail(`legacy authentication reference remains: ${legacy}`);
}
for (const required of [
  "const { Launch, Microsoft } = require('minecraft-java-core')",
  "new Microsoft().getAuth()",
  "new Microsoft().refresh(stored)",
  "accountServerUnsigned('/api/auth/srp/start'",
  "accountServerHealth()",
  "friendlyAccountServerError(error)",
  "accountServerUnsigned('/api/auth/srp/finish'",
  "accountServerSigned('/api/vault'",
  "createCipheriv('aes-256-gcm'",
  "SRP_N_HEX",
  "_easycraftAuthFlow = 'account-vault-v2'",
  "ipcMain.handle('login-launcher-account'",
  "ipcMain.handle('link-minecraft-account'"
]) {
  if (!main.includes(required)) fail(`beta.11 auth invariant missing: ${required}`);
}
if (!preload.includes('loginLauncherAccount') || !preload.includes('linkMinecraftAccount')) fail('account vault preload API is missing');
if (!html.includes('launcherLoginModal') || !html.includes('minecraftLinkBtn')) fail('EasyCraft account login UI is missing');
if (!fs.existsSync(path.join(root, 'src', 'account-server.json'))) fail('bundled account-server.json is missing');

const serverConfig = JSON.parse(fs.readFileSync(path.join(root, 'src', 'account-server.json'), 'utf8'));
if (serverConfig.protocol !== 'easycraft-account-v2-srp') fail('account-server.json protocol is not easycraft-account-v2-srp');
if (serverConfig.baseUrl && /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::|\/|$)/i.test(serverConfig.baseUrl)) fail('release source must not ship with a loopback account server URL');

if (serverConfig.baseUrl !== 'https://waffle-gangway-actress.ngrok-free.dev') fail('bundled ngrok account server URL is incorrect');
if (!main.includes("'ngrok-skip-browser-warning':'EasyCraft'")) fail('ngrok browser-warning bypass header is missing from account API requests');


// v0.4.14 release / updater / Fabric HUD invariants.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '0.4.14') fail('package version must be exactly 0.4.14');
if (pkg.dependencies?.['electron-updater'] !== '6.8.9') fail('electron-updater dependency changed unexpectedly');
const githubPublisher = (pkg.build?.publish || []).find(p => p?.provider === 'github');
if (!githubPublisher) fail('GitHub publish provider is missing');
if (githubPublisher.owner !== 'pullgena' || githubPublisher.repo !== 'EasyCraft_Launcher') fail('GitHub update repository is incorrect');
for (const updaterInvariant of [
  "require('electron-updater')",
  'autoUpdater.autoDownload = false',
  'autoUpdater.allowPrerelease = false',
  "autoUpdater.on('update-available'",
  "autoUpdater.on('update-downloaded'",
  'autoUpdaterInstance.downloadUpdate()',
  'autoUpdaterInstance.quitAndInstall(true, true)',
  'scheduleAutomaticUpdateChecks()'
]) {
  if (!main.includes(updaterInvariant)) fail(`auto-update invariant missing: ${updaterInvariant}`);
}
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'build-windows.yml'), 'utf8');
if (!workflow.includes("github.event.release.tag_name == 'v0.4.14'")) fail('release workflow must require exact tag v0.4.14');
for (const asset of ['EasyCraft-Launcher-Setup-0.4.14.exe', 'EasyCraft-Launcher-Setup-0.4.14.exe.blockmap', 'dist/latest.yml']) {
  if (!workflow.includes(asset)) fail(`release workflow is missing updater asset: ${asset}`);
}
if (!workflow.includes('gh release upload v0.4.14')) fail('release workflow does not upload updater files to v0.4.14');



// v0.4.14 non-blocking update UX.
for (const id of ['updateToast', 'updateToastTitle', 'updateToastText', 'updateToastActionBtn']) {
  if (!htmlIds.has(id)) fail(`v0.4.14 update toast UI is missing #${id}`);
}
for (const phrase of [
  '최신버전입니다!',
  '응답하지 못했습니다. 나중에 다시 시도하세요.',
  '업데이트를 확인하고 있습니다...'
]) {
  if (!renderer.includes(phrase)) fail(`v0.4.14 updater message is missing: ${phrase}`);
}
if (html.includes('startupGate') || renderer.includes('renderStartupUpdate(')) fail('blocking startup update gate must be removed in v0.4.14');
if (!main.includes('await createWindow();\n  initAutoUpdater();')) fail('window must be created before updater/background startup work');
if (!main.includes("autoUpdater.autoDownload = false")) fail('updates must not auto-download before user approval');
if (!main.includes("autoUpdater.disableDifferentialDownload = false")) fail('NSIS differential update must stay enabled');
if (!pkg.build?.electronLanguages || !pkg.build.electronLanguages.includes('ko')) fail('Electron locale trimming is missing');
if (!Array.isArray(pkg.build?.files) || !pkg.build.files.some(x => String(x).includes('**/*.map'))) fail('release package exclusions are missing');

// Fabric-only EasyCraft system HUD.
for (const required of [
  'ensureMinecraftInGameHud(id, instance)',
  "if (instance.loader !== 'fabric')",
  'EasyCraft으로 실행됨',
  "internalSystem: true",
  "title: 'EasyCraft HUD'",
  'patchCustomHudProfile(id)'
]) {
  if (!main.includes(required)) fail(`Fabric HUD invariant missing: ${required}`);
}
if (!renderer.includes('EasyCraft 시스템 모드 · Fabric 전용 · 자동 관리')) fail('locked EasyCraft HUD list item UI is missing');
if (!renderer.includes("if(!item.internalSystem) row.querySelector('.installed-name')")) fail('EasyCraft HUD detail interaction is not blocked');
if (!renderer.includes('!i.autoDependency&&!i.internalSystem')) fail('EasyCraft HUD bulk selection must be blocked');

if (!main.includes("const candidates = ['customhud', 'customhud-ported']")) fail('EasyCraft HUD compatibility fallback for newer Fabric versions is missing');
if (pkg.build?.nsis?.differentialPackage !== true) fail('NSIS differentialPackage optimization must be enabled');
if (!fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8').includes('.update-toast{position:fixed;')) fail('update toast must stay fixed at the bottom center');


const conflictMarkers = ['<<<<<<<', '=======', '>>>>>>>'];
for (const [name, text] of [['renderer.js', renderer], ['preload.js', preload], ['main.js', main], ['index.html', html]]) {
  if (conflictMarkers.some(marker => text.includes(marker))) fail(`${name} contains a Git conflict marker`);
}

if (!process.exitCode) {
  console.log(`SMOKE OK: ${rendererIdRefs.size} UI ids, ${directHandlers.size} handlers, ${invoked.size} IPC invokes, v0.4.14 updater + Fabric HUD + account-vault invariants checked.`);
}
