const { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess, nativeImage } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { Launch, Microsoft } = require('minecraft-java-core');

let mainWindow;
let currentAccount = null;
let activeLauncher = null;
const preparedLaunchers = new Map();
let accountRefreshedAt = 0;

const APP_UA = 'EasyCraftLauncher/0.4.6 (Minecraft launcher; Modrinth integration)';
const MODRINTH_API = 'https://api.modrinth.com/v2';
const CONTENT_TYPES = {
  mods: { folder: 'mods', extensions: ['.jar'], projectType: 'mod' },
  resourcepacks: { folder: 'resourcepacks', extensions: ['.zip'], projectType: 'resourcepack' },
  shaderpacks: { folder: 'shaderpacks', extensions: ['.zip'], projectType: 'shader' }
};

function dataDir() { return path.join(app.getPath('userData'), 'launcher-data'); }
function configPath() { return path.join(dataDir(), 'config.json'); }
function accountPath() { return path.join(dataDir(), 'account.json'); }
function instancesDir() { return path.join(dataDir(), 'instances'); }
function safeId(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, ''); }
function cleanInstanceName(value) {
  return Array.from(String(value || '').normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, '').trim()).slice(0, 40).join('');
}
function instanceDir(id) { return path.join(instancesDir(), safeId(id)); }
function gameDir(id) { return path.join(instanceDir(id), 'game'); }
function registryPath(id) { return path.join(instanceDir(id), 'installed-modrinth.json'); }
function logsDir(id) { return path.join(instanceDir(id), 'launcher-logs'); }

