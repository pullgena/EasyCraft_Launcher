const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const html = read('src/index.html');
const renderer = read('src/renderer.js');
const preload = read('src/preload.js');
const main = read('src/main.js');
const styles = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/build-windows.yml');
const serverCfg = JSON.parse(read('src/account-server.json'));
let failed=false;
function fail(m){console.error('SMOKE FAIL: '+m);failed=true;}

const ids=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const idset=new Set(ids);
for(const id of idset) if(ids.filter(x=>x===id).length>1) fail('duplicate HTML id #'+id);
const refs=new Set([
  ...[...renderer.matchAll(/\$\('#([^']+)'\)/g)].map(m=>m[1]),
  ...[...renderer.matchAll(/\$\("#([^"]+)"\)/g)].map(m=>m[1])
]);
for(const id of [...refs].sort()) if(!idset.has(id)) fail('renderer.js references missing HTML id #'+id);

const invoked=new Set([...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]));
const handled=new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m=>m[1]));
for(const ch of [...invoked].sort()) if(!handled.has(ch)) fail('preload invokes missing IPC handler: '+ch);

if(pkg.version!=='0.4.26') fail('package version must be 0.4.26');
if(!workflow.includes("github.event.release.tag_name == 'v0.4.26'")) fail('release workflow must require v0.4.26');
for(const asset of ['EasyCraft-Launcher-Setup-0.4.26.exe','EasyCraft-Launcher-Setup-0.4.26.exe.blockmap','dist/latest.yml']) if(!workflow.includes(asset)) fail('workflow missing '+asset);
if(!workflow.includes('gh release upload v0.4.26')) fail('workflow must upload to v0.4.26 release');

for(const inv of [
  "require('electron-updater')",
  'autoUpdater.autoDownload = false',
  'autoUpdater.disableDifferentialDownload = false',
  'scheduleAutomaticUpdateChecks()'
]) if(!main.includes(inv)) fail('updater invariant missing: '+inv);

if(serverCfg.protocol!=='easycraft-account-v4-web-login') fail('account-server protocol must be easycraft-account-v4-web-login');
if(serverCfg.baseUrl!=='https://waffle-gangway-actress.ngrok-free.dev') fail('bundled account server URL changed unexpectedly');
for(const req of [
  "data?.protocol !== 'easycraft-account-v4-web-login'",
  "web-launcher-login-v1",
  "web-easycraft-srp-login-v1",
  "accountServerUnsigned('/api/launcher-login/create'",
  "accountServerUnsigned('/api/launcher-login/redeem'",
  "ipcMain.handle('start-web-login'",
  "ipcMain.handle('poll-web-login'"
]) if(!main.includes(req)) fail('web login main invariant missing: '+req);
for(const req of ['startWebLogin','pollWebLogin']) if(!preload.includes(req)) fail('preload web login API missing: '+req);
for(const id of ['launcherLoginModal','webLoginOpenBtn','webLoginReopenBtn','webLoginWait','launcherLoginStatus']) if(!idset.has(id)) fail('web login UI missing #'+id);
if(html.includes('launcherAccountPassword')||html.includes('launcherAccountId')) fail('v0.4.26 launcher must not ask for EasyCraft ID/PW inside the app');
if(!renderer.includes('startWebLogin()')||!renderer.includes('pollWebLoginNow()')) fail('renderer web login flow missing');
if(!main.includes("server-issued-minecraft-session-v1")) fail('server-issued Minecraft session capability missing');
if(!main.includes("launcher-microsoft-link-v1")) fail('one-time launcher Microsoft link capability missing');
if(!main.includes('linkMinecraftToEasyCraftServer')) fail('one-time EasyCraft server linking flow missing');
const refreshEasyCraftBlock=(main.match(/async function refreshEasyCraftAccount\(session=null\) \{[\s\S]*?\n\}/)||[''])[0];
if(refreshEasyCraftBlock.includes('new Microsoft().refresh')||refreshEasyCraftBlock.includes('refreshAccountFromVault')) fail('EasyCraft account refresh must not contact Microsoft from the client');
if(!idset.has('linkMicrosoftAccountBtn')) fail('missing #linkMicrosoftAccountBtn');
if(!idset.has('sendLogsBtn')) fail('missing #sendLogsBtn');
if(!preload.includes('sendErrorReport')) fail('preload error-report API missing');
if(!main.includes("ipcMain.handle('send-error-report'")) fail('main error-report IPC missing');
if(!main.includes("accountServerSigned('/api/error-report'")) fail('signed server error-report upload missing');
if(!renderer.includes('sendErrorLogsToServer')) fail('renderer error-report UI flow missing');
if(!main.includes('Minecraft가 실행되지 않았습니다')) fail('explicit launch failure message missing');

// v0.4.23 switch bug regression: the literal \\n prefix made the base selector invalid on Windows.
if(styles.includes('\\n\\n/* v0.4.23: intuitive mod switches')) fail('literal \\n tokens still corrupt the mod switch selector');
if(!styles.includes('.mod-toggle-switch{appearance:none;-webkit-appearance:none;border:0!important;outline:0;background:transparent!important;')) fail('mod toggle browser-default reset is missing');
if(!renderer.includes('mod-toggle-switch')) fail('mod switch renderer is missing');

for(const req of ['classifyLogLine','syncSettingsHeading']) if(!renderer.includes(req)) fail('v0.4.23 UX invariant missing: '+req);
if(main.includes('ensureMinecraftInGameHud(id, instance)')) fail('EasyCraft HUD must remain removed');
for(const legal of ['TERMS_OF_SERVICE.txt','PRIVACY_POLICY.txt','THIRD_PARTY_NOTICE.txt','ACCOUNT_DELETION.txt']) if(!fs.existsSync(path.join(root,'src','legal',legal))) fail('missing legal document '+legal);

for(const marker of ['<<<<<<<','=======','>>>>>>>']) for(const [name,text] of [['main.js',main],['renderer.js',renderer],['preload.js',preload],['index.html',html]]) if(text.includes(marker)) fail(name+' contains git conflict marker');

if(failed) process.exit(1);
console.log(`SMOKE OK: ${refs.size} UI ids, ${invoked.size} IPC invokes, v0.4.26 server-brokered auth + updater + switch regression checks passed.`);
