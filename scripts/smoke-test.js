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

if(pkg.version!=='0.4.28') fail('package version must be 0.4.28');
if(pkg.scripts?.['prepare:build']?.includes('configure-account-server')) fail('v0.4.28 build must not configure EasyCraft account server');
if(!workflow.includes("github.event.release.tag_name == 'v0.4.28'")) fail('release workflow must require v0.4.28');
for(const asset of ['EasyCraft-Launcher-Setup-0.4.28.exe','EasyCraft-Launcher-Setup-0.4.28.exe.blockmap','dist/latest.yml']) if(!workflow.includes(asset)) fail('workflow missing '+asset);
if(!workflow.includes('gh release upload v0.4.28')) fail('workflow must upload to v0.4.28 release');

for(const inv of [
  "require('electron-updater')",
  'autoUpdater.autoDownload = false',
  'autoUpdater.disableDifferentialDownload = false',
  'scheduleAutomaticUpdateChecks()'
]) if(!main.includes(inv)) fail('updater invariant missing: '+inv);

for(const forbiddenId of ['launcherLoginModal','webLoginOpenBtn','webLoginReopenBtn','webLoginWait','launcherLoginStatus','tokenStatusRow','linkMicrosoftAccountBtn','sendLogsBtn','accountDeletionBtn']) {
  if(idset.has(forbiddenId)) fail('removed EasyCraft account UI still exists #'+forbiddenId);
}
for(const forbiddenApi of ['startWebLogin','pollWebLogin','loginLauncherAccount','linkMinecraftAccount','getAccountTokenStatus','sendErrorReport']) {
  if(preload.includes(forbiddenApi)) fail('removed EasyCraft account preload API still exists: '+forbiddenApi);
}
for(const forbiddenIpc of ['start-web-login','poll-web-login','login-launcher-account','link-minecraft-account','get-account-token-status','send-error-report']) {
  if(handled.has(forbiddenIpc)) fail('removed EasyCraft account IPC handler still exists: '+forbiddenIpc);
}
if(!preload.includes('loginDirectMicrosoft')) fail('Microsoft direct login API missing');
if(!handled.has('login-direct-microsoft')) fail('Microsoft direct login IPC missing');
if(!renderer.includes('api.loginDirectMicrosoft()')) fail('renderer does not start direct Microsoft login');
if(!html.includes('Microsoft 로그인')) fail('Microsoft login UI text missing');
if(!main.includes("_easycraftAuthFlow = 'direct-microsoft-v1'")) fail('direct Microsoft account persistence marker missing');
if(!main.includes('EasyCraft 자체 계정 세션은 더 이상 사용하지 않습니다')) fail('legacy EasyCraft account-session migration missing');
if(!main.includes('Minecraft가 실행되지 않았습니다')) fail('explicit launch failure message missing');

if(styles.includes('\\n\\n/* v0.4.23: intuitive mod switches')) fail('literal \\n tokens still corrupt mod switch selector');
if(!styles.includes('.mod-toggle-switch{appearance:none;-webkit-appearance:none;border:0!important;outline:0;background:transparent!important;')) fail('mod toggle browser-default reset is missing');
if(!renderer.includes('mod-toggle-switch')) fail('mod switch renderer is missing');
for(const req of ['classifyLogLine','syncSettingsHeading']) if(!renderer.includes(req)) fail('UX invariant missing: '+req);
if(main.includes('ensureMinecraftInGameHud(id, instance)')) fail('EasyCraft HUD must remain removed');

for(const legal of ['TERMS_OF_SERVICE.txt','PRIVACY_POLICY.txt','THIRD_PARTY_NOTICE.txt']) if(!fs.existsSync(path.join(root,'src','legal',legal))) fail('missing legal document '+legal);
if(fs.existsSync(path.join(root,'src','legal','ACCOUNT_DELETION.txt'))) fail('legacy EasyCraft account deletion document should be removed');
for(const doc of ['src/legal/TERMS_OF_SERVICE.txt','src/legal/PRIVACY_POLICY.txt']) if(!read(doc).includes('v0.4.28')) fail(doc+' is not updated for v0.4.28');

for(const marker of ['<<<<<<<','=======','>>>>>>>']) for(const [name,text] of [['main.js',main],['renderer.js',renderer],['preload.js',preload],['index.html',html]]) if(text.includes(marker)) fail(name+' contains git conflict marker');

if(failed) process.exit(1);
console.log(`SMOKE OK: ${refs.size} UI ids, ${invoked.size} IPC invokes, v0.4.28 Microsoft-only login checks passed.`);