function defaultInstanceSettings(baseMemory = null) {
  return {
    memory: { min: Number(baseMemory?.min) || 2, max: Number(baseMemory?.max) || 6 },
    screen: { width: 1280, height: 720, fullscreen: false },
    javaPath: '',
    jvmArgs: '',
    gameArgs: '',
    autoUpdateContent: true,
    autoUpdateMinecraftVersion: false,
    autoUpdateLoaderVersion: true
  };
}
function normalizeInstance(instance, legacyMemory = null) {
  const base = defaultInstanceSettings(legacyMemory);
  const settings = instance?.settings || {};
  return {
    ...instance,
    loaderVersion: instance?.loader === 'vanilla' ? null : String(instance?.loaderVersion || 'latest'),
    settings: {
      ...base,
      ...settings,
      memory: { ...base.memory, ...(settings.memory || {}) },
      screen: { ...base.screen, ...(settings.screen || {}) }
    }
  };
}
function defaultConfig() {
  return { selectedInstanceId: null, memory: { min: 2, max: 6 }, instances: [] };
}
async function ensureBase() {
  await fsp.mkdir(instancesDir(), { recursive: true });
  try { await fsp.access(configPath()); } catch { await writeConfig(defaultConfig()); }
}
async function readConfig() {
  await ensureBase();
  try {
    const parsed = JSON.parse(await fsp.readFile(configPath(), 'utf8'));
    return {
      ...defaultConfig(), ...parsed,
      memory: { ...defaultConfig().memory, ...(parsed.memory || {}) },
      instances: Array.isArray(parsed.instances) ? parsed.instances.map(i => normalizeInstance(i, parsed.memory)) : []
    };
  } catch {
    const fresh = defaultConfig(); await writeConfig(fresh); return fresh;
  }
}
async function writeConfig(config) {
  await fsp.mkdir(dataDir(), { recursive: true });
  const temp = `${configPath()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(config, null, 2), 'utf8');
  await fsp.rename(temp, configPath()).catch(async () => {
    await fsp.rm(configPath(), { force: true });
    await fsp.rename(temp, configPath());
  });
}
async function readRegistry(id) {
  try {
    const parsed = JSON.parse(await fsp.readFile(registryPath(id), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
async function writeRegistry(id, items) {
  await fsp.mkdir(instanceDir(id), { recursive: true });
  await fsp.writeFile(registryPath(id), JSON.stringify(items, null, 2), 'utf8');
}
function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function accountSummary(account) {
  if (!account || account.error) return null;
  return {
    name: account.name || account.username || account.profile?.name || 'Microsoft 계정',
    uuid: account.uuid || account.id || account.profile?.id || null,
    skinUrl: account._easycraftSkinUrl || null,
    faceUrl: account._easycraftFaceDataUrl || null,
    faceOverlayUrl: account._easycraftFaceOverlayDataUrl || null
  };
}
async function fetchSkinUrlForAccount(account) {
  const uuid = String(account?.uuid || account?.id || account?.profile?.id || '').replace(/-/g, '');
  if (!uuid) return null;
  try {
    const profile = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${encodeURIComponent(uuid)}?unsigned=true`);
    const texturesProp = (profile?.properties || []).find(p => p.name === 'textures' && p.value);
    if (!texturesProp) return null;
    const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'));
    const url = decoded?.textures?.SKIN?.url || null;
    return /^https?:\/\/textures\.minecraft\.net\/texture\//i.test(String(url || '')) ? url : null;
  } catch { return null; }
}
async function skinFaceDataUrl(skinUrl) {
  if (!skinUrl) return null;
  try {
    const res = await fetch(skinUrl, { headers: { 'User-Agent': APP_UA } });
    if (!res.ok) return null;
    const image = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer()));
    if (image.isEmpty()) return null;
    const size = image.getSize();
    if (size.width < 16 || size.height < 16) return null;
    // Minecraft 스킨의 정면 얼굴은 항상 좌상단 기준 (8, 8) ~ (15, 15)에 있다.
    // 원본 스킨 전체를 CSS 배경으로 축소하지 않고 여기서 얼굴 8x8만 잘라 전개도 노출 버그를 막는다.
    const scale = size.width / 64;
    const face = image.crop({ x: Math.round(8 * scale), y: Math.round(8 * scale), width: Math.round(8 * scale), height: Math.round(8 * scale) });
    const overlay = image.crop({ x: Math.round(40 * scale), y: Math.round(8 * scale), width: Math.round(8 * scale), height: Math.round(8 * scale) });
    return {
      faceUrl: face.toDataURL(),
      overlayUrl: overlay.toDataURL()
    };
  } catch { return null; }
}
async function refreshAccountVisual(account) {
  if (!account) return null;
  const skinUrl = await fetchSkinUrlForAccount(account);
  if (skinUrl) {
    account._easycraftSkinUrl = skinUrl;
    const face = await skinFaceDataUrl(skinUrl);
    if (face?.faceUrl) account._easycraftFaceDataUrl = face.faceUrl;
    if (face?.overlayUrl) account._easycraftFaceOverlayDataUrl = face.overlayUrl;
    await fsp.writeFile(accountPath(), JSON.stringify(account, null, 2), 'utf8').catch(() => {});
  }
  const summary = accountSummary(account);
  send('account-changed', summary);
  return summary;
}
async function loadSavedAccount() {
  try {
    const account = JSON.parse(await fsp.readFile(accountPath(), 'utf8'));
    if (!account.refresh_token) return null;
    const refreshed = await new Microsoft().refresh(account);
    if (!refreshed || refreshed.error) throw new Error(refreshed?.error || 'Microsoft 인증 갱신 실패');
    refreshed._easycraftSkinUrl = account._easycraftSkinUrl || null;
    refreshed._easycraftFaceDataUrl = account._easycraftFaceDataUrl || null;
    refreshed._easycraftFaceOverlayDataUrl = account._easycraftFaceOverlayDataUrl || null;
    refreshed._easycraftRefreshedAt = Date.now();
    await fsp.writeFile(accountPath(), JSON.stringify(refreshed, null, 2), 'utf8');
    accountRefreshedAt = Date.now();
    currentAccount = refreshed;
    setTimeout(() => refreshAccountVisual(refreshed).catch(() => {}), 50).unref?.();
    return accountSummary(refreshed);
  } catch {
    currentAccount = null;
    return null;
  }
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1040, minHeight: 680,
    backgroundColor: '#0f1412', title: 'EasyCraft Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  await mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  await ensureBase();
  await createWindow();
  loadSavedAccount().then(summary => send('account-changed', summary));
  initAutoUpdater();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': APP_UA, ...(opts.headers || {}) }
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.description || ''; } catch {}
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}
async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': APP_UA, ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
function versionParts(value) {
  return String(value || '').split(/[^0-9A-Za-z]+/).filter(Boolean).map(part => /^\d+$/.test(part) ? Number(part) : part.toLowerCase());
}
function compareVersionsDesc(a, b) {
  const aa = versionParts(a), bb = versionParts(b), n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const x = aa[i] ?? -1, y = bb[i] ?? -1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return y - x;
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return String(y).localeCompare(String(x), undefined, { numeric:true, sensitivity:'base' });
  }
  return 0;
}
function neoForgePrefixForMinecraft(mcVersion) {
  const parts = String(mcVersion || '').split('.');
  if (parts[0] === '1' && /^\d+$/.test(parts[1] || '')) return `${parts[1]}.${Number(parts[2] || 0)}.`;
  if (/^\d+$/.test(parts[0] || '') && /^\d+$/.test(parts[1] || '')) return `${parts[0]}.${parts[1]}.`;
  return '';
}
async function loaderVersionsFor(loader, mcVersion) {
  loader = String(loader || 'vanilla').toLowerCase();
  mcVersion = String(mcVersion || '').trim();
  if (mcVersion === 'latest_release') mcVersion = await latestMinecraftRelease() || mcVersion;
  if (!mcVersion || loader === 'vanilla') return { latest:null, versions:[] };
  let versions = [];
  if (loader === 'fabric') {
    const rows = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
    versions = (rows || []).map(row => ({ version:row?.loader?.version, stable:row?.loader?.stable !== false })).filter(x => x.version);
  } else if (loader === 'quilt') {
    const rows = await fetchJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mcVersion)}`);
    versions = (rows || []).map(row => ({ version:row?.loader?.version || row?.version, stable:row?.loader?.stable !== false && row?.stable !== false })).filter(x => x.version);
  } else if (loader === 'forge') {
    const xml = await fetchText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1].trim());
    const prefix = `${mcVersion}-`;
    versions = all.filter(v => v.startsWith(prefix)).map(v => ({ version:v.slice(prefix.length), stable:true }));
  } else if (loader === 'neoforge') {
    const xml = await fetchText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
    const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1].trim());
    const prefix = neoForgePrefixForMinecraft(mcVersion);
    versions = all.filter(v => prefix && v.startsWith(prefix)).map(v => ({ version:v, stable:!/-beta|-alpha|-rc/i.test(v) }));
  }
  const unique = new Map();
  for (const item of versions) if (!unique.has(item.version)) unique.set(item.version, item);
  versions = [...unique.values()].sort((a,b) => (Number(b.stable)-Number(a.stable)) || compareVersionsDesc(a.version,b.version)).slice(0,120);
  return { latest:versions[0]?.version || null, versions };
}
async function latestMinecraftRelease() {
  const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  return manifest?.latest?.release || null;
}
function validateContentType(type) {
  if (!CONTENT_TYPES[type]) throw new Error('지원하지 않는 콘텐츠 종류입니다.');
  return CONTENT_TYPES[type];
}
function targetFolder(id, type) {
  return path.join(gameDir(id), validateContentType(type).folder);
}
async function getInstance(id) {
  const config = await readConfig();
  return { config, instance: config.instances.find(i => i.id === id) || null };
}
async function ensureInstanceFolders(id) {
  const root = gameDir(id);
  await Promise.all([
    fsp.mkdir(path.join(root, 'mods'), { recursive: true }),
    fsp.mkdir(path.join(root, 'resourcepacks'), { recursive: true }),
    fsp.mkdir(path.join(root, 'shaderpacks'), { recursive: true }),
    fsp.mkdir(path.join(root, 'saves'), { recursive: true }),
    fsp.mkdir(logsDir(id), { recursive: true })
  ]);
}
async function invalidateLoaderInstall(id) {
  // Minecraft 버전/로더 종류/로더 빌드가 바뀌면 이전 설치 결과를 재사용하지 않는다.
  await fsp.rm(path.join(gameDir(id), 'loader'), { recursive:true, force:true }).catch(() => {});
}

ipcMain.handle('bootstrap', async () => {
  const config = await readConfig();
  return {
    config,
    account: accountSummary(currentAccount),
    appVersion: app.getVersion(),
    launchState: activeLauncher ? { state: activeLauncher.state || 'preparing', instanceId: activeLauncher.instanceId } : { state: 'idle', instanceId: null },
    updateState: launcherUpdateState
  };
});
ipcMain.handle('fetch-versions', async () => {
  try {
    const json = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    return {
      latest: json.latest?.release || 'latest_release',
      versions: json.versions.filter(v => v.type === 'release').slice(0, 100).map(v => v.id)
    };
  } catch (error) {
    return { latest: 'latest_release', versions: ['latest_release'], error: error.message };
  }
});
ipcMain.handle('fetch-loader-versions', async (_event, loader, mcVersion) => {
  try {
    const result = await loaderVersionsFor(loader, mcVersion);
    return { ok:true, loader, minecraftVersion:mcVersion, ...result };
  } catch (error) {
    return { ok:false, loader, minecraftVersion:mcVersion, latest:null, versions:[], error:error.message };
  }
});
ipcMain.handle('instance-version-status', async (_event, id) => {
  try {
    const { instance:raw } = await getInstance(id);
    if (!raw) throw new Error('인스턴스를 찾을 수 없습니다.');
    const instance = normalizeInstance(raw);
    const latestMinecraft = await latestMinecraftRelease();
    let loaderInfo = { latest:null, versions:[] };
    if (instance.loader !== 'vanilla') loaderInfo = await loaderVersionsFor(instance.loader, instance.version);
    return {
      ok:true,
      currentMinecraft:instance.version, latestMinecraft,
      currentLoader:instance.loaderVersion || null, latestLoader:loaderInfo.latest,
      minecraftUpdateAvailable:!!latestMinecraft && latestMinecraft !== instance.version,
      loaderUpdateAvailable:instance.loader !== 'vanilla' && !!loaderInfo.latest && instance.loaderVersion !== 'latest' && loaderInfo.latest !== instance.loaderVersion
    };
  } catch (error) { return { ok:false, error:error.message }; }
});
ipcMain.handle('login-microsoft', async () => {
  try {
    send('status', { text: 'Microsoft 로그인 창을 준비하고 있습니다…', kind: 'info' });
    const account = await new Microsoft().getAuth();
    if (!account || account.error) throw new Error(account?.error || '로그인에 실패했습니다.');
    account._easycraftRefreshedAt = Date.now();
    accountRefreshedAt = Date.now();
    currentAccount = account;
    preparedLaunchers.clear(); // 계정이 바뀌면 캐시된 실행기의 이전 인증 정보를 재사용하지 않습니다.
    await fsp.writeFile(accountPath(), JSON.stringify(account, null, 2), 'utf8');
    const summary = accountSummary(account);
    setTimeout(() => refreshAccountVisual(account).catch(() => {}), 50).unref?.();
    send('account-changed', summary);
    send('status', { text: `${summary?.name || '계정'} 로그인 완료`, kind: 'success' });
    return { ok: true, account: summary };
  } catch (error) {
    send('status', { text: `로그인 실패: ${error.message}`, kind: 'error' });
    return { ok: false, error: error.message };
  }
});
ipcMain.handle('logout', async () => {
  currentAccount = null;
  preparedLaunchers.clear();
  await fsp.rm(accountPath(), { force: true }).catch(() => {});
  send('account-changed', null);
  return { ok: true };
});

ipcMain.handle('create-instance', async (_event, input) => {
  const name = cleanInstanceName(input?.name);
  const version = String(input?.version || 'latest_release').trim();
  const loader = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(input?.loader) ? input.loader : 'vanilla';
  if (!name) return { ok: false, error: '인스턴스 이름을 입력해 주세요.' };
  const config = await readConfig();
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const loaderVersion = loader === 'vanilla' ? null : String(input?.loaderVersion || 'latest').trim();
  const instance = { id, name, version, loader, loaderVersion, createdAt: new Date().toISOString(), settings: defaultInstanceSettings(config.memory) };
  config.instances.push(instance); config.selectedInstanceId = id;
  await writeConfig(config); await ensureInstanceFolders(id); await writeRegistry(id, []);
  return { ok: true, config, instance };
});
ipcMain.handle('select-instance', async (_event, id) => {
  const config = await readConfig();
  if (!config.instances.some(i => i.id === id)) return { ok: false };
  config.selectedInstanceId = id; await writeConfig(config);
  return { ok: true, config };
});
ipcMain.handle('delete-instance', async (_event, id) => {
  const config = await readConfig();
  const found = config.instances.find(i => i.id === id);
  if (!found) return { ok: false, error: '인스턴스를 찾을 수 없습니다.' };
  if (activeLauncher?.instanceId === id) return { ok: false, error: '실행 중인 인스턴스는 삭제할 수 없습니다.' };
  config.instances = config.instances.filter(i => i.id !== id);
  if (config.selectedInstanceId === id) config.selectedInstanceId = config.instances[0]?.id || null;
  await writeConfig(config);
  // game/, mods/, saves/, loader files, Modrinth registry, logs까지 인스턴스 루트 전체 삭제
  preparedLaunchers.delete(id);
  await fsp.rm(instanceDir(id), { recursive: true, force: true });
  return { ok: true, config };
});
ipcMain.handle('update-instance', async (_event, id, patch) => {
  const config = await readConfig();
  const instance = config.instances.find(i => i.id === id);
  if (!instance) return { ok: false, error: '인스턴스를 찾을 수 없습니다.' };
  const beforeVersion = instance.version, beforeLoader = instance.loader, beforeLoaderVersion = instance.loaderVersion || 'latest';
  if (patch?.name !== undefined) instance.name = cleanInstanceName(patch.name) || instance.name;
  if (patch?.version) instance.version = String(patch.version).trim();
  if (['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(patch?.loader)) instance.loader = patch.loader;
  if (instance.loader === 'vanilla') instance.loaderVersion = null;
  else if (patch?.loaderVersion !== undefined) instance.loaderVersion = String(patch.loaderVersion || 'latest').trim() || 'latest';
  await writeConfig(config);
  if (beforeVersion !== instance.version || beforeLoader !== instance.loader || beforeLoaderVersion !== (instance.loaderVersion || 'latest')) await invalidateLoaderInstall(id);
  preparedLaunchers.delete(id);
  await fsp.rm(launchReadyMarker(id), { force:true }).catch(() => {});
  return { ok: true, config, instance };
});
ipcMain.handle('update-instance-settings', async (_event, id, patch) => {
  const config = await readConfig();
  const index = config.instances.findIndex(i => i.id === id);
  if (index < 0) return { ok: false, error: '인스턴스를 찾을 수 없습니다.' };
  if (activeLauncher?.instanceId === id) return { ok: false, error: '게임 실행 중에는 이 인스턴스 설정을 변경할 수 없습니다.' };

  const instance = normalizeInstance(config.instances[index], config.memory);
  const beforeVersion = instance.version, beforeLoader = instance.loader, beforeLoaderVersion = instance.loaderVersion || 'latest';
  if (patch?.name !== undefined) instance.name = cleanInstanceName(patch.name) || instance.name;
  if (patch?.version) instance.version = String(patch.version).trim();
  if (['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(patch?.loader)) instance.loader = patch.loader;
  if (instance.loader === 'vanilla') instance.loaderVersion = null;
  else if (patch?.loaderVersion !== undefined) instance.loaderVersion = String(patch.loaderVersion || 'latest').trim() || 'latest';

  const min = Math.max(1, Math.min(32, Number(patch?.memory?.min) || instance.settings.memory.min || 2));
  const max = Math.max(min, Math.min(64, Number(patch?.memory?.max) || instance.settings.memory.max || 6));
  const width = Math.max(640, Math.min(7680, Number(patch?.screen?.width) || instance.settings.screen.width || 1280));
  const height = Math.max(480, Math.min(4320, Number(patch?.screen?.height) || instance.settings.screen.height || 720));
  instance.settings = {
    ...instance.settings,
    memory: { min, max },
    screen: { width, height, fullscreen: !!patch?.screen?.fullscreen },
    javaPath: String(patch?.javaPath || '').trim(),
    jvmArgs: String(patch?.jvmArgs || '').trim(),
    gameArgs: String(patch?.gameArgs || '').trim(),
    autoUpdateContent: patch?.autoUpdateContent !== false,
    autoUpdateMinecraftVersion: !!patch?.autoUpdateMinecraftVersion,
    autoUpdateLoaderVersion: patch?.autoUpdateLoaderVersion !== false
  };
  config.instances[index] = instance;
  await writeConfig(config);
  if (beforeVersion !== instance.version || beforeLoader !== instance.loader || beforeLoaderVersion !== (instance.loaderVersion || 'latest')) await invalidateLoaderInstall(id);
  preparedLaunchers.delete(id);
  await fsp.rm(launchReadyMarker(id), { force:true }).catch(() => {});
  return { ok: true, config, instance };
});

ipcMain.handle('pick-java', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: process.platform === 'win32' ? [{ name: 'Java executable', extensions: ['exe'] }] : []
  });
  if (result.canceled || !result.filePaths[0]) return { ok: true, path: '' };
  return { ok: true, path: result.filePaths[0] };
});

// 0.2.x 호환용 전역 메모리 API. 새 UI는 인스턴스별 설정을 사용한다.
ipcMain.handle('update-memory', async (_event, min, max) => {
  min = Math.max(1, Math.min(32, Number(min) || 2));
  max = Math.max(min, Math.min(64, Number(max) || 6));
  const config = await readConfig(); config.memory = { min, max }; await writeConfig(config);
  return { ok: true, config };
});

async function addContentFiles(id, type, filePaths) {
  const meta = validateContentType(type); const folder = targetFolder(id, type);
  await fsp.mkdir(folder, { recursive: true });
  const added = [], skipped = [];
  for (const source of filePaths || []) {
    try {
      const stat = await fsp.stat(source);
      if (!stat.isFile()) { skipped.push(path.basename(source)); continue; }
      const cleanName = path.basename(source);
      const raw = cleanName.endsWith('.disabled') ? cleanName.slice(0, -9) : cleanName;
      if (!meta.extensions.includes(path.extname(raw).toLowerCase())) { skipped.push(cleanName); continue; }
      await fsp.copyFile(source, path.join(folder, cleanName)); added.push(cleanName);
    } catch { skipped.push(path.basename(source)); }
  }
  return { added, skipped };
}
ipcMain.handle('pick-content', async (_event, id, type) => {
  validateContentType(type);
  const filters = type === 'mods' ? [{ name: 'Minecraft Mods', extensions: ['jar'] }] : [{ name: 'ZIP files', extensions: ['zip'] }];
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters });
  if (result.canceled) return { ok: true, added: [], skipped: [] };
  return { ok: true, ...(await addContentFiles(id, type, result.filePaths)) };
});
ipcMain.handle('add-content-paths', async (_event, id, type, filePaths) => ({ ok: true, ...(await addContentFiles(id, type, filePaths)) }));

async function managedForType(id, type) {
  const meta = validateContentType(type);
  return (await readRegistry(id)).filter(x => x.folder === meta.folder);
}
async function enrichRegistryIcons(id, registry) {
  const missing = registry.filter(x => x.projectId && !x.iconUrl);
  if (!missing.length) return registry;
  try {
    const ids = [...new Set(missing.map(x => x.projectId))];
    for (let start = 0; start < ids.length; start += 80) {
      const chunk = ids.slice(start, start + 80);
      const projects = await fetchJson(`${MODRINTH_API}/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`);
      const byId = new Map((projects || []).map(project => [project.id, project]));
      for (const rec of registry) {
        const project = byId.get(rec.projectId);
        if (project) {
          rec.iconUrl = project.icon_url || null;
          rec.slug = rec.slug || project.slug || null;
          rec.title = rec.title || project.title || null;
        }
      }
    }
    await writeRegistry(id, registry);
  } catch {}
  return registry;
}
ipcMain.handle('list-content', async (_event, id, type) => {
  const folder = targetFolder(id, type); await fsp.mkdir(folder, { recursive: true });
  const meta = validateContentType(type); let registry = await managedForType(id, type); registry = await enrichRegistryIcons(id, registry);
  const byFile = new Map(registry.map(x => [x.fileName, x]));
  const names = await fsp.readdir(folder);
  return names.filter(name => {
    const raw = name.endsWith('.disabled') ? name.slice(0, -9) : name;
    return meta.extensions.includes(path.extname(raw).toLowerCase());
  }).map(name => {
    const displayName = name.endsWith('.disabled') ? name.slice(0, -9) : name;
    const managed = byFile.get(displayName) || byFile.get(name);
    return {
      name, displayName, enabled: !name.endsWith('.disabled'),
      managed: !!managed,
      projectId: managed?.projectId || null,
      title: managed?.title || null,
      versionNumber: managed?.versionNumber || null,
      autoDependency: !!managed?.autoDependency,
      iconUrl: managed?.iconUrl || null
    };
  }).sort((a, b) => (a.title || a.displayName).localeCompare(b.title || b.displayName));
});
ipcMain.handle('toggle-content', async (_event, id, type, name) => {
  const folder = targetFolder(id, type); const safe = path.basename(name);
  const from = path.join(folder, safe); const enabled = !safe.endsWith('.disabled');
  const newName = enabled ? `${safe}.disabled` : safe.slice(0, -9); const to = path.join(folder, newName);
  await fsp.rename(from, to);
  const registry = await readRegistry(id);
  const item = registry.find(x => x.fileName === (enabled ? safe : newName));
  if (item) { item.disabled = enabled; await writeRegistry(id, registry); }
  return { ok: true };
});

async function deleteRegistryFile(id, record) {
  if (!record) return;
  const file = path.join(gameDir(id), record.folder, record.fileName);
  await fsp.rm(file, { force: true }).catch(() => {});
  await fsp.rm(`${file}.disabled`, { force: true }).catch(() => {});
}
async function cleanupOrphanDependencies(id, registry) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const rec of [...registry]) {
      if (rec.autoDependency && (!Array.isArray(rec.parents) || rec.parents.length === 0)) {
        await deleteRegistryFile(id, rec);
        registry = registry.filter(x => x.projectId !== rec.projectId);
        changed = true;
      }
    }
  }
  return registry;
}
async function uninstallManagedProject(id, projectId) {
  let registry = await readRegistry(id);
  const record = registry.find(x => x.projectId === projectId);
  if (!record) return { ok: false, error: '설치 정보를 찾을 수 없습니다.' };

  // 사용자가 직접 설치한 프로젝트라도 다른 설치 항목이 필수 의존성으로 쓰는 중이면
  // 실제 파일은 유지하고 '자동 의존성'으로 전환한다.
  const stillRequiredBy = (record.parents || []).filter(Boolean);
  if (!record.autoDependency && stillRequiredBy.length > 0) {
    record.autoDependency = true;
    for (const rec of registry) rec.parents = (rec.parents || []).filter(p => p !== projectId);
    registry = await cleanupOrphanDependencies(id, registry);
    await writeRegistry(id, registry);
    return { ok: true, retainedAsDependency: true };
  }

  await deleteRegistryFile(id, record);
  registry = registry.filter(x => x.projectId !== projectId);
  for (const rec of registry) rec.parents = (rec.parents || []).filter(p => p !== projectId);
  registry = await cleanupOrphanDependencies(id, registry);
  await writeRegistry(id, registry);
  return { ok: true };
}
ipcMain.handle('delete-content', async (_event, id, type, name) => {
  const folder = targetFolder(id, type); const safe = path.basename(name);
  const registry = await readRegistry(id);
  const raw = safe.endsWith('.disabled') ? safe.slice(0, -9) : safe;
  const managed = registry.find(x => x.folder === validateContentType(type).folder && x.fileName === raw);
  if (managed) return uninstallManagedProject(id, managed.projectId);
  await fsp.rm(path.join(folder, safe), { force: true });
  return { ok: true };
});
ipcMain.handle('open-content-folder', async (_event, id, type) => {
  const folder = targetFolder(id, type); await fsp.mkdir(folder, { recursive: true });
  const error = await shell.openPath(folder); return { ok: !error, error };
});
ipcMain.handle('open-instance-folder', async (_event, id) => {
  const folder = gameDir(id); await fsp.mkdir(folder, { recursive: true });
  const error = await shell.openPath(folder); return { ok: !error, error };
});

async function recordFileExists(id, rec) {
  if (!rec) return false;
  const base = path.join(gameDir(id), rec.folder, rec.fileName);
  try { await fsp.access(base); return true; } catch {}
  try { await fsp.access(`${base}.disabled`); return true; } catch {}
  return false;
}

async function getInstanceCapabilities(id) {
  const modsFolder = targetFolder(id, 'mods');
  await fsp.mkdir(modsFolder, { recursive: true });
  const registry = await readRegistry(id);
  let irisInstalled = false;
  for (const rec of registry) {
    const looksLikeIris = rec.projectType === 'mod' && (String(rec.slug || '').toLowerCase() === 'iris' || /^iris(?: shaders)?$/i.test(String(rec.title || '').trim()));
    if (!looksLikeIris) continue;
    const enabledPath = path.join(gameDir(id), rec.folder, rec.fileName);
    try { await fsp.access(enabledPath); irisInstalled = true; break; } catch {}
  }
  if (!irisInstalled) {
    const names = await fsp.readdir(modsFolder).catch(() => []);
    irisInstalled = names.some(name => !name.endsWith('.disabled') && /^iris(?:[-_.+].*)?\.jar$/i.test(name));
  }
  return { irisInstalled };
}
ipcMain.handle('instance-capabilities', async (_event, id) => {
  try { return { ok: true, ...(await getInstanceCapabilities(id)) }; }
  catch (error) { return { ok: false, irisInstalled: false, error: error.message }; }
});

async function repairManagedContent(id) {
  await ensureInstanceFolders(id);
  const registry = await readRegistry(id);
  let repaired = 0;
  for (const rec of registry) {
    if (await recordFileExists(id, rec)) continue;
    try {
      const version = await getVersion(rec.versionId);
      const file = chooseFile(version);
      if (!file) continue;
      const destination = path.join(gameDir(id), rec.folder, rec.fileName || path.basename(file.filename));
      await downloadFile(file.url, destination, file.hashes);
      repaired++;
      send('content-progress', { projectId: rec.projectId, text: `${rec.title || rec.fileName} 파일 복구 완료` });
    } catch (error) {
      await appendLauncherLog(id, `CONTENT REPAIR ERROR ${rec.projectId}: ${error.message || error}`);
    }
  }
  return repaired;
}

function modrinthFacets(instance, type) {
  const meta = validateContentType(type);
  const facets = [[`project_type:${meta.projectType}`]];
  if (instance.version && !instance.version.startsWith('latest_')) facets.push([`versions:${instance.version}`]);
  if (meta.projectType === 'mod' && instance.loader !== 'vanilla') facets.push([`categories:${instance.loader}`]);
  return facets;
}
ipcMain.handle('modrinth-search', async (_event, id, type, query) => {
  try {
    const { instance } = await getInstance(id);
    if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    const meta = validateContentType(type);
    if (meta.projectType === 'mod' && instance.loader === 'vanilla') {
      return { ok: false, error: 'Vanilla 인스턴스에는 모드를 설치할 수 없습니다. Fabric/Forge/NeoForge/Quilt 인스턴스를 만들어 주세요.' };
    }
    const params = new URLSearchParams({
      query: String(query || '').trim(),
      facets: JSON.stringify(modrinthFacets(instance, type)),
      index: String(query || '').trim() ? 'relevance' : 'downloads',
      limit: '30'
    });
    const data = await fetchJson(`${MODRINTH_API}/search?${params}`);
    const registry = await readRegistry(id);
    const installed = new Set();
    for (const rec of registry) if (await recordFileExists(id, rec)) installed.add(rec.projectId);
    return {
      ok: true,
      results: (data.hits || []).map(h => ({
        projectId: h.project_id, title: h.title, description: h.description, author: h.author,
        iconUrl: h.icon_url, downloads: h.downloads, projectType: h.project_type,
        categories: h.display_categories || h.categories || [], installed: installed.has(h.project_id)
      }))
    };
  } catch (error) { return { ok: false, error: error.message }; }
});

async function getProject(projectId) { return fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`); }
async function getVersion(versionId) { return fetchJson(`${MODRINTH_API}/version/${encodeURIComponent(versionId)}`); }
async function compatibleVersions(instance, projectId, projectType) {
  const params = new URLSearchParams({ include_changelog: 'false' });
  if (instance.version) params.set('game_versions', JSON.stringify([instance.version]));
  if (projectType === 'mod' && instance.loader !== 'vanilla') params.set('loaders', JSON.stringify([instance.loader]));
  const versions = await fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version?${params}`);
  return (versions || []).filter(v => v.status === 'listed' || !v.status).sort((a, b) => {
    const rank = { release: 0, beta: 1, alpha: 2 };
    const r = (rank[a.version_type] ?? 9) - (rank[b.version_type] ?? 9);
    if (r !== 0) return r;
    return new Date(b.date_published) - new Date(a.date_published);
  });
}
function chooseFile(version) { return version.files?.find(f => f.primary) || version.files?.[0] || null; }
function contentTypeForProject(projectType) {
  if (projectType === 'mod') return 'mods';
  if (projectType === 'resourcepack') return 'resourcepacks';
  if (projectType === 'shader') return 'shaderpacks';
  throw new Error(`지원하지 않는 Modrinth 프로젝트 종류: ${projectType}`);
}
async function downloadFile(url, destination, hashes) {
  const res = await fetch(url, { headers: { 'User-Agent': APP_UA } });
  if (!res.ok) throw new Error(`파일 다운로드 실패: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (hashes?.sha512) {
    const got = crypto.createHash('sha512').update(buf).digest('hex');
    if (got.toLowerCase() !== hashes.sha512.toLowerCase()) throw new Error('다운로드 파일 SHA-512 검증에 실패했습니다.');
  } else if (hashes?.sha1) {
    const got = crypto.createHash('sha1').update(buf).digest('hex');
    if (got.toLowerCase() !== hashes.sha1.toLowerCase()) throw new Error('다운로드 파일 SHA-1 검증에 실패했습니다.');
  }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.download`;
  await fsp.writeFile(temp, buf);
  await fsp.rename(temp, destination).catch(async () => { await fsp.rm(destination, { force: true }); await fsp.rename(temp, destination); });
}
function collisionSafeFileName(registry, projectId, filename) {
  const collision = registry.find(x => x.fileName === filename && x.projectId !== projectId);
  if (!collision) return filename;
  const ext = path.extname(filename), base = path.basename(filename, ext);
  return `${base}-${projectId}${ext}`;
}
async function resolveInstallCandidate(instance, projectId, specificVersionId = null) {
  const project = await getProject(projectId);
  const projectType = project.project_type;
  if (projectType === 'mod' && instance.loader === 'vanilla') throw new Error('Vanilla 인스턴스에는 모드를 설치할 수 없습니다.');
  let version;
  if (specificVersionId) {
    version = await getVersion(specificVersionId);
    if (projectType === 'mod' && !(version.loaders || []).includes(instance.loader)) throw new Error(`${project.title}: ${instance.loader}용 버전이 아닙니다.`);
    if (instance.version && !(version.game_versions || []).includes(instance.version)) throw new Error(`${project.title}: Minecraft ${instance.version}와 호환되지 않습니다.`);
  } else {
    const versions = await compatibleVersions(instance, projectId, projectType);
    version = versions[0];
    if (!version) throw new Error(`${project.title}: 현재 Minecraft ${instance.version} / ${instance.loader}에 맞는 버전이 없습니다.`);
  }
  return { project, version };
}
async function collectRequiredDependencies(id, instance, projectId) {
  const registry = await readRegistry(id);
  const installed = new Set();
  for (const rec of registry) if (await recordFileExists(id, rec)) installed.add(rec.projectId);
  const result = [];
  const seen = new Set();
  async function walk(pid, specificVersionId = null) {
    if (!pid || seen.has(pid)) return;
    seen.add(pid);
    const { project, version } = await resolveInstallCandidate(instance, pid, specificVersionId);
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required') continue;
      let depProjectId = dep.project_id;
      let depVersionId = dep.version_id || null;
      if (!depProjectId && depVersionId) depProjectId = (await getVersion(depVersionId)).project_id;
      if (!depProjectId) continue;
      if (!installed.has(depProjectId)) {
        const candidate = await resolveInstallCandidate(instance, depProjectId, depVersionId);
        if (!result.some(x => x.projectId === depProjectId)) result.push({ projectId: depProjectId, title: candidate.project.title, versionId: candidate.version.id });
      }
      await walk(depProjectId, depVersionId);
    }
  }
  const root = await resolveInstallCandidate(instance, projectId);
  await walk(projectId);
  return { rootTitle: root.project.title, dependencies: result };
}
ipcMain.handle('modrinth-install-plan', async (_event, id, projectId) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    return { ok: true, ...(await collectRequiredDependencies(id, instance, projectId)) };
  } catch (error) { return { ok: false, error: error.message }; }
});

async function installProjectInternal(id, instance, projectId, options = {}, seen = new Set()) {
  if (seen.has(projectId)) return;
  seen.add(projectId);
  const project = await getProject(projectId);
  const projectType = project.project_type;
  const type = contentTypeForProject(projectType);
  if (projectType === 'mod' && instance.loader === 'vanilla') throw new Error('Vanilla 인스턴스에는 모드를 설치할 수 없습니다.');

  let version;
  if (options.specificVersionId) {
    version = await getVersion(options.specificVersionId);
    const versionLoaders = version.loaders || [];
    if (projectType === 'mod' && !versionLoaders.includes(instance.loader)) {
      throw new Error(`${project.title}: ${instance.loader}용 의존성 버전이 아닙니다.`);
    }
    if (instance.version && !(version.game_versions || []).includes(instance.version)) {
      throw new Error(`${project.title}: Minecraft ${instance.version}와 호환되지 않습니다.`);
    }
  } else {
    const versions = await compatibleVersions(instance, projectId, projectType);
    version = versions[0];
    if (!version) throw new Error(`${project.title}: 현재 Minecraft ${instance.version} / ${instance.loader}에 맞는 버전이 없습니다.`);
  }
  const file = chooseFile(version);
  if (!file) throw new Error(`${project.title}: 다운로드할 파일이 없습니다.`);

  let registry = await readRegistry(id);
  const existing = registry.find(x => x.projectId === projectId);
  const rootProjectId = options.rootProjectId || projectId;
  if (existing && existing.versionId === version.id) {
    const physicalExists = await recordFileExists(id, existing);
    if (!physicalExists) {
      const folder = validateContentType(type).folder;
      const destination = path.join(gameDir(id), folder, existing.fileName || path.basename(file.filename));
      send('content-progress', { projectId, text: `${project.title} 실제 파일 복구 중…` });
      await downloadFile(file.url, destination, file.hashes);
      existing.fileName = path.basename(destination);
      existing.folder = folder;
      existing.hashes = file.hashes || {};
      existing.disabled = false;
    }
    if (options.autoDependency && !existing.parents?.includes(rootProjectId)) {
      existing.parents = [...(existing.parents || []), rootProjectId];
    }
    await writeRegistry(id, registry);
  } else {
    const folder = validateContentType(type).folder;
    const fileName = collisionSafeFileName(registry, projectId, path.basename(file.filename));
    const destination = path.join(gameDir(id), folder, fileName);
    send('content-progress', { projectId, text: `${project.title} 다운로드 중…` });
    await downloadFile(file.url, destination, file.hashes);
    if (existing) {
      const oldPath = path.join(gameDir(id), existing.folder, existing.fileName);
      if (path.resolve(oldPath) !== path.resolve(destination)) {
        await deleteRegistryFile(id, existing);
      } else {
        // 같은 파일명으로 교체된 경우 새 파일은 유지하고, 비활성화 사본만 정리한다.
        await fsp.rm(`${destination}.disabled`, { force: true }).catch(() => {});
      }
    }
    registry = registry.filter(x => x.projectId !== projectId);
    registry.push({
      projectId, title: project.title, slug: project.slug, iconUrl: project.icon_url || null, projectType,
      versionId: version.id, versionNumber: version.version_number,
      fileName, folder, hashes: file.hashes || {}, installedAt: new Date().toISOString(),
      autoDependency: options.autoDependency ? (existing ? existing.autoDependency : true) : false,
      parents: Array.from(new Set([...(existing?.parents || []), ...(options.autoDependency ? [rootProjectId] : [])])),
      disabled: false
    });
    await writeRegistry(id, registry);
    if (!(await recordFileExists(id, registry.find(x => x.projectId === projectId)))) {
      throw new Error(`${project.title}: 다운로드는 완료되었지만 실제 ${folder} 폴더에서 파일을 확인하지 못했습니다.`);
    }
  }

  const installedRecord = (await readRegistry(id)).find(x => x.projectId === projectId);
  if (!installedRecord || !(await recordFileExists(id, installedRecord))) {
    throw new Error(`${project.title}: 설치 기록과 실제 콘텐츠 파일을 동기화하지 못했습니다.`);
  }

  for (const dep of version.dependencies || []) {
    if (dep.dependency_type !== 'required') continue;
    let depProjectId = dep.project_id;
    let specificVersionId = dep.version_id || null;
    if (!depProjectId && specificVersionId) {
      const depVersion = await getVersion(specificVersionId);
      depProjectId = depVersion.project_id;
    }
    if (!depProjectId) continue;
    await installProjectInternal(id, instance, depProjectId, {
      rootProjectId, autoDependency: true, specificVersionId
    }, seen);
  }
  return { project, version };
}
ipcMain.handle('modrinth-install', async (_event, id, projectId, allowDependencies = false) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    await ensureInstanceFolders(id);
    const plan = await collectRequiredDependencies(id, instance, projectId);
    if (plan.dependencies.length && !allowDependencies) {
      return { ok: false, needsConfirmation: true, title: plan.rootTitle, dependencies: plan.dependencies };
    }
    const result = await installProjectInternal(id, instance, projectId, { rootProjectId: projectId, autoDependency: false });
    send('content-progress', { projectId, text: `${result.project.title} 설치 완료` });
    return { ok: true, title: result.project.title, version: result.version.version_number };
  } catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('modrinth-uninstall', async (_event, id, projectId) => uninstallManagedProject(id, projectId));

async function getUpdateForRecord(instance, rec) {
  try {
    const versions = await compatibleVersions(instance, rec.projectId, rec.projectType);
    const latest = versions[0];
    if (!latest || latest.id === rec.versionId) return null;
    return { projectId: rec.projectId, title: rec.title, currentVersion: rec.versionNumber, latestVersion: latest.version_number, latestVersionId: latest.id };
  } catch { return null; }
}
ipcMain.handle('modrinth-check-updates', async (_event, id) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    const registry = await readRegistry(id);
    const roots = registry.filter(x => !x.autoDependency);
    const updates = [];
    for (const rec of roots) {
      const u = await getUpdateForRecord(instance, rec); if (u) updates.push(u);
    }
    return { ok: true, updates };
  } catch (error) { return { ok: false, error: error.message }; }
});
async function updateManagedRoot(id, instance, projectId) {
  let registry = await readRegistry(id);
  const root = registry.find(x => x.projectId === projectId);
  if (!root) throw new Error('설치 정보를 찾을 수 없습니다.');
  // 이 루트가 더 이상 필요로 하지 않을 수도 있는 자동 의존성 연결을 먼저 제거
  for (const rec of registry) rec.parents = (rec.parents || []).filter(p => p !== projectId);
  await writeRegistry(id, registry);
  await installProjectInternal(id, instance, projectId, { rootProjectId: projectId, autoDependency: false });
  registry = await readRegistry(id);
  registry = await cleanupOrphanDependencies(id, registry);
  await writeRegistry(id, registry);
}
ipcMain.handle('modrinth-update', async (_event, id, projectId) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    await updateManagedRoot(id, instance, projectId);
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message }; }
});
async function updateAllManagedContent(id, instance) {
  const roots = (await readRegistry(id)).filter(x => !x.autoDependency).map(x => x.projectId);
  let count = 0;
  for (const projectId of roots) {
    const rec = (await readRegistry(id)).find(x => x.projectId === projectId);
    if (!rec) continue;
    const u = await getUpdateForRecord(instance, rec);
    if (u) { await updateManagedRoot(id, instance, projectId); count++; }
  }
  return count;
}
ipcMain.handle('modrinth-update-all', async (_event, id) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    return { ok: true, count: await updateAllManagedContent(id, instance) };
  } catch (error) { return { ok: false, error: error.message }; }
});

function launchReadyMarker(id) { return path.join(instanceDir(id), 'launch-ready.json'); }
async function writeLaunchReadyMarker(id, instance) {
  await fsp.writeFile(launchReadyMarker(id), JSON.stringify({ version: instance.version, loader: instance.loader, loaderVersion: instance.loaderVersion || null, at: new Date().toISOString() }), 'utf8').catch(() => {});
}

async function appendLauncherLog(id, text) {
  try {
    await fsp.mkdir(logsDir(id), { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    await fsp.appendFile(path.join(logsDir(id), `launcher-${stamp}.log`), `[${new Date().toISOString()}] ${text}\n`, 'utf8');
  } catch {}
}
function splitArgsLines(text) {
  return String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}
function launcherErrorMessage(err) {
  if (!err) return '알 수 없는 실행 오류';
  if (typeof err === 'string') return err;
  return err.message || err.error || err.stack || JSON.stringify(err);
}
function emitLaunchState(state, instanceId, extra = {}) {
  if (activeLauncher && activeLauncher.instanceId === instanceId) activeLauncher.state = state;
  send('launch-state', { state, instanceId, ...extra });
}

function minecraftWorkerPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'minecraft-worker.js');
  return path.join(__dirname, 'minecraft-worker.js');
}
function launchLogPath(id) {
  const stamp = new Date().toISOString().slice(0, 10);
  return path.join(logsDir(id), `launcher-${stamp}.log`);
}
function killWorkerTree(worker) {
  if (!worker || !worker.pid) return;
  if (process.platform === 'win32') {
    // /T로 worker가 만든 Java까지 한 번에 종료한다. 준비 중 다운로드도 worker와 함께 즉시 중단된다.
    execFile('taskkill.exe', ['/PID', String(worker.pid), '/T', '/F'], { windowsHide:true, timeout:4000 }, () => {});
    setTimeout(() => { try { worker.kill(); } catch {} }, 350).unref?.();
  } else {
    try { worker.kill(); } catch {}
  }
}
function isRetryableLaunchError(message) {
  return /timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|download|fetch|HTTP 5\d\d|aborted|unexpected end|premature|corrupt|checksum|extract/i.test(String(message || ''));
}
async function ensureFreshAccountForLaunch() {
  if (!currentAccount) return false;
  const stamped = Number(currentAccount._easycraftRefreshedAt || accountRefreshedAt || 0);
  // 실행할 때마다 인증 서버를 기다리지 않고, 충분히 오래된 경우에만 갱신한다.
  if (Date.now() - stamped < 6 * 60 * 60 * 1000) return true;
  try {
    const refreshed = await new Microsoft().refresh(currentAccount);
    if (!refreshed || refreshed.error) return false;
    refreshed._easycraftSkinUrl = currentAccount._easycraftSkinUrl || null;
    refreshed._easycraftFaceDataUrl = currentAccount._easycraftFaceDataUrl || null;
    refreshed._easycraftFaceOverlayDataUrl = currentAccount._easycraftFaceOverlayDataUrl || null;
    refreshed._easycraftRefreshedAt = Date.now();
    currentAccount = refreshed; accountRefreshedAt = Date.now();
    await fsp.writeFile(accountPath(), JSON.stringify(refreshed, null, 2), 'utf8');
    send('account-changed', accountSummary(refreshed));
    return true;
  } catch { return false; }
}

ipcMain.handle('get-launch-state', async () => {
  return activeLauncher ? { state: activeLauncher.state || 'preparing', instanceId: activeLauncher.instanceId } : { state: 'idle', instanceId: null };
});

function clearLaunchWatchdog(ref) {
  if (ref?.watchdog) clearInterval(ref.watchdog);
  if (ref) ref.watchdog = null;
}
function startLaunchWatchdog(ref) {
  clearLaunchWatchdog(ref);
  ref.watchdog = setInterval(() => {
    if (activeLauncher !== ref || ref.cancelRequested || ref.state !== 'preparing') return;
    // 다운로드/압축/로더 적용 이벤트가 2분 동안 완전히 멎으면 worker만 재시작한다.
    // Electron UI는 별도 프로세스라 멈추지 않는다.
    if (Date.now() - ref.lastActivityAt < 120000) return;
    const oldWorker = ref.worker;
    if (ref.attempt < 2) {
      ref.attempt += 1;
      ref.lastActivityAt = Date.now();
      ref.worker = null;
      if (oldWorker) killWorkerTree(oldWorker);
      send('launch-progress', { percent: 3, text: '준비 작업이 지연되어 안전하게 한 번 다시 시도합니다…' });
      setTimeout(() => { if (activeLauncher === ref && !ref.cancelRequested) spawnMinecraftWorker(ref); }, 700).unref?.();
    } else {
      clearLaunchWatchdog(ref);
      if (oldWorker) killWorkerTree(oldWorker);
      const msg = 'Minecraft 준비 작업이 오래 응답하지 않아 중단했습니다. 인터넷 연결과 설치된 모드 호환성을 확인해 주세요.';
      send('launch-error', msg);
      emitLaunchState('idle', ref.instanceId, { error: msg });
      activeLauncher = null;
    }
  }, 10000);
  ref.watchdog.unref?.();
}
function finishLaunchRef(ref, { error = null, closed = false, code = null } = {}) {
  if (activeLauncher !== ref) return;
  clearLaunchWatchdog(ref);
  const id = ref.instanceId;
  const wasRunning = ref.state === 'running';
  activeLauncher = null;
  if (error) {
    send('launch-error', error);
    emitLaunchState('idle', id, { error });
  } else {
    send('launch-closed', { instanceId:id, code });
    emitLaunchState('idle', id);
  }
  if (closed && wasRunning && ref.instance?.settings?.autoUpdateContent) {
    setTimeout(async () => {
      try {
        const count = await updateAllManagedContent(id, ref.instance);
        if (count) send('content-progress', { text: `${count}개 콘텐츠 업데이트 완료 · 다음 실행에 적용됩니다.` });
      } catch (e) { await appendLauncherLog(id, `POST-GAME CONTENT UPDATE ERROR ${e.message || e}`); }
    }, 1000).unref?.();
  }
}
function retryLaunchWorker(ref, reason) {
  if (activeLauncher !== ref || ref.cancelRequested) return false;
  if (ref.state !== 'preparing' || ref.attempt >= 2 || !isRetryableLaunchError(reason)) return false;
  ref.attempt += 1;
  ref.lastActivityAt = Date.now();
  const old = ref.worker;
  ref.worker = null;
  if (old) killWorkerTree(old);
  appendLauncherLog(ref.instanceId, `RETRY ${ref.attempt} reason=${reason}`);
  send('launch-progress', { percent: 3, text: '다운로드 연결이 끊겨 자동으로 다시 이어서 준비합니다…' });
  setTimeout(() => { if (activeLauncher === ref && !ref.cancelRequested) spawnMinecraftWorker(ref); }, 700).unref?.();
  return true;
}
function spawnMinecraftWorker(ref) {
  if (activeLauncher !== ref || ref.cancelRequested) return;
  let worker;
  try {
    worker = utilityProcess.fork(minecraftWorkerPath(), [], {
      cwd: app.getPath('userData'),
      env: { ...process.env },
      stdio: 'ignore',
      serviceName: 'EasyCraft Minecraft Worker'
    });
  } catch (error) {
    return finishLaunchRef(ref, { error: `Minecraft 실행 프로세스를 만들지 못했습니다: ${launcherErrorMessage(error)}` });
  }
  ref.worker = worker;
  ref.lastActivityAt = Date.now();
  ref.workerTerminalMessage = false;

  worker.on('message', message => {
    if (activeLauncher !== ref || ref.worker !== worker || !message) return;
    ref.lastActivityAt = Date.now();
    if (message.type === 'progress') {
      send('launch-progress', { percent: message.percent ?? null, text: message.text || 'Minecraft 준비 중…' });
    } else if (message.type === 'activity') {
      send('launch-progress', { text: message.text || 'Minecraft 준비 중…' });
    } else if (message.type === 'running') {
      ref.state = 'running';
      clearLaunchWatchdog(ref);
      emitLaunchState('running', ref.instanceId, { name: ref.instance.name });
      send('launch-progress', { percent: 100, text: 'Minecraft 실행 중' });
      writeLaunchReadyMarker(ref.instanceId, ref.instance);
    } else if (message.type === 'error') {
      ref.workerTerminalMessage = true;
      const msg = launcherErrorMessage(message.error);
      appendLauncherLog(ref.instanceId, `WORKER ERROR ${msg}`);
      if (!retryLaunchWorker(ref, msg)) finishLaunchRef(ref, { error: msg });
    } else if (message.type === 'close') {
      ref.workerTerminalMessage = true;
      finishLaunchRef(ref, { closed:true, code:message.code });
    }
  });
  worker.on('error', error => {
    if (activeLauncher !== ref || ref.worker !== worker) return;
    const msg = launcherErrorMessage(error);
    if (!retryLaunchWorker(ref, msg)) finishLaunchRef(ref, { error:msg });
  });
  worker.on('exit', (code, signal) => {
    if (activeLauncher !== ref || ref.worker !== worker || ref.cancelRequested || ref.workerTerminalMessage) return;
    if (ref.state === 'running') return finishLaunchRef(ref, { closed:true, code });
    const msg = `Minecraft 준비 프로세스가 예기치 않게 종료되었습니다${code !== null ? ` (코드 ${code})` : ''}${signal ? ` · ${signal}` : ''}.`;
    if (!retryLaunchWorker(ref, msg)) finishLaunchRef(ref, { error:msg });
  });
  worker.postMessage({ type:'launch', options:ref.options, instanceId:ref.instanceId, name:ref.instance.name, logPath:launchLogPath(ref.instanceId) });
}

ipcMain.handle('stop-game', async (_event, id) => {
  if (!activeLauncher || activeLauncher.instanceId !== id) return { ok:false, error:'이 인스턴스에서 실행 또는 준비 중인 Minecraft가 없습니다.' };
  const ref = activeLauncher;
  ref.cancelRequested = true;
  ref.state = 'stopping';
  clearLaunchWatchdog(ref);
  emitLaunchState('stopping', id);

  // 준비 다운로드와 실행된 Java가 같은 worker 프로세스 트리에 있으므로 한 번에 즉시 종료한다.
  if (ref.worker) killWorkerTree(ref.worker);
  activeLauncher = null;
  send('launch-closed', { instanceId:id, cancelled:true });
  emitLaunchState('idle', id, { cancelled:true });
  return { ok:true, immediate:true, preparingCancelled:true };
});

async function applyAutomaticInstanceVersionUpdates(id, config, rawInstance) {
  let instance = normalizeInstance(rawInstance, config.memory);
  const changes = [];
  let changed = false;
  let minecraftChanged = false;
  try {
    if (instance.settings.autoUpdateMinecraftVersion) {
      const latest = await latestMinecraftRelease();
      if (latest && latest !== instance.version) {
        changes.push(`Minecraft ${instance.version} → ${latest}`);
        instance.version = latest;
        changed = true;
        minecraftChanged = true;
      }
    }
    if (instance.loader !== 'vanilla' && (instance.settings.autoUpdateLoaderVersion || minecraftChanged)) {
      const info = await loaderVersionsFor(instance.loader, instance.version);
      if (info.latest) {
        const available = new Set((info.versions || []).map(v => v.version));
        const current = instance.loaderVersion || 'latest';
        const mustRepair = minecraftChanged && current !== 'latest' && !available.has(current);
        if (instance.settings.autoUpdateLoaderVersion || mustRepair) {
          if (current !== info.latest) changes.push(`${instance.loader} ${current} → ${info.latest}`);
          instance.loaderVersion = info.latest;
          changed = changed || current !== info.latest;
        }
      }
    }
  } catch (error) {
    // 자동 버전 확인 서버가 잠시 실패해도 사용자가 기존 버전으로 게임을 실행할 수 있게 한다.
    send('status', { kind:'info', text:`버전 자동 업데이트 확인을 건너뛰었습니다: ${error.message}` });
  }
  if (changed) {
    const index = config.instances.findIndex(i => i.id === id);
    if (index >= 0) {
      config.instances[index] = instance;
      await writeConfig(config);
      await invalidateLoaderInstall(id);
      preparedLaunchers.delete(id);
      await fsp.rm(launchReadyMarker(id), { force:true }).catch(() => {});
    }
  }
  return { config, instance, changes };
}

ipcMain.handle('launch-game', async (_event, id) => {
  if (activeLauncher) return { ok:false, error:'이미 Minecraft를 실행하고 있습니다.' };
  let summary = accountSummary(currentAccount);
  if (!summary || !currentAccount) summary = await loadSavedAccount();
  if (!summary || !currentAccount) return { ok:false, needLogin:true, error:'먼저 Microsoft 계정으로 로그인해 주세요.' };
  if (!(await ensureFreshAccountForLaunch())) return { ok:false, needLogin:true, error:'Microsoft 로그인 정보가 만료되었습니다. 다시 로그인해 주세요.' };

  let { config, instance: rawInstance } = await getInstance(id);
  if (!rawInstance) return { ok:false, error:'실행할 인스턴스를 찾을 수 없습니다.' };
  const automatic = await applyAutomaticInstanceVersionUpdates(id, config, rawInstance);
  config = automatic.config;
  const instance = automatic.instance;
  await ensureInstanceFolders(id);
  const settings = instance.settings;

  if (settings.javaPath) {
    try {
      const st = await fsp.stat(settings.javaPath);
      if (!st.isFile()) throw new Error('not-file');
    } catch {
      return { ok:false, error:'설정된 Java 경로를 찾을 수 없습니다. Java 경로를 비우고 자동 선택을 사용하거나 올바른 javaw.exe를 선택해 주세요.' };
    }
  }

  const root = gameDir(id);
  const loaderEnabled = instance.loader !== 'vanilla';
  const options = {
    path: root,
    authenticator: currentAccount,
    version: instance.version || 'latest_release',
    detached: false,
    // 병렬 수를 지나치게 높이면 일부 네트워크/디스크에서 마지막 파일 단계가 멎을 수 있어 공식 기본값 수준으로 안정화한다.
    downloadFileMultiple: 5,
    timeout: 60000,
    verify: false,
    ignored: ['mods','config','saves','resourcepacks','shaderpacks','screenshots','logs','options.txt'],
    loader: {
      enable: loaderEnabled,
      type: loaderEnabled ? instance.loader : null,
      build: loaderEnabled ? (instance.loaderVersion || 'latest') : 'latest',
      path: loaderEnabled ? `loader/${instance.loader}` : './loader'
    },
    java: { path: settings.javaPath || null, type:'jre' },
    screen: { width:settings.screen.width, height:settings.screen.height, fullscreen:!!settings.screen.fullscreen },
    JVM_ARGS: [`-Deasycraft.instance=${safeId(id)}`, ...splitArgsLines(settings.jvmArgs)],
    GAME_ARGS: splitArgsLines(settings.gameArgs),
    memory: { min:`${settings.memory.min}G`, max:`${settings.memory.max}G` }
  };

  const ref = {
    instanceId:id,
    instance,
    options,
    worker:null,
    state:'preparing',
    cancelRequested:false,
    attempt:1,
    lastActivityAt:Date.now(),
    watchdog:null,
    workerTerminalMessage:false
  };
  activeLauncher = ref;
  emitLaunchState('preparing', id, { name:instance.name });
  send('launch-progress', { percent:2, text:`${instance.name} 준비 중…` });
  await appendLauncherLog(id, `LAUNCH 0.4.6 ${instance.name} mc=${instance.version} loader=${instance.loader} root=${root}`);
  startLaunchWatchdog(ref);
  spawnMinecraftWorker(ref);
  return { ok:true, isolatedWorker:true, config, versionChanges:automatic.changes };
});

// ---------- EasyCraft 자체 자동 업데이트 ----------
let launcherUpdateState = { state: 'idle', currentVersion: app.getVersion(), availableVersion: null, percent: 0, repository: null, releaseUrl: null };
let autoUpdaterInstance = null;
let launcherUpdateTimer = null;
let updateRepository = null;

function readBuildInfo() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8')); }
  catch { return { repository: '' }; }
}
function setLauncherUpdateState(patch) {
  launcherUpdateState = { ...launcherUpdateState, ...patch, currentVersion: app.getVersion() };
  send('launcher-update-state', launcherUpdateState);
}
function releasePageUrl(version = launcherUpdateState.availableVersion) {
  if (!updateRepository || !version) return null;
  const safeVersion = String(version).trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(safeVersion)) return null;
  return `https://github.com/${updateRepository}/releases/tag/v${encodeURIComponent(safeVersion)}`;
}
function friendlyUpdateError(error, repository = updateRepository) {
  const raw = String(error?.message || error || '').trim();
  const repo = repository || 'GitHub 업데이트 저장소';
  if (/404|releases\.atom|not found/i.test(raw)) {
    return `${repo}에 공개적으로 접근할 수 없습니다. 저장소를 Public으로 설정하고, v${app.getVersion()} 이상의 GitHub Release를 Draft가 아닌 Published 상태로 올렸는지 확인해 주세요.`;
  }
  if (/401|403|authentication|token|GH_TOKEN/i.test(raw)) {
    return `${repo} 업데이트에 접근 권한이 없습니다. 일반 사용자 자동 업데이트는 Public GitHub 저장소를 사용해 주세요.`;
  }
  return raw || '알 수 없는 업데이트 오류입니다.';
}
async function githubUpdatePreflight(repository) {
  const [owner, repo] = String(repository || '').split('/');
  if (!owner || !repo) throw new Error('업데이트 저장소 주소가 올바르지 않습니다.');
  const headers = {
    'User-Agent': APP_UA,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const repoRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
  if (!repoRes.ok) {
    if (repoRes.status === 404) throw new Error(`404: ${repository} repository is not publicly accessible`);
    throw new Error(`GitHub 저장소 확인 실패 (HTTP ${repoRes.status})`);
  }

  // A published release is required for electron-updater. A missing release is
  // reported separately instead of exposing electron-updater's long raw 404.
  const releaseRes = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, { headers });
  if (!releaseRes.ok) {
    if (releaseRes.status === 404) throw new Error(`404: ${repository} has no published release`);
    throw new Error(`GitHub Release 확인 실패 (HTTP ${releaseRes.status})`);
  }
  return releaseRes.json();
}
async function checkForLauncherUpdate({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) setLauncherUpdateState({ state: 'dev' });
    return { ok: false, error: '개발 모드에서는 자동 업데이트를 검사하지 않습니다. 설치된 .exe에서 확인해 주세요.' };
  }
  if (!autoUpdaterInstance || !updateRepository) {
    const message = '업데이트 기능이 준비되지 않았습니다. GitHub Actions로 빌드한 설치본인지 확인해 주세요.';
    if (manual) setLauncherUpdateState({ state: 'unconfigured', error: message });
    return { ok: false, error: message };
  }
  if (['checking', 'downloading', 'downloaded'].includes(launcherUpdateState.state)) return { ok: true, skipped: true };
  try {
    setLauncherUpdateState({ state: 'checking', percent: 0, error: null });
    await autoUpdaterInstance.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message = friendlyUpdateError(error);
    setLauncherUpdateState({ state: 'error', error: message });
    return { ok: false, error: message };
  }
}
function scheduleAutomaticUpdateChecks() {
  // 첫 화면이 뜬 직후 업데이트를 검사합니다. 새 버전이 있을 때만 선택 화면을 보여줍니다.
  const first = setTimeout(() => checkForLauncherUpdate().catch(() => {}), 900);
  first.unref?.();

  // 오래 켜 둔 경우 4시간마다 다시 확인합니다.
  launcherUpdateTimer = setInterval(() => {
    checkForLauncherUpdate().catch(() => {});
  }, 4 * 60 * 60 * 1000);
  launcherUpdateTimer.unref?.();
}
function initAutoUpdater() {
  const info = readBuildInfo();
  const [owner, repo] = String(info.repository || '').split('/');
  updateRepository = owner && repo ? `${owner}/${repo}` : null;

  if (!app.isPackaged) {
    setLauncherUpdateState({ state: 'dev', repository: updateRepository });
    return;
  }
  try {
    if (!owner || !repo) {
      setLauncherUpdateState({ state: 'unconfigured', repository: null });
      return;
    }

    const { autoUpdater } = require('electron-updater');
    autoUpdaterInstance = autoUpdater;
    // electron-builder가 패키징 때 생성한 app-update.yml을 그대로 사용합니다.
    // 공식 권장 방식대로 setFeedURL을 직접 덮어쓰지 않습니다.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false; // 사용자가 승인한 경우에만 앱에서 조용히 설치합니다.
    autoUpdater.allowPrerelease = false;

    setLauncherUpdateState({ state: 'idle', repository: updateRepository, error: null });
    // checking-for-update is intentionally not forced into a popup in the renderer.
    autoUpdater.on('checking-for-update', () => setLauncherUpdateState({ state: 'checking', percent: 0, error: null }));
    autoUpdater.on('update-available', info2 => setLauncherUpdateState({ state: 'available', availableVersion: info2.version, percent: 0, error: null, startupPrompt: true, releaseUrl: releasePageUrl(info2.version) }));
    autoUpdater.on('update-not-available', () => setLauncherUpdateState({ state: 'latest', availableVersion: null, percent: 0, error: null, startupPrompt: false, releaseUrl: null }));
    autoUpdater.on('download-progress', p => setLauncherUpdateState({ state: 'downloading', percent: Math.round(p.percent || 0), error: null }));
    autoUpdater.on('update-downloaded', info2 => setLauncherUpdateState({ state: 'downloaded', availableVersion: info2.version, percent: 100, error: null, releaseUrl: releasePageUrl(info2.version) }));
    autoUpdater.on('error', error => setLauncherUpdateState({ state: 'error', error: friendlyUpdateError(error) }));

    scheduleAutomaticUpdateChecks();
  } catch (error) {
    setLauncherUpdateState({ state: 'error', error: friendlyUpdateError(error) });
  }
}



async function startUpdateProgressHelper(expectedVersion) {
  if (process.platform !== 'win32') return false;
  try {
    const helperDir = path.join(app.getPath('temp'), 'EasyCraft-Update');
    await fsp.mkdir(helperDir, { recursive: true });
    const helperPath = path.join(helperDir, 'easycraft-update-progress.ps1');
    const script = String.raw`param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$ExePath,
  [Parameter(Mandatory=$true)][string]$ExpectedVersion
)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="EasyCraft 업데이트" Width="390" Height="190" ResizeMode="NoResize"
        WindowStartupLocation="CenterScreen" Topmost="True" ShowInTaskbar="True"
        Background="#0B1016" Foreground="#F4F7FB">
  <Border BorderBrush="#273342" BorderThickness="1" CornerRadius="14" Background="#101720" Padding="22">
    <Grid>
      <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
      <TextBlock Grid.Row="0" Text="EASYCRAFT UPDATE" Foreground="#42E48D" FontWeight="Bold" FontSize="10"/>
      <TextBlock Grid.Row="1" Name="TitleText" Text="업데이트를 준비하고 있습니다" FontWeight="SemiBold" FontSize="17" Margin="0,11,0,5"/>
      <TextBlock Grid.Row="2" Name="StatusText" Text="EasyCraft를 안전하게 종료하는 중입니다." Foreground="#8D9AAA" FontSize="11" Margin="0,0,0,15"/>
      <ProgressBar Grid.Row="3" Name="Progress" Height="5" IsIndeterminate="True" Foreground="#42E48D" Background="#080D12"/>
    </Grid>
  </Border>
</Window>
"@
$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)
$title = $window.FindName('TitleText')
$status = $window.FindName('StatusText')
$progress = $window.FindName('Progress')
$window.Show() | Out-Null
function Pump { $window.Dispatcher.Invoke([action]{}, [Windows.Threading.DispatcherPriority]::Background) }
function Set-State([string]$t,[string]$s) { $title.Text=$t; $status.Text=$s; Pump }
$deadline = (Get-Date).AddMinutes(5)
Set-State 'EasyCraft 종료 중' '업데이트 설치를 위해 실행 중인 런처를 닫고 있습니다.'
while ((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 220; Pump }
Set-State '업데이트 설치 중' ("EasyCraft v" + $ExpectedVersion + " 파일을 적용하고 있습니다.")
Start-Sleep -Milliseconds 550
$newProcess = $null
while ((Get-Date) -lt $deadline) {
  $newProcess = Get-Process | Where-Object { $_.Id -ne $ParentPid -and $_.Path -eq $ExePath } | Select-Object -First 1
  if ($newProcess) { break }
  Start-Sleep -Milliseconds 350
  Pump
}
if ($newProcess) {
  $progress.IsIndeterminate = $false; $progress.Value = 100
  Set-State '업데이트 완료' ("EasyCraft v" + $ExpectedVersion + "을 실행했습니다.")
  Start-Sleep -Milliseconds 1200
} else {
  $progress.IsIndeterminate = $false; $progress.Value = 100
  Set-State '업데이트 처리 완료' 'EasyCraft가 자동으로 열리지 않으면 바탕화면에서 다시 실행해 주세요.'
  Start-Sleep -Seconds 4
}
$window.Close()
`;
    await fsp.writeFile(helperPath, script, 'utf8');
    const child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', helperPath,
      '-ParentPid', String(process.pid),
      '-ExePath', process.execPath,
      '-ExpectedVersion', String(expectedVersion || app.getVersion())
    ], { detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch (error) {
    console.warn('Update progress helper failed:', error);
    return false;
  }
}

ipcMain.handle('check-launcher-update', async () => checkForLauncherUpdate({ manual: true }));
ipcMain.handle('download-launcher-update', async () => {
  if (!autoUpdaterInstance) return { ok: false, error: '업데이트 기능이 준비되지 않았습니다.' };
  try {
    await autoUpdaterInstance.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyUpdateError(error) };
  }
});
ipcMain.handle('install-launcher-update', async () => {
  if (!autoUpdaterInstance || launcherUpdateState.state !== 'downloaded') {
    return { ok: false, error: '다운로드가 완료된 업데이트가 없습니다.' };
  }
  const targetVersion = launcherUpdateState.availableVersion || '새 버전';
  setLauncherUpdateState({ state: 'installing', availableVersion: launcherUpdateState.availableVersion, percent: 100, error: null });
  await startUpdateProgressHelper(targetVersion);
  // 작은 업데이트 진행 창이 화면에 먼저 뜬 뒤 silent NSIS 설치를 시작합니다.
  setTimeout(() => {
    try { autoUpdaterInstance.quitAndInstall(true, true); }
    catch (error) { console.error('quitAndInstall failed:', error); }
  }, 850);
  return { ok: true };
});

ipcMain.handle('open-launcher-release-notes', async (_event, version) => {
  const url = releasePageUrl(version);
  if (!url) return { ok: false, error: '업데이트 내역 주소를 만들 수 없습니다.' };
  try {
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || 'GitHub Release 페이지를 열지 못했습니다.') };
  }
});
