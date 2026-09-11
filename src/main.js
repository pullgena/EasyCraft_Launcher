const { app, BrowserWindow, ipcMain, dialog, shell, utilityProcess, nativeImage, clipboard, safeStorage } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { Launch, Microsoft } = require('minecraft-java-core');
const AdmZip = require('adm-zip');

let mainWindow;
let currentAccount = null;
let activeLauncher = null;
const preparedLaunchers = new Map();
let accountRefreshedAt = 0;

const APP_UA = 'EasyCraftLauncher/0.4.16 (Minecraft launcher; encrypted EasyCraft account vault sync; Modrinth integration)';
const MODRINTH_API = 'https://api.modrinth.com/v2';
const CONTENT_TYPES = {
  mods: { folder: 'mods', extensions: ['.jar'], projectType: 'mod' },
  resourcepacks: { folder: 'resourcepacks', extensions: ['.zip'], projectType: 'resourcepack' },
  shaderpacks: { folder: 'shaderpacks', extensions: ['.zip'], projectType: 'shader' },
  modpacks: { folder: 'modpacks', extensions: ['.mrpack'], projectType: 'modpack' }
};

function dataDir() { return path.join(app.getPath('userData'), 'launcher-data'); }
function configPath() { return path.join(dataDir(), 'config.json'); }
function accountPath() { return path.join(dataDir(), 'account.json'); }
function launcherSessionPath() { return path.join(dataDir(), 'launcher-session.json'); }
function encodeSecureText(text) {
  const plain = String(text || '');
  try {
    if (safeStorage?.isEncryptionAvailable?.()) return `ECS1:${safeStorage.encryptString(plain).toString('base64')}`;
  } catch {}
  return plain;
}
function decodeSecureText(text) {
  const raw = String(text || '');
  if (!raw.startsWith('ECS1:')) return raw;
  try {
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('Windows 보안 저장소를 사용할 수 없습니다.');
    return safeStorage.decryptString(Buffer.from(raw.slice(5), 'base64'));
  } catch (error) { throw new Error(`저장된 EasyCraft 로그인 정보를 복호화하지 못했습니다: ${error.message}`); }
}
async function writeSecureJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  await fsp.writeFile(filePath, encodeSecureText(JSON.stringify(value)), 'utf8');
}
async function readSecureJson(filePath) {
  return JSON.parse(decodeSecureText(await fsp.readFile(filePath, 'utf8')));
}
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
  return {
    selectedInstanceId: null,
    memory: { min: 2, max: 6 },
    launcherSettings: { autoDeleteLogs: true },
    instances: []
  };
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
      launcherSettings: (() => { const value = { ...defaultConfig().launcherSettings, ...(parsed.launcherSettings || {}) }; delete value.microsoftClientId; return value; })(),
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
  const directMicrosoft = account._easycraftAuthFlow === 'direct-microsoft-v1';
  return {
    name: account.name || account.username || account.profile?.name || 'Microsoft 계정',
    uuid: account.uuid || account.id || account.profile?.id || null,
    skinUrl: account._easycraftSkinUrl || null,
    faceUrl: account._easycraftFaceDataUrl || null,
    faceOverlayUrl: account._easycraftFaceOverlayDataUrl || null,
    offlineCached: !!account._easycraftOfflineCached,
    launcherUsername: account._easycraftLauncherUsername || null,
    authMode: directMicrosoft ? 'microsoft-direct' : (account._easycraftLauncherUsername ? 'easycraft-account' : 'microsoft')
  };
}
function isDirectMicrosoftAccount(account) {
  return !!account && account._easycraftAuthFlow === 'direct-microsoft-v1';
}
function isUsableCachedMicrosoftAccount(account) {
  if (!account || account.error || !account.access_token || !account.uuid || !account.name || !account.meta) return false;
  return !!account.refresh_token;
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
    await writeSecureJson(accountPath(), account).catch(() => {});
  }
  const summary = accountSummary(account);
  send('account-changed', summary);
  return summary;
}
async function loadSavedAccount() {
  let cached = null;
  try {
    cached = await readSecureJson(accountPath());
    if (!isUsableCachedMicrosoftAccount(cached)) cached = null;
  } catch { cached = null; }

  if (cached) {
    currentAccount = cached;
    accountRefreshedAt = Number(cached._easycraftRefreshedAt || 0);
  }

  // v0.4.16: EasyCraft 계정 없이 Microsoft만 인증한 계정은
  // Weird Host 계정 서버를 거치지 않고 이 PC에서 직접 갱신합니다.
  if (cached && isDirectMicrosoftAccount(cached)) {
    try {
      const refreshed = await refreshDirectMicrosoftAccount(cached);
      refreshed._easycraftSkinUrl = cached?._easycraftSkinUrl || null;
      refreshed._easycraftFaceDataUrl = cached?._easycraftFaceDataUrl || null;
      refreshed._easycraftFaceOverlayDataUrl = cached?._easycraftFaceOverlayDataUrl || null;
      await writeSecureJson(accountPath(), refreshed);
      currentAccount = refreshed;
      accountRefreshedAt = Date.now();
      setTimeout(() => refreshAccountVisual(refreshed).catch(() => {}), 50).unref?.();
      return accountSummary(refreshed);
    } catch {
      cached._easycraftOfflineCached = true;
      currentAccount = cached;
      return accountSummary(cached);
    }
  }

  const session = await readLauncherSession();
  if (session?.sessionId && session?.sessionKeyB64 && session?.vaultKeyB64) {
    try {
      const refreshed = await refreshAccountFromVault(session);
      refreshed._easycraftSkinUrl = cached?._easycraftSkinUrl || null;
      refreshed._easycraftFaceDataUrl = cached?._easycraftFaceDataUrl || null;
      refreshed._easycraftFaceOverlayDataUrl = cached?._easycraftFaceOverlayDataUrl || null;
      await writeSecureJson(accountPath(), refreshed);
      currentAccount = refreshed;
      accountRefreshedAt = Date.now();
      setTimeout(() => refreshAccountVisual(refreshed).catch(() => {}), 50).unref?.();
      return accountSummary(refreshed);
    } catch (error) {
      if (error?.needLogin || error?.status === 401) await clearLauncherSession().catch(() => {});
    }
  }

  if (cached) {
    cached._easycraftOfflineCached = true;
    currentAccount = cached;
    return accountSummary(cached);
  }
  currentAccount = null;
  return null;
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
  // v0.4.16: 창을 가장 먼저 띄워 업데이트/로그 정리/계정 갱신 때문에 첫 화면이 늦어지지 않게 합니다.
  await createWindow();
  initAutoUpdater();
  cleanupOldLogs().catch(() => {});
  loadSavedAccount().then(summary => send('account-changed', summary)).catch(() => {});
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

const DEFAULT_NETWORK_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const parentSignal = opts.signal || null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();

  let onParentAbort = null;
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort();
    else {
      onParentAbort = () => controller.abort();
      parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error(`네트워크 응답 시간 초과 (${Math.round(timeoutMs / 1000)}초)`);
    throw error;
  } finally {
    clearTimeout(timer);
    if (parentSignal && onParentAbort) parentSignal.removeEventListener('abort', onParentAbort);
  }
}
async function fetchJson(url, opts = {}) {
  const res = await fetchWithTimeout(url, {
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
  const res = await fetchWithTimeout(url, {
    ...opts,
    headers: { 'User-Agent': APP_UA, ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function promiseWithTimeout(promise, timeoutMs, message = '작업 응답 시간이 초과되었습니다.') {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
async function postForm(url, values) {
  const body = new URLSearchParams(values);
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': APP_UA
    },
    body
  }, 15000);
  let data = {};
  try { data = await res.json(); } catch { data = { error: `HTTP_${res.status}` }; }
  return { ok: res.ok, status: res.status, data };
}
function friendlyMicrosoftAuthError(error) {
  const raw = String(error?.error || error?.message || error || 'Microsoft 인증에 실패했습니다.');
  if (/authorization_declined|access_denied|cancel/i.test(raw)) return 'Microsoft 로그인이 취소되었습니다.';
  if (/expired_token|code_expired|expired/i.test(raw)) return 'Microsoft 로그인 코드가 만료되었습니다. 다시 연결해 주세요.';
  if (/NO_MINECRAFT_ACCOUNT|minecraft profile/i.test(raw)) return '이 Microsoft 계정에 Minecraft Java 프로필이 없습니다.';
  if (/NO_MINECRAFT_ENTITLEMENTS/i.test(raw)) return '이 계정에서 Minecraft Java Edition 소유권을 확인하지 못했습니다.';
  if (/invalid app registration|AppRegInfo|XboxLive\.signin/i.test(raw)) return 'Microsoft/Xbox/Minecraft 인증 단계에서 로그인을 완료하지 못했습니다.';
  if (/ECONN|ENOTFOUND|EAI_AGAIN|network|fetch failed|timeout|timed out/i.test(raw)) return 'Microsoft 인증 서버와 통신하지 못했습니다. 인터넷 연결, DNS, 방화벽/보안 프로그램 또는 일시적인 Microsoft 서버 문제를 확인해 주세요.';
  return raw;
}
async function persistMicrosoftAccount(account) {
  if (!account || account.error) throw new Error(friendlyMicrosoftAuthError(account));
  account._easycraftRefreshedAt = Date.now();
  account._easycraftOfflineCached = false;
  accountRefreshedAt = Date.now();
  currentAccount = account;
  preparedLaunchers.clear();
  await fsp.mkdir(dataDir(), { recursive: true });
  await writeSecureJson(accountPath(), account);
  const summary = accountSummary(account);
  setTimeout(() => refreshAccountVisual(account).catch(() => {}), 50).unref?.();
  send('account-changed', summary);
  return summary;
}
async function refreshDirectMicrosoftAccount(stored) {
  const refreshed = await promiseWithTimeout(
    new Microsoft().refresh(stored),
    45000,
    'Microsoft 로그인 갱신 시간이 초과되었습니다.'
  );
  if (!refreshed || refreshed.error) throw new Error(refreshed?.error || 'Microsoft 인증 갱신 실패');
  refreshed._easycraftAuthFlow = 'direct-microsoft-v1';
  refreshed._easycraftLauncherUsername = null;
  refreshed._easycraftRefreshedAt = Date.now();
  refreshed._easycraftOfflineCached = false;
  return refreshed;
}
function normalizeAccountServerUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('EasyCraft 계정 서버 주소가 빌드에 설정되어 있지 않습니다. 빌드에 포함된 EasyCraft 계정 서버 주소를 확인해 주세요.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('EasyCraft 계정 서버 주소 형식이 올바르지 않습니다.'); }
  if (!['http:','https:'].includes(url.protocol)) throw new Error('EasyCraft 계정 서버 주소는 http:// 또는 https:// 형식이어야 합니다.');
  return raw;
}
function configuredAccountServerUrl() {
  const fromEnv = String(process.env.EASYCRAFT_ACCOUNT_SERVER_URL || '').trim();
  if (fromEnv) return normalizeAccountServerUrl(fromEnv);
  let bundled = '';
  try { bundled = String(require('./account-server.json')?.baseUrl || '').trim(); } catch {}
  const base = normalizeAccountServerUrl(bundled);
  let parsed = null;
  try { parsed = new URL(base); } catch {}
  const loopback = parsed && ['127.0.0.1', 'localhost', '::1'].includes(String(parsed.hostname || '').toLowerCase());
  if (app.isPackaged && loopback && process.env.EASYCRAFT_ALLOW_LOCAL_ACCOUNT_SERVER !== '1') {
    const err = new Error('이 EasyCraft 빌드에 ngrok 계정 서버 터널 주소가 설정되지 않았습니다. 현재 주소가 로컬 테스트용(127.0.0.1/localhost)입니다.');
    err.scope = 'account-server-config';
    err.serverUrl = base;
    throw err;
  }
  return base;
}
function accountServerDisplayHost() {
  try {
    const u = new URL(configuredAccountServerUrl());
    return u.host;
  } catch { return '미설정'; }
}
function wrapAccountServerError(error, stage='connect') {
  if (error?.scope === 'account-server' || error?.scope === 'account-server-config') return error;
  const raw = String(error?.message || error || '알 수 없는 오류');
  const err = new Error(raw);
  err.scope = 'account-server';
  err.stage = stage;
  err.serverUrl = (() => { try { return configuredAccountServerUrl(); } catch { return ''; } })();
  err.causeText = raw;
  return err;
}
function friendlyAccountServerError(error) {
  const raw = String(error?.message || error || 'EasyCraft 계정 서버 오류');
  if (error?.scope === 'account-server-config' || /로컬 테스트용|계정 서버 주소가.*설정/i.test(raw)) {
    return 'EasyCraft 계정 서버 주소가 빌드에 설정되지 않았습니다. 배포 설정을 확인해 주세요.';
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw)) return `EasyCraft 계정 서버 주소를 찾지 못했습니다 (${accountServerDisplayHost()}). EasyCraft 계정 서버 도메인이 정상인지 확인해 주세요.`;
  if (/ECONNREFUSED|ECONNRESET|fetch failed|network|socket|timeout|timed out|응답 시간 초과/i.test(raw)) return `EasyCraft 계정 서버에 연결하지 못했습니다 (${accountServerDisplayHost()}). Weird Host 서버와 ngrok 터널이 실행 중인지 확인해 주세요.`;
  if (/HTTP 404|Not Found/i.test(raw)) return `EasyCraft 계정 서버 주소가 올바르지 않습니다 (${accountServerDisplayHost()}). /health가 열리는 서버 주소인지 확인해 주세요.`;
  return raw;
}
function hmacBuffer(key, text) {
  return crypto.createHmac('sha256', key).update(String(text), 'utf8').digest();
}
function hmacHex(key, text) {
  return crypto.createHmac('sha256', key).update(String(text), 'utf8').digest('hex');
}
function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}
function sha256HexBuffer(buffer) {
  return sha256Buffer(buffer).toString('hex');
}
function safeHexEqual(a, b) {
  try {
    const aa = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return aa.length > 0 && aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch { return false; }
}
const SRP_N_HEX = [
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050',
  'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50',
  'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8',
  '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773BC',
  'A97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F877485',
  '44523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6A',
  'F874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB69',
  '4B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73'
].join('');
const SRP_N = BigInt(`0x${SRP_N_HEX}`);
const SRP_G = 2n;
const SRP_N_BYTES = 256;
function srpPad(value) {
  let hex = BigInt(value).toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const raw = Buffer.from(hex, 'hex');
  if (raw.length > SRP_N_BYTES) throw new Error('SRP 정수 크기가 올바르지 않습니다.');
  return Buffer.concat([Buffer.alloc(SRP_N_BYTES - raw.length), raw]);
}
function srpHashInt(...buffers) {
  return BigInt(`0x${sha256Buffer(Buffer.concat(buffers)).toString('hex')}`);
}
function modPow(base, exponent, modulus) {
  let b = ((base % modulus) + modulus) % modulus;
  let e = BigInt(exponent);
  let result = 1n;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }
  return result;
}
const SRP_K_MULTIPLIER = srpHashInt(srpPad(SRP_N), srpPad(SRP_G));
function randomSrpPrivate() {
  let value = 0n;
  while (!value) value = BigInt(`0x${crypto.randomBytes(32).toString('hex')}`) % SRP_N;
  return value;
}
function deriveVaultKey(password, vaultSaltB64) {
  const salt = Buffer.from(String(vaultSaltB64 || ''), 'base64');
  if (salt.length < 12) throw new Error('EasyCraft 계정 서버의 보관함 salt가 올바르지 않습니다.');
  return crypto.scryptSync(String(password || ''), salt, 32, { N:16384, r:8, p:1, maxmem:64 * 1024 * 1024 });
}
function srpClientProof(username, password, challengeId, saltB64, bPubHex, aPrivate, aPublic) {
  const salt = Buffer.from(String(saltB64 || ''), 'base64');
  if (salt.length < 12) throw new Error('EasyCraft SRP salt가 올바르지 않습니다.');
  const B = BigInt(`0x${String(bPubHex || '0')}`);
  if (B <= 0n || B >= SRP_N || B % SRP_N === 0n) throw new Error('EasyCraft SRP 서버 공개키가 올바르지 않습니다.');
  const userLower = String(username || '').trim().toLowerCase();
  const inner = sha256Buffer(Buffer.from(`${userLower}:${String(password || '')}`, 'utf8'));
  const x = srpHashInt(salt, inner);
  const u = srpHashInt(srpPad(aPublic), srpPad(B));
  if (u === 0n) throw new Error('EasyCraft SRP scramble 값이 올바르지 않습니다.');
  const gx = modPow(SRP_G, x, SRP_N);
  const base = ((B - (SRP_K_MULTIPLIER * gx)) % SRP_N + SRP_N) % SRP_N;
  if (base === 0n) throw new Error('EasyCraft SRP 계산값이 올바르지 않습니다.');
  const exponent = aPrivate + (u * x);
  const S = modPow(base, exponent, SRP_N);
  const K = sha256Buffer(srpPad(S));
  const m1 = sha256HexBuffer(Buffer.concat([srpPad(aPublic), srpPad(B), K, Buffer.from(String(challengeId), 'utf8')]));
  return { B, K, M1:m1 };
}
function expectedSrpM2(aPublic, m1Hex, sharedKey, finish) {
  const payload = Buffer.concat([
    srpPad(aPublic),
    Buffer.from(String(m1Hex || ''), 'hex'),
    sharedKey,
    Buffer.from(String(finish.sessionId || ''), 'utf8'), Buffer.from('\n'),
    Buffer.from(String(finish.sessionNonce || ''), 'utf8'), Buffer.from('\n'),
    Buffer.from(String(finish.username || '').toLowerCase(), 'utf8'), Buffer.from('\n'),
    Buffer.from(finish.vaultPresent ? '1' : '0'), Buffer.from('\n'),
    Buffer.from(String(finish.minecraft?.name || ''), 'utf8'), Buffer.from('\n'),
    Buffer.from(String(finish.minecraft?.uuid || ''), 'utf8')
  ]);
  return sha256HexBuffer(payload);
}
function deriveSessionKey(sharedKey, sessionId, sessionNonce) {
  return hmacBuffer(sharedKey, `easycraft-session-v2\n${sessionId}\n${sessionNonce}`);
}
function encryptAccountVault(account, vaultKeyB64) {
  const key = Buffer.from(String(vaultKeyB64 || ''), 'base64');
  if (key.length !== 32) throw new Error('EasyCraft 계정 보관함 키가 올바르지 않습니다. 다시 로그인해 주세요.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('EasyCraftVault:v1', 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(account), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v:1, alg:'A256GCM', iv:iv.toString('base64'), tag:tag.toString('base64'), data:ciphertext.toString('base64') };
}
function decryptAccountVault(vault, vaultKeyB64) {
  if (!vault || vault.v !== 1 || vault.alg !== 'A256GCM') throw new Error('서버의 Minecraft 계정 보관함 형식을 지원하지 않습니다.');
  const key = Buffer.from(String(vaultKeyB64 || ''), 'base64');
  if (key.length !== 32) throw new Error('EasyCraft 계정 보관함 키가 올바르지 않습니다.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(vault.iv, 'base64'));
    decipher.setAAD(Buffer.from('EasyCraftVault:v1', 'utf8'));
    decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(vault.data, 'base64')), decipher.final()]);
    const account = JSON.parse(plain.toString('utf8'));
    if (!account?.refresh_token || !account?.uuid || !account?.name) throw new Error('보관함의 Minecraft 계정 정보가 완전하지 않습니다.');
    return account;
  } catch (error) {
    throw new Error(`Minecraft 계정 보관함을 열지 못했습니다. EasyCraft 비밀번호가 연결할 때와 같은지 확인해 주세요. (${error.message})`);
  }
}
async function readLauncherSession() {
  try {
    const parsed = await readSecureJson(launcherSessionPath());
    if (!parsed?.sessionId || !parsed?.sessionKeyB64 || !parsed?.vaultKeyB64) return null;
    return parsed;
  } catch { return null; }
}
async function saveLauncherSession(session) {
  await fsp.mkdir(dataDir(), { recursive:true });
  const safe = {
    sessionId:String(session.sessionId || ''),
    sessionKeyB64:String(session.sessionKeyB64 || ''),
    vaultKeyB64:String(session.vaultKeyB64 || ''),
    username:String(session.username || ''),
    savedAt:Date.now()
  };
  await writeSecureJson(launcherSessionPath(), safe);
  return safe;
}
async function clearLauncherSession() {
  await fsp.rm(launcherSessionPath(), { force:true }).catch(() => {});
}
async function accountServerUnsigned(pathname, { method='GET', body=null, timeoutMs=15000 } = {}) {
  let base;
  try { base = configuredAccountServerUrl(); }
  catch (error) { throw wrapAccountServerError(error, 'config'); }
  const url = `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  const bodyText = body === null ? '' : JSON.stringify(body);
  const headers = { 'Accept':'application/json', 'User-Agent':APP_UA, 'ngrok-skip-browser-warning':'EasyCraft' };
  if (body !== null) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetchWithTimeout(url, { method, headers, body: body === null ? undefined : bodyText }, timeoutMs);
  } catch (error) {
    throw wrapAccountServerError(error, pathname === '/health' ? 'health' : 'request');
  }
  let data = {};
  try { data = JSON.parse(await res.text()); } catch {}
  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || `EasyCraft 계정 서버 오류 (HTTP ${res.status})`);
    err.status = res.status; err.needLogin = !!data?.needLogin || res.status === 401;
    err.scope = 'account-server'; err.stage = 'http'; err.serverUrl = base;
    throw err;
  }
  return data;
}
async function accountServerHealth() {
  const data = await accountServerUnsigned('/health', { timeoutMs:8000 });
  if (data?.service !== 'easycraft-account' || data?.protocol !== 'easycraft-account-v2-srp') {
    const err = new Error('연결된 서버가 EasyCraft Account Server beta.11 계열이 아닙니다.');
    err.scope = 'account-server'; err.stage = 'health';
    throw err;
  }
  return data;
}
function signedRequestCanonical(method, pathname, timestamp, nonce, bodyBuffer) {
  return [String(method).toUpperCase(), pathname, String(timestamp), nonce, sha256HexBuffer(bodyBuffer)].join('\n');
}
function signedResponseCanonical(status, requestNonce, bodyBuffer) {
  return ['response-v1', String(status), requestNonce, sha256HexBuffer(bodyBuffer)].join('\n');
}
async function accountServerSigned(pathname, { method='GET', body=null, session=null, timeoutMs=18000 } = {}) {
  const saved = session || await readLauncherSession();
  if (!saved?.sessionId || !saved?.sessionKeyB64) {
    const err = new Error('EasyCraft 계정 로그인이 필요합니다.'); err.needLogin = true; err.status = 401; throw err;
  }
  const sessionKey = Buffer.from(saved.sessionKeyB64, 'base64');
  if (sessionKey.length !== 32) throw new Error('저장된 EasyCraft 세션 키가 올바르지 않습니다. 다시 로그인해 주세요.');
  const base = configuredAccountServerUrl();
  const pathWithQuery = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = `${base}${pathWithQuery}`;
  const bodyText = body === null ? '' : JSON.stringify(body);
  const bodyBuffer = Buffer.from(bodyText, 'utf8');
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(18).toString('base64url');
  const signature = hmacHex(sessionKey, signedRequestCanonical(method, pathWithQuery, timestamp, nonce, bodyBuffer));
  const headers = {
    'Accept':'application/json', 'User-Agent':APP_UA, 'ngrok-skip-browser-warning':'EasyCraft',
    'X-EC-Session':saved.sessionId, 'X-EC-Time':String(timestamp), 'X-EC-Nonce':nonce, 'X-EC-Signature':signature
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetchWithTimeout(url, { method, headers, body: body === null ? undefined : bodyText }, timeoutMs);
  } catch (error) {
    throw wrapAccountServerError(error, 'signed-request');
  }
  const responseText = await res.text();
  const responseBuffer = Buffer.from(responseText, 'utf8');
  const responseSig = String(res.headers.get('x-ec-response-signature') || '').toLowerCase();
  if (res.ok) {
    const expected = hmacHex(sessionKey, signedResponseCanonical(res.status, nonce, responseBuffer));
    if (!safeHexEqual(expected, responseSig)) throw new Error('EasyCraft 계정 서버 응답 서명을 확인하지 못했습니다.');
  }
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; } catch {}
  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || `EasyCraft 계정 서버 오류 (HTTP ${res.status})`);
    err.status = res.status; err.needLogin = !!data?.needLogin || res.status === 401;
    err.scope = 'account-server'; err.stage = 'signed-http'; err.serverUrl = base;
    throw err;
  }
  return data;
}
async function accountServerLogin(username, password) {
  const cleanUser = String(username || '').trim();
  const secret = String(password || '');
  if (!cleanUser || !secret) throw new Error('EasyCraft 계정 ID와 비밀번호를 입력해 주세요.');
  await accountServerHealth();
  const a = randomSrpPrivate();
  const A = modPow(SRP_G, a, SRP_N);
  const start = await accountServerUnsigned('/api/auth/srp/start', {
    method:'POST', body:{ username:cleanUser, A:A.toString(16) }, timeoutMs:12000
  });
  const proof = srpClientProof(cleanUser, secret, start.challengeId, start.salt, start.B, a, A);
  const finish = await accountServerUnsigned('/api/auth/srp/finish', {
    method:'POST', body:{ username:cleanUser, challengeId:start.challengeId, M1:proof.M1 }, timeoutMs:12000
  });
  const expectedM2 = expectedSrpM2(A, proof.M1, proof.K, finish);
  if (!safeHexEqual(expectedM2, finish.M2)) throw new Error('EasyCraft 계정 서버의 SRP 로그인 응답을 확인하지 못했습니다.');
  const sessionKey = deriveSessionKey(proof.K, finish.sessionId, finish.sessionNonce);
  const vaultKey = deriveVaultKey(secret, start.vaultSalt);
  const session = await saveLauncherSession({
    sessionId:finish.sessionId,
    sessionKeyB64:sessionKey.toString('base64'),
    vaultKeyB64:vaultKey.toString('base64'),
    username:finish.username || cleanUser
  });
  return { session, vaultPresent:!!finish.vaultPresent, minecraft:finish.minecraft || null };
}
async function uploadAccountVault(account, session=null) {
  const saved = session || await readLauncherSession();
  if (!saved?.vaultKeyB64) throw new Error('EasyCraft 계정 로그인이 필요합니다.');
  const vault = encryptAccountVault(account, saved.vaultKeyB64);
  return accountServerSigned('/api/vault', {
    method:'PUT', session:saved,
    body:{ vault, mcName:String(account?.name || ''), mcUuid:String(account?.uuid || '') },
    timeoutMs:18000
  });
}
async function refreshAccountFromVault(session=null) {
  const saved = session || await readLauncherSession();
  if (!saved?.sessionId || !saved?.vaultKeyB64) throw new Error('EasyCraft 계정 로그인이 필요합니다.');
  const data = await accountServerSigned('/api/vault', { session:saved, timeoutMs:18000 });
  if (!data?.vault) {
    const err = new Error('이 EasyCraft 계정에 Minecraft 계정이 아직 연결되지 않았습니다.');
    err.needLink = true; throw err;
  }
  const stored = decryptAccountVault(data.vault, saved.vaultKeyB64);
  let refreshed;
  try {
    refreshed = await promiseWithTimeout(new Microsoft().refresh(stored), 45000, 'Microsoft 로그인 갱신 시간이 초과되었습니다.');
    if (!refreshed || refreshed.error) throw new Error(refreshed?.error || 'Microsoft 인증 갱신 실패');
  } catch (error) {
    // A just-linked vault may still contain a currently valid Minecraft token. Keep it usable for a short period.
    const linkedAt = Number(stored._easycraftRefreshedAt || 0);
    if (stored.access_token && linkedAt && Date.now() - linkedAt < 45 * 60 * 1000) {
      refreshed = stored;
      refreshed._easycraftRefreshWarning = friendlyMicrosoftAuthError(error);
    } else {
      const refreshError = new Error(friendlyMicrosoftAuthError(error));
      refreshError.needRelink = true;
      refreshError.authStage = 'microsoft-refresh';
      refreshError.technical = String(error?.error || error?.message || error || 'unknown');
      throw refreshError;
    }
  }
  refreshed._easycraftAuthFlow = 'account-vault-v2';
  refreshed._easycraftLauncherUsername = saved.username || null;
  refreshed._easycraftRefreshedAt = Date.now();
  refreshed._easycraftOfflineCached = false;
  await uploadAccountVault(refreshed, saved).catch(() => {});
  return refreshed;
}
async function launcherAccountLogin(username, password) {
  const login = await accountServerLogin(username, password);
  if (!login.vaultPresent) return { session:login.session, needLink:true, username:login.session.username };
  try {
    const account = await refreshAccountFromVault(login.session);
    const summary = await persistMicrosoftAccount(account);
    return { session:login.session, needLink:false, needRelink:false, username:login.session.username, account:summary };
  } catch (error) {
    // EasyCraft 계정 로그인 자체는 성공했습니다. 저장된 Microsoft refresh token만
    // 갱신하지 못한 경우 로그인 세션을 버리지 않고, 인증 가능한 PC에서 재연결할 수 있게 합니다.
    if (error?.needRelink) {
      return {
        session: login.session,
        needLink: false,
        needRelink: true,
        username: login.session.username,
        error: friendlyMicrosoftAuthError(error),
        technical: String(error?.technical || '')
      };
    }
    throw error;
  }
}
async function startMinecraftAccountLink() {
  const session = await readLauncherSession();
  if (!session?.sessionId || !session?.vaultKeyB64) throw new Error('먼저 EasyCraft 계정으로 로그인해 주세요.');
  // v0.4.12 / beta.10과 같은 minecraft-java-core 내장 Microsoft Device Code 인증입니다.
  // Microsoft Application ID, Client Secret, OAuth callback server를 사용자가 설정하지 않습니다.
  const account = await new Microsoft().getAuth();
  if (!account || account.error || !account.refresh_token) throw new Error(friendlyMicrosoftAuthError(account || 'Microsoft 로그인 정보를 받지 못했습니다.'));
  account._easycraftAuthFlow = 'account-vault-v2';
  account._easycraftLauncherUsername = session.username || null;
  account._easycraftRefreshedAt = Date.now();
  account._easycraftOfflineCached = false;
  await uploadAccountVault(account, session);
  const summary = await persistMicrosoftAccount(account);
  return { ok:true, account:summary };
}
async function startDirectMicrosoftLogin() {
  // v0.4.16 비로그인 모드: EasyCraft 계정 서버 없이 Microsoft/Minecraft만 직접 인증합니다.
  const account = await new Microsoft().getAuth();
  if (!account || account.error || !account.refresh_token) {
    throw new Error(friendlyMicrosoftAuthError(account || 'Microsoft 로그인 정보를 받지 못했습니다.'));
  }
  // 기존 EasyCraft 계정 세션이 있으면 서버 로그아웃을 best-effort로 요청한 뒤 로컬 세션을 비웁니다.
  const previousSession = await readLauncherSession();
  if (previousSession?.sessionId) {
    await accountServerSigned('/api/logout', { method:'POST', body:{}, session:previousSession, timeoutMs:8000 }).catch(() => {});
  }
  await clearLauncherSession().catch(() => {});
  account._easycraftAuthFlow = 'direct-microsoft-v1';
  account._easycraftLauncherUsername = null;
  account._easycraftRefreshedAt = Date.now();
  account._easycraftOfflineCached = false;
  const summary = await persistMicrosoftAccount(account);
  return { ok:true, account:summary };
}
async function logoutLauncherAccount() {
  const session = await readLauncherSession();
  if (session?.sessionId) {
    await accountServerSigned('/api/logout', { method:'POST', body:{}, session, timeoutMs:8000 }).catch(() => {});
  }
  await clearLauncherSession();
  currentAccount = null;
  preparedLaunchers.clear();
  await fsp.rm(accountPath(), { force:true }).catch(() => {});
  send('account-changed', null);
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
    fsp.mkdir(path.join(root, 'modpacks'), { recursive: true }),
    fsp.mkdir(path.join(root, 'saves'), { recursive: true }),
    fsp.mkdir(logsDir(id), { recursive: true })
  ]);
}

async function cleanupOldLogs(config = null) {
  try {
    const cfg = config || await readConfig();
    if (cfg.launcherSettings?.autoDeleteLogs === false) return { deleted: 0 };
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const inst of cfg.instances || []) {
      const dir = logsDir(inst.id);
      const files = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
      const logs = [];
      for (const entry of files) {
        if (!entry.isFile() || !entry.name.endsWith('.log')) continue;
        const full = path.join(dir, entry.name);
        const st = await fsp.stat(full).catch(() => null);
        if (st) logs.push({ full, mtime: st.mtimeMs });
      }
      logs.sort((a, b) => b.mtime - a.mtime);
      for (let i = 0; i < logs.length; i++) {
        if (logs[i].mtime < cutoff || i >= 10) {
          await fsp.rm(logs[i].full, { force: true }).catch(() => {});
          deleted++;
        }
      }
    }
    return { deleted };
  } catch { return { deleted: 0 }; }
}

async function readInstanceLogLines(id, maxLines = 1800) {
  const dir = logsDir(id);
  const files = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const rows = [];
  for (const entry of files) {
    if (!entry.isFile() || !entry.name.endsWith('.log')) continue;
    const full = path.join(dir, entry.name);
    const st = await fsp.stat(full).catch(() => null);
    if (st) rows.push({ full, mtime: st.mtimeMs });
  }
  rows.sort((a, b) => a.mtime - b.mtime);
  let lines = [];
  for (const item of rows.slice(-4)) {
    const text = await fsp.readFile(item.full, 'utf8').catch(() => '');
    if (text) lines.push(...text.split(/\r?\n/).filter(Boolean));
  }
  return lines.slice(-Math.max(100, Math.min(5000, Number(maxLines) || 1800)));
}

// ---------- 실제 Minecraft 인게임 HUD ----------
// Electron 투명창을 Minecraft 위에 얹는 방식은 사용하지 않는다.
// Fabric 인스턴스에서는 client-side CustomHud를 EasyCraft 런타임 구성요소로 준비하고,
// CustomHud의 BottomLeft 섹션에 EasyCraft 실행 표시를 추가한다.
function hudRuntimeManifestPath(id) { return path.join(instanceDir(id), 'easycraft-hud-runtime.json'); }
async function readHudRuntimeManifest(id) {
  try {
    const parsed = JSON.parse(await fsp.readFile(hudRuntimeManifestPath(id), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { files: [] };
  } catch { return { files: [] }; }
}
async function writeHudRuntimeManifest(id, data) {
  await fsp.mkdir(instanceDir(id), { recursive: true });
  await fsp.writeFile(hudRuntimeManifestPath(id), JSON.stringify(data, null, 2), 'utf8');
}
function hudRuntimeFileNames(manifest) {
  return new Set((manifest?.files || []).flatMap(item => item?.fileName ? [item.fileName, `${item.fileName}.disabled`] : []));
}
async function cleanupInternalHudRuntime(id) {
  const manifest = await readHudRuntimeManifest(id);
  const mods = path.join(gameDir(id), 'mods');
  for (const item of manifest.files || []) {
    if (!item?.fileName) continue;
    await fsp.rm(path.join(mods, path.basename(item.fileName)), { force: true }).catch(() => {});
    await fsp.rm(path.join(mods, `${path.basename(item.fileName)}.disabled`), { force: true }).catch(() => {});
  }
  await writeHudRuntimeManifest(id, { loader: null, minecraftVersion: null, files: [], updatedAt: new Date().toISOString() });
}
function easyCraftHudBlock() {
  return [
    '# >>> EASYCRAFT_LAUNCHER_HUD >>>',
    '==Section:BottomLeft,6,6,false==',
    '&aEasyCraft으로 실행됨',
    '# <<< EASYCRAFT_LAUNCHER_HUD <<<'
  ].join('\n');
}
async function patchCustomHudProfile(id) {
  const dir = path.join(gameDir(id), 'config', 'custom-hud');
  await fsp.mkdir(dir, { recursive: true });
  for (const index of [1, 2, 3]) {
    const profile = path.join(dir, `profile${index}.txt`);
    let text = '';
    try { text = await fsp.readFile(profile, 'utf8'); } catch {}
    text = text.replace(/(?:^|\r?\n)# >>> EASYCRAFT_LAUNCHER_HUD >>>[\s\S]*?# <<< EASYCRAFT_LAUNCHER_HUD <<<(?:\r?\n|$)/g, '\n').trimEnd();
    if (text) text += '\n\n';
    text += `${easyCraftHudBlock()}\n`;
    await fsp.writeFile(profile, text, 'utf8');
  }
}
function normalizedModToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
async function activeManagedProjectRecord(id, projectId) {
  const registry = await readRegistry(id);
  const rec = registry.find(x => x.projectId === projectId || x.slug === projectId);
  if (!rec || rec.disabled) return null;
  const base = path.join(gameDir(id), rec.folder || 'mods', rec.fileName || '');
  try { await fsp.access(base); return rec; } catch { return null; }
}
async function physicalModLooksPresent(id, project, expectedFileName = '') {
  const mods = path.join(gameDir(id), 'mods');
  await fsp.mkdir(mods, { recursive: true });
  const names = await fsp.readdir(mods).catch(() => []);
  if (expectedFileName && names.includes(expectedFileName)) return true;
  const tokens = [project?.slug, project?.title].map(normalizedModToken).filter(x => x.length >= 5);
  if (!tokens.length) return false;
  return names.some(name => {
    if (name.endsWith('.disabled')) return false;
    const n = normalizedModToken(name);
    return tokens.some(token => n.includes(token));
  });
}
async function hudCompatibleFabricVersions(mcVersion, projectId) {
  const params = new URLSearchParams({
    include_changelog: 'false',
    game_versions: JSON.stringify([mcVersion]),
    loaders: JSON.stringify(['fabric'])
  });
  const versions = await fetchJson(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version?${params}`);
  return (versions || []).filter(v => v.status === 'listed' || !v.status).sort((a, b) => {
    const rank = { release: 0, beta: 1, alpha: 2 };
    const r = (rank[a.version_type] ?? 9) - (rank[b.version_type] ?? 9);
    if (r !== 0) return r;
    return new Date(b.date_published) - new Date(a.date_published);
  });
}
async function collectHudRuntimePlan(instance, projectId, seen = new Set(), plan = []) {
  if (!projectId || seen.has(projectId)) return plan;
  seen.add(projectId);
  const project = await getProject(projectId);
  const versions = await hudCompatibleFabricVersions(instance.version, project.id || projectId);
  const version = versions[0];
  if (!version) throw new Error(`${project.title || project.slug || projectId}의 Minecraft ${instance.version}용 Fabric 버전을 찾을 수 없습니다.`);
  for (const dep of version.dependencies || []) {
    if (dep.dependency_type !== 'required') continue;
    let depProjectId = dep.project_id || null;
    if (!depProjectId && dep.version_id) {
      try { depProjectId = (await getVersion(dep.version_id))?.project_id || null; } catch {}
    }
    if (depProjectId) await collectHudRuntimePlan(instance, depProjectId, seen, plan);
  }
  const file = chooseFile(version);
  if (!file?.url || !file?.filename) throw new Error(`${project.title || project.slug || projectId} 다운로드 파일을 찾을 수 없습니다.`);
  plan.push({ project, version, file });
  return plan;
}

async function collectCompatibleEasyCraftHudPlan(instance) {
  // CustomHud 본판은 많은 Fabric 버전을 지원하지만, 최신 Minecraft에서는
  // 별도 포트 프로젝트가 먼저 대응되는 경우가 있다. 사용자가 버전을 바꿔도
  // EasyCraft HUD 때문에 실행이 깨지지 않도록 호환 프로젝트를 순서대로 찾는다.
  const candidates = ['customhud', 'customhud-ported'];
  const errors = [];
  for (const projectId of candidates) {
    try {
      return await collectHudRuntimePlan(instance, projectId, new Set(), []);
    } catch (error) {
      errors.push(`${projectId}: ${error?.message || error}`);
    }
  }
  throw new Error(`Minecraft ${instance.version}용 EasyCraft Fabric HUD 구성요소를 찾지 못했습니다. ${errors.join(' / ')}`);
}
async function ensureMinecraftInGameHud(id, instance) {
  // 현재 검증 가능한 True in-game HUD 경로는 Fabric용 CustomHud이다.
  // Vanilla/Forge/NeoForge에서는 외부 오버레이로 속이지 않고 HUD 런타임만 정리한다.
  if (instance.loader !== 'fabric') {
    await cleanupInternalHudRuntime(id);
    return { enabled: false, reason: 'unsupported-loader' };
  }
  await ensureInstanceFolders(id);
  const oldManifest = await readHudRuntimeManifest(id);
  // 이미 같은 Minecraft 버전에 맞는 EasyCraft HUD 런타임이 준비되어 있으면
  // Modrinth 메타데이터를 다시 조회하지 않고 바로 재사용해 Fabric 실행을 빠르게 합니다.
  if (oldManifest?.ready === true && oldManifest.loader === 'fabric' && oldManifest.minecraftVersion === instance.version) {
    const modsDir = path.join(gameDir(id), 'mods');
    const runtimeFiles = Array.isArray(oldManifest.files) ? oldManifest.files : [];
    const present = await Promise.all(runtimeFiles.map(async item => {
      if (!item?.fileName) return false;
      try { await fsp.access(path.join(modsDir, path.basename(item.fileName))); return true; } catch { return false; }
    }));
    if (!runtimeFiles.length || present.every(Boolean)) {
      await patchCustomHudProfile(id);
      return { enabled: true, provider: 'EasyCraft HUD Runtime', cached: true };
    }
  }
  const plan = await collectCompatibleEasyCraftHudPlan(instance);
  const newFiles = [];
  const modsDir = path.join(gameDir(id), 'mods');
  const keepNames = new Set();

  for (const item of plan) {
    const projectId = item.project.id;
    const ext = path.extname(item.file.filename) || '.jar';
    const slug = safeId(item.project.slug || projectId) || 'runtime-mod';
    const runtimeName = `easycraft-runtime-${slug}-${safeId(item.version.id)}${ext}`;
    const oldRuntime = (oldManifest.files || []).find(x => x.projectId === projectId && x.versionId === item.version.id && x.fileName);
    if (oldRuntime) {
      const oldPath = path.join(modsDir, path.basename(oldRuntime.fileName));
      try {
        await fsp.access(oldPath);
        keepNames.add(oldRuntime.fileName);
        newFiles.push(oldRuntime);
        continue;
      } catch {}
    }
    const managed = await activeManagedProjectRecord(id, projectId);
    const manuallyPresent = await physicalModLooksPresent(id, item.project, item.file.filename);
    if (managed || manuallyPresent) continue;
    keepNames.add(runtimeName);
    const destination = path.join(modsDir, runtimeName);
    let exists = false;
    try { await fsp.access(destination); exists = true; } catch {}
    if (!exists) await downloadFile(item.file.url, destination, item.file.hashes || {});
    newFiles.push({
      projectId,
      slug: item.project.slug || null,
      versionId: item.version.id,
      versionNumber: item.version.version_number || null,
      fileName: runtimeName
    });
  }

  // EasyCraft가 이전에 넣은 런타임 jar 중 현재 버전에 더 이상 쓰지 않는 것만 제거한다.
  for (const old of oldManifest.files || []) {
    if (!old?.fileName || keepNames.has(old.fileName)) continue;
    await fsp.rm(path.join(modsDir, path.basename(old.fileName)), { force: true }).catch(() => {});
    await fsp.rm(path.join(modsDir, `${path.basename(old.fileName)}.disabled`), { force: true }).catch(() => {});
  }
  await writeHudRuntimeManifest(id, {
    loader: 'fabric', minecraftVersion: instance.version, provider: 'EasyCraft HUD Runtime', ready: true,
    files: newFiles, updatedAt: new Date().toISOString()
  });
  await patchCustomHudProfile(id);
  return { enabled: true, provider: 'EasyCraft HUD Runtime' };
}
async function invalidateLoaderInstall(id) {
  // Minecraft 버전/로더 종류/로더 빌드가 바뀌면 이전 설치 결과를 재사용하지 않는다.
  await fsp.rm(path.join(gameDir(id), 'loader'), { recursive:true, force:true }).catch(() => {});
}

const LEGAL_DOCUMENTS = Object.freeze({
  terms: 'TERMS_OF_SERVICE.txt',
  privacy: 'PRIVACY_POLICY.txt',
  thirdParty: 'THIRD_PARTY_NOTICE.txt',
  accountDeletion: 'ACCOUNT_DELETION.txt'
});
async function readLegalDocument(kind) {
  const name = LEGAL_DOCUMENTS[String(kind || '')];
  if (!name) throw new Error('지원하지 않는 법적 문서입니다.');
  return fsp.readFile(path.join(__dirname, 'legal', name), 'utf8');
}
ipcMain.handle('read-legal-document', async (_event, kind) => {
  try { return { ok:true, text:await readLegalDocument(kind) }; }
  catch (error) { return { ok:false, error:error.message }; }
});

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
ipcMain.handle('get-instance-logs', async (_event, id, maxLines = 1800) => {
  try {
    const { instance } = await getInstance(id);
    if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    return { ok: true, instanceId: id, lines: await readInstanceLogLines(id, maxLines) };
  } catch (error) { return { ok: false, lines: [], error: error.message }; }
});
ipcMain.handle('clear-instance-logs', async (_event, id) => {
  try {
    const { instance } = await getInstance(id);
    if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    await fsp.rm(logsDir(id), { recursive: true, force: true });
    await fsp.mkdir(logsDir(id), { recursive: true });
    return { ok: true };
  } catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('update-launcher-settings', async (_event, patch = {}) => {
  try {
    const config = await readConfig();
    const nextPatch = { ...(patch || {}) };
    config.launcherSettings = { ...defaultConfig().launcherSettings, ...(config.launcherSettings || {}), ...nextPatch };
    await writeConfig(config);
    if (config.launcherSettings.autoDeleteLogs !== false) await cleanupOldLogs(config);
    return { ok: true, config };
  } catch (error) { return { ok: false, error: error.message }; }
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
let activeLauncherAccountLogin = null;
ipcMain.handle('login-launcher-account', async (_event, username, password) => {
  if (activeLauncherAccountLogin) return activeLauncherAccountLogin;
  activeLauncherAccountLogin = (async () => {
    try {
      send('status', { text: 'EasyCraft 계정에 로그인하고 있습니다…', kind: 'info' });
      const result = await launcherAccountLogin(username, password);
      if (result.needLink) {
        send('status', { text: 'EasyCraft 로그인 완료 · Microsoft 로그인이 가능한 PC에서 Minecraft 계정을 한 번 연결해 주세요.', kind: 'info' });
        return { ok:true, needLink:true, needRelink:false, username:result.username };
      }
      if (result.needRelink) {
        send('status', { text: `EasyCraft 로그인 완료 · 저장된 Minecraft 인증을 갱신하지 못했습니다. 이 PC에서 다시 연결할 수 있습니다.`, kind: 'warning' });
        return { ok:true, needLink:false, needRelink:true, username:result.username, error:result.error, technical:result.technical || '' };
      }
      send('status', { text: `${result.account?.name || 'Minecraft 계정'} 동기화 완료`, kind: 'success' });
      return { ok:true, needLink:false, needRelink:false, account:result.account, username:result.username };
    } catch (error) {
      const isAccountServerError = error?.scope === 'account-server' || error?.scope === 'account-server-config';
      const message = isAccountServerError ? friendlyAccountServerError(error) : friendlyMicrosoftAuthError(error);
      const prefix = isAccountServerError ? 'EasyCraft 계정 서버 연결 실패' : '로그인 실패';
      send('status', { text: `${prefix}: ${message}`, kind: 'error' });
      return { ok:false, error:message, errorType:isAccountServerError ? 'account-server' : 'microsoft', technical:String(error?.causeText || error?.technical || error?.message || '') };
    } finally {
      activeLauncherAccountLogin = null;
    }
  })();
  return activeLauncherAccountLogin;
});
ipcMain.handle('link-minecraft-account', async () => {
  try {
    send('status', { text: 'Microsoft 로그인이 허용된 PC에서 Minecraft 계정을 연결하고 있습니다…', kind:'info' });
    const result = await startMinecraftAccountLink();
    send('status', { text: `${result.account?.name || 'Minecraft 계정'} 연결 완료`, kind:'success' });
    return result;
  } catch (error) {
    const message = friendlyMicrosoftAuthError(error);
    send('status', { text:`Minecraft 계정 연결 실패: ${message}`, kind:'error' });
    return { ok:false, error:message };
  }
});
ipcMain.handle('login-direct-microsoft', async () => {
  try {
    send('status', { text:'Microsoft Minecraft 계정으로 로그인하고 있습니다…', kind:'info' });
    const result = await startDirectMicrosoftLogin();
    send('status', { text:`${result.account?.name || 'Minecraft 계정'} 로그인 완료`, kind:'success' });
    return result;
  } catch (error) {
    const message = friendlyMicrosoftAuthError(error);
    send('status', { text:`Microsoft 로그인 실패: ${message}`, kind:'error' });
    return { ok:false, error:message };
  }
});
ipcMain.handle('logout', async () => {
  await logoutLauncherAccount();
  return { ok:true };
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
  preparedLaunchers.delete(id);
  await fsp.rm(instanceDir(id), { recursive: true, force: true });
  await fsp.rm(launchReadyMarker(id), { force: true }).catch(() => {});
  const freshConfig = await readConfig();
  return { ok: true, config: freshConfig, deletedId: id };
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
  const filters = type === 'mods' ? [{ name: 'Minecraft Mods', extensions: ['jar'] }] : type === 'modpacks' ? [{ name: 'Modrinth Modpacks', extensions: ['mrpack'] }] : [{ name: 'ZIP files', extensions: ['zip'] }];
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
  const internalHudFiles = type === 'mods' ? hudRuntimeFileNames(await readHudRuntimeManifest(id)) : new Set();
  const names = await fsp.readdir(folder);
  const items = names.filter(name => {
    if (internalHudFiles.has(name)) return false;
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
      internalSystem: false,
      iconUrl: managed?.iconUrl || null,
      projectType: managed?.projectType || meta.projectType,
      slug: managed?.slug || null,
      description: managed?.description || null
    };
  });
  if (type === 'mods') {
    const { instance } = await getInstance(id);
    if (instance?.loader === 'fabric') {
      const hudManifest = await readHudRuntimeManifest(id);
      items.unshift({
        name: '__easycraft_hud__', displayName: 'EasyCraft HUD', enabled: true, managed: false,
        projectId: null, title: 'EasyCraft HUD', versionNumber: app.getVersion(), autoDependency: false,
        internalSystem: true, iconUrl: null, projectType: 'mod', slug: 'easycraft-hud',
        description: hudManifest?.ready === true
          ? 'EasyCraft으로 실행됨 문구를 표시하는 Fabric 전용 시스템 HUD입니다.'
          : 'Fabric 실행 시 자동으로 준비되는 EasyCraft 시스템 HUD입니다.'
      });
    }
  }
  return items.sort((a, b) => {
    if (a.internalSystem && !b.internalSystem) return -1;
    if (!a.internalSystem && b.internalSystem) return 1;
    return (a.title || a.displayName).localeCompare(b.title || b.displayName);
  });
});
ipcMain.handle('toggle-content', async (_event, id, type, name) => {
  if (type === 'mods' && String(name || '') === '__easycraft_hud__') return { ok: false, error: 'EasyCraft HUD는 런처가 자동으로 관리하는 시스템 모드입니다.' };
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
  if (record.projectType === 'modpack' && Array.isArray(record.packFiles)) {
    const root = path.resolve(gameDir(id));
    for (const rel of record.packFiles) {
      try {
        const target = path.resolve(root, String(rel || ''));
        if (target !== root && target.startsWith(root + path.sep)) await fsp.rm(target, { force: true, recursive: false }).catch(() => {});
      } catch {}
    }
  }
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
async function deleteContentEntry(id, type, name) {
  if (type === 'mods' && String(name || '') === '__easycraft_hud__') return { ok: false, error: 'EasyCraft HUD는 삭제할 수 없는 시스템 모드입니다.' };
  const folder = targetFolder(id, type); const safe = path.basename(name);
  const registry = await readRegistry(id);
  const raw = safe.endsWith('.disabled') ? safe.slice(0, -9) : safe;
  const managed = registry.find(x => x.folder === validateContentType(type).folder && x.fileName === raw);
  if (managed) return uninstallManagedProject(id, managed.projectId);
  await fsp.rm(path.join(folder, safe), { force: true });
  return { ok: true };
}
ipcMain.handle('delete-content', async (_event, id, type, name) => deleteContentEntry(id, type, name));
ipcMain.handle('delete-content-batch', async (_event, id, type, names) => {
  try {
    validateContentType(type);
    const unique = [...new Set((Array.isArray(names) ? names : []).map(x => path.basename(String(x || ''))).filter(Boolean))];
    let count = 0, retained = 0;
    for (const name of unique) {
      const result = await deleteContentEntry(id, type, name);
      if (!result?.ok) throw new Error(result?.error || `${name} 삭제 실패`);
      count++;
      if (result.retainedAsDependency) retained++;
    }
    return { ok: true, count, retained };
  } catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('delete-all-content', async (_event, id, type) => {
  try {
    const folder = targetFolder(id, type); await fsp.mkdir(folder, { recursive: true });
    const meta = validateContentType(type);
    const internalHudFiles = type === 'mods' ? hudRuntimeFileNames(await readHudRuntimeManifest(id)) : new Set();
    const names = (await fsp.readdir(folder)).filter(name => {
      if (internalHudFiles.has(name)) return false;
      const raw = name.endsWith('.disabled') ? name.slice(0, -9) : name;
      return meta.extensions.includes(path.extname(raw).toLowerCase());
    });
    let count = 0;
    // 사용자 설치 루트를 먼저 제거하면 공유 의존성 관계가 안전하게 정리된다.
    const registry = await readRegistry(id);
    const roots = registry.filter(x => x.folder === meta.folder && !x.autoDependency);
    const originallyManagedFiles = new Set(registry.filter(x => x.folder === meta.folder).flatMap(x => [x.fileName, `${x.fileName}.disabled`]));
    const directNames = names.filter(name => !originallyManagedFiles.has(name));
    for (const rec of roots) {
      const result = await uninstallManagedProject(id, rec.projectId);
      if (result?.ok) count++;
    }
    for (const name of directNames) {
      await fsp.rm(path.join(folder, path.basename(name)), { force: true });
      count++;
    }
    // 부모가 모두 사라진 자동 의존성은 마지막으로 정리한다.
    let cleaned = await cleanupOrphanDependencies(id, await readRegistry(id));
    await writeRegistry(id, cleaned);
    return { ok: true, count };
  } catch (error) { return { ok: false, error: error.message }; }
});
async function openFolderReliable(folder) {
  const resolved = path.resolve(folder);
  await fsp.mkdir(resolved, { recursive: true });

  // Windows에서는 explorer.exe를 직접 실행하는 방식을 우선 사용한다.
  // 일부 Electron/Windows 조합에서 shell.openPath가 성공 문자열을 반환해도
  // 실제 탐색기 창이 나타나지 않는 문제를 피하기 위한 처리다.
  if (process.platform === 'win32') {
    try {
      const child = spawn(process.env.WINDIR ? path.join(process.env.WINDIR, 'explorer.exe') : 'explorer.exe', [resolved], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.unref();
      return { ok: true, path: resolved };
    } catch {}
  }

  try {
    const error = await shell.openPath(resolved);
    return { ok: !error, path: resolved, error: error || '' };
  } catch (error) {
    return { ok: false, path: resolved, error: error.message || '폴더를 열지 못했습니다.' };
  }
}

ipcMain.handle('open-content-folder', async (_event, id, type) => {
  try {
    return await openFolderReliable(targetFolder(id, type));
  } catch (error) {
    return { ok: false, error: error.message || '콘텐츠 폴더를 열지 못했습니다.' };
  }
});
ipcMain.handle('open-instance-folder', async (_event, id) => {
  try {
    const { instance } = await getInstance(id);
    if (!instance) return { ok: false, error: '인스턴스를 찾을 수 없습니다.' };
    await ensureInstanceFolders(id);
    return await openFolderReliable(gameDir(id));
  } catch (error) {
    return { ok: false, error: error.message || '인스턴스 폴더를 열지 못했습니다.' };
  }
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
ipcMain.handle('modrinth-search', async (_event, id, type, query, offset = 0, limit = 30) => {
  try {
    const { instance } = await getInstance(id);
    if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    const meta = validateContentType(type);
    if (meta.projectType === 'mod' && instance.loader === 'vanilla') {
      return { ok: false, error: 'Vanilla 인스턴스에는 모드를 설치할 수 없습니다. Fabric/Forge/NeoForge/Quilt 인스턴스를 만들어 주세요.' };
    }
    const cleanQuery = String(query || '').trim();
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const safeOffset = Math.max(0, Number(offset) || 0);
    const params = new URLSearchParams({
      query: cleanQuery,
      facets: JSON.stringify(modrinthFacets(instance, type)),
      index: cleanQuery ? 'relevance' : 'downloads',
      limit: String(safeLimit),
      offset: String(safeOffset)
    });
    const data = await fetchJson(`${MODRINTH_API}/search?${params}`);
    const registry = await readRegistry(id);
    const installed = new Set();
    for (const rec of registry) if (await recordFileExists(id, rec)) installed.add(rec.projectId);
    return {
      ok: true,
      offset: Number(data.offset ?? safeOffset),
      limit: Number(data.limit ?? safeLimit),
      totalHits: Number(data.total_hits ?? 0),
      results: (data.hits || []).map(h => ({
        projectId: h.project_id, title: h.title, description: h.description, author: h.author,
        iconUrl: h.icon_url, downloads: h.downloads, projectType: h.project_type,
        categories: h.display_categories || h.categories || [], installed: installed.has(h.project_id)
      }))
    };
  } catch (error) { return { ok: false, error: error.message }; }
});


ipcMain.handle('modrinth-project-detail', async (_event, id, projectId) => {
  try {
    const { instance } = await getInstance(id);
    if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    const project = await getProject(projectId);
    const registry = await readRegistry(id);
    const rec = registry.find(x => x.projectId === projectId) || null;
    const installed = !!rec && await recordFileExists(id, rec);
    let latest = null;
    try { latest = (await compatibleVersions(instance, projectId, project.project_type))[0] || null; } catch {}
    return { ok: true, detail: {
      projectId: project.id, slug: project.slug, title: project.title, description: project.description || '',
      iconUrl: project.icon_url || null, projectType: project.project_type, downloads: project.downloads || 0,
      followers: project.followers || 0, categories: project.categories || [],
      license: project.license?.name || project.license?.id || '', clientSide: project.client_side || '', serverSide: project.server_side || '',
      installed, currentVersion: rec?.versionNumber || null, latestVersion: latest?.version_number || null,
      updateAvailable: !!(installed && latest && rec?.versionId && latest.id !== rec.versionId),
      autoDependency: !!rec?.autoDependency
    }};
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
  if (projectType === 'modpack') return 'modpacks';
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

function safePackRelativePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || path.posix.isAbsolute(normalized)) throw new Error(`안전하지 않은 모드팩 경로: ${value}`);
  return normalized.split('/').join(path.sep);
}
async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}
async function applyModpackArchive(id, instance, archivePath, projectTitle) {
  const zip = new AdmZip(archivePath);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) throw new Error(`${projectTitle}: modrinth.index.json을 찾을 수 없습니다.`);
  let index;
  try { index = JSON.parse(indexEntry.getData().toString('utf8')); } catch { throw new Error(`${projectTitle}: 모드팩 정보를 읽을 수 없습니다.`); }
  if (!index || Number(index.formatVersion) !== 1) throw new Error(`${projectTitle}: 지원하지 않는 Modrinth 모드팩 형식입니다.`);

  const root = path.resolve(gameDir(id));
  const installedPaths = [];
  const files = Array.isArray(index.files) ? index.files.filter(f => f?.env?.client !== 'unsupported') : [];
  let completed = 0;
  await runPool(files, 5, async file => {
    const rel = safePackRelativePath(file.path);
    const destination = path.resolve(root, rel);
    if (!destination.startsWith(root + path.sep)) throw new Error('모드팩 파일 경로가 게임 폴더 밖을 가리킵니다.');
    const url = Array.isArray(file.downloads) ? file.downloads[0] : null;
    if (!url) throw new Error(`${file.path}: 다운로드 주소가 없습니다.`);
    await downloadFile(url, destination, file.hashes || {});
    installedPaths.push(rel);
    completed++;
    if (completed === files.length || completed % 8 === 0) send('content-progress', { text: `${projectTitle} 적용 중 · ${completed}/${files.length}` });
  });

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = String(entry.entryName || '').replace(/\\/g, '/');
    let rel = null;
    if (name.startsWith('overrides/')) rel = name.slice('overrides/'.length);
    else if (name.startsWith('client-overrides/')) rel = name.slice('client-overrides/'.length);
    if (!rel) continue;
    rel = safePackRelativePath(rel);
    const destination = path.resolve(root, rel);
    if (!destination.startsWith(root + path.sep)) continue;
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, entry.getData());
    installedPaths.push(rel);
  }

  const deps = index.dependencies || {};
  const previousVersion = instance.version;
  const previousLoader = instance.loader;
  const previousLoaderVersion = instance.loaderVersion;
  if (deps.minecraft) instance.version = String(deps.minecraft);
  const loaderOrder = [['fabric-loader','fabric'],['quilt-loader','quilt'],['neoforge','neoforge'],['forge','forge']];
  const picked = loaderOrder.find(([key]) => deps[key]);
  if (picked) { instance.loader = picked[1]; instance.loaderVersion = String(deps[picked[0]] || 'latest'); }
  else { instance.loader = 'vanilla'; instance.loaderVersion = null; }
  if (instance.version !== previousVersion || instance.loader !== previousLoader || instance.loaderVersion !== previousLoaderVersion) {
    const config = await readConfig();
    const target = config.instances.find(x => x.id === id);
    if (target) {
      target.version = instance.version; target.loader = instance.loader; target.loaderVersion = instance.loaderVersion;
      target.settings = { ...defaultInstanceSettings(), ...(target.settings || {}), autoUpdateMinecraftVersion: false, autoUpdateLoaderVersion: false };
      await writeConfig(config);
    }
    await invalidateLoaderInstall(id);
  }
  return { packFiles: [...new Set(installedPaths)], indexName: index.name || projectTitle, indexVersionId: index.versionId || null };
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
  if (projectType === 'modpack') {
    const folder = validateContentType('modpacks').folder;
    const existing = registry.find(x => x.projectId === projectId);
    const fileName = collisionSafeFileName(registry, projectId, path.basename(file.filename));
    const destination = path.join(gameDir(id), folder, fileName);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    send('content-progress', { projectId, text: `${project.title} 모드팩 다운로드 중…` });
    await downloadFile(file.url, destination, file.hashes);
    const applied = await applyModpackArchive(id, instance, destination, project.title);
    const newFiles = new Set(applied.packFiles || []);
    if (existing?.packFiles) {
      const root = path.resolve(gameDir(id));
      for (const rel of existing.packFiles) {
        if (newFiles.has(rel)) continue;
        try { const target = path.resolve(root, rel); if (target.startsWith(root + path.sep)) await fsp.rm(target, { force: true }).catch(() => {}); } catch {}
      }
      if (existing.fileName && existing.fileName !== fileName) await fsp.rm(path.join(gameDir(id), existing.folder, existing.fileName), { force: true }).catch(() => {});
    }
    registry = registry.filter(x => x.projectId !== projectId);
    registry.push({ projectId, title: project.title, description: project.description || '', slug: project.slug, iconUrl: project.icon_url || null, projectType, versionId: version.id, versionNumber: version.version_number, fileName, folder, hashes: file.hashes || {}, installedAt: new Date().toISOString(), autoDependency: false, parents: [], disabled: false, packFiles: applied.packFiles || [], packName: applied.indexName || project.title });
    await writeRegistry(id, registry);
    return { project, version };
  }
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
      projectId, title: project.title, description: project.description || '', slug: project.slug, iconUrl: project.icon_url || null, projectType,
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
    return { ok: true, title: result.project.title, version: result.version.version_number, config: await readConfig() };
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
    return { ok: true, config: await readConfig() };
  } catch (error) { return { ok: false, error: error.message }; }
});
async function updateAllManagedContent(id, instance, type = null) {
  const meta = type ? validateContentType(type) : null;
  const roots = (await readRegistry(id)).filter(x => !x.autoDependency && (!meta || x.folder === meta.folder)).map(x => x.projectId);
  let count = 0;
  for (const projectId of roots) {
    const rec = (await readRegistry(id)).find(x => x.projectId === projectId);
    if (!rec) continue;
    const u = await getUpdateForRecord(instance, rec);
    if (u) { await updateManagedRoot(id, instance, projectId); count++; }
  }
  return count;
}
ipcMain.handle('modrinth-update-batch', async (_event, id, projectIds) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    const wanted = [...new Set((Array.isArray(projectIds) ? projectIds : []).map(String).filter(Boolean))];
    let count = 0, checked = 0;
    for (const projectId of wanted) {
      const rec = (await readRegistry(id)).find(x => x.projectId === projectId && !x.autoDependency);
      if (!rec) continue;
      checked++;
      const u = await getUpdateForRecord(instance, rec);
      if (!u) continue;
      await updateManagedRoot(id, instance, projectId);
      count++;
    }
    return { ok: true, count, checked, config: await readConfig() };
  } catch (error) { return { ok: false, error: error.message }; }
});
ipcMain.handle('modrinth-update-all', async (_event, id, type = null) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    return { ok: true, count: await updateAllManagedContent(id, instance, type), config: await readConfig() };
  } catch (error) { return { ok: false, error: error.message }; }
});

function launchReadyMarker(id) { return path.join(instanceDir(id), 'launch-ready.json'); }
async function writeLaunchReadyMarker(id, instance) {
  await fsp.writeFile(launchReadyMarker(id), JSON.stringify({ version: instance.version, loader: instance.loader, loaderVersion: instance.loaderVersion || null, at: new Date().toISOString() }), 'utf8').catch(() => {});
}

async function appendLauncherLog(id, text) {
  try {
    await fsp.mkdir(logsDir(id), { recursive: true });
    const now = new Date().toISOString();
    const stamp = now.slice(0, 10);
    const line = `[${now}] ${text}`;
    await fsp.appendFile(path.join(logsDir(id), `launcher-${stamp}.log`), `${line}\n`, 'utf8');
    send('game-log', { instanceId: id, line, at: now });
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
  if (!currentAccount || !isUsableCachedMicrosoftAccount(currentAccount)) return { ok:false, cached:false };
  const stamped = Number(currentAccount._easycraftRefreshedAt || accountRefreshedAt || 0);
  // Minecraft access token 수명을 넉넉히 고려해 최근 35분 안에 갱신된 계정만 그대로 사용합니다.
  if (!currentAccount._easycraftOfflineCached && Date.now() - stamped < 35 * 60 * 1000) return { ok:true, cached:false };
  try {
    const previous = currentAccount;
    const refreshed = isDirectMicrosoftAccount(previous)
      ? await refreshDirectMicrosoftAccount(previous)
      : await refreshAccountFromVault();
    if (!refreshed || refreshed.error) throw new Error(refreshed?.error || (isDirectMicrosoftAccount(previous) ? 'Microsoft 인증 갱신 실패' : 'EasyCraft 계정 동기화 실패'));
    refreshed._easycraftSkinUrl = previous._easycraftSkinUrl || null;
    refreshed._easycraftFaceDataUrl = previous._easycraftFaceDataUrl || null;
    refreshed._easycraftFaceOverlayDataUrl = previous._easycraftFaceOverlayDataUrl || null;
    refreshed._easycraftRefreshedAt = Date.now();
    refreshed._easycraftOfflineCached = false;
    currentAccount = refreshed; accountRefreshedAt = Date.now();
    await writeSecureJson(accountPath(), refreshed);
    send('account-changed', accountSummary(refreshed));
    return { ok:true, cached:false };
  } catch {
    // 마지막 정상 인증 계정은 버리지 않습니다. Vanilla에서만 제한적으로 오프라인 fallback에 사용합니다.
    currentAccount._easycraftOfflineCached = true;
    send('account-changed', accountSummary(currentAccount));
    return { ok:false, cached:true };
  }
}

async function resolveCachedVanillaOfflineFiles(id, instance, settings) {
  const root = gameDir(id);
  const version = String(instance.version || '').trim();
  if (!version || version === 'latest_release' || version === 'latest_snapshot') {
    throw new Error('오프라인 실행 전에 온라인 상태에서 사용할 Minecraft 버전을 한 번 선택하고 실행해 주세요.');
  }
  const versionDir = path.join(root, 'versions', version);
  const versionJsonPath = path.join(versionDir, `${version}.json`);
  const clientJarPath = path.join(versionDir, `${version}.jar`);
  let versionJson;
  try { versionJson = JSON.parse(await fsp.readFile(versionJsonPath, 'utf8')); }
  catch { throw new Error(`Minecraft ${version}의 로컬 실행 정보가 없습니다. 온라인 상태에서 이 인스턴스를 한 번 실행해 설치를 완료해 주세요.`); }
  try { await fsp.access(clientJarPath); }
  catch { throw new Error(`Minecraft ${version} 게임 파일이 아직 설치되지 않았습니다. 온라인 상태에서 한 번 실행해 주세요.`); }

  let javaPath = String(settings.javaPath || '').trim();
  if (!javaPath) {
    const component = String(versionJson?.javaVersion?.component || 'jre-legacy');
    const exeName = process.platform === 'win32' ? 'javaw.exe' : 'java';
    const candidate = path.join(root, 'runtime', component, 'bin', exeName);
    try { if ((await fsp.stat(candidate)).isFile()) javaPath = candidate; } catch {}
  }
  if (!javaPath) {
    throw new Error('오프라인 실행에 사용할 Java 런타임이 없습니다. 온라인 상태에서 이 인스턴스를 한 번 실행하거나 Java 경로를 직접 지정해 주세요.');
  }

  let assetIndexPath = null;
  if (versionJson?.assetIndex?.id) {
    assetIndexPath = path.join(root, 'assets', 'indexes', `${versionJson.assetIndex.id}.json`);
    try { await fsp.access(assetIndexPath); }
    catch { throw new Error('Minecraft 에셋 인덱스가 아직 준비되지 않았습니다. 온라인 상태에서 이 인스턴스를 한 번 실행해 주세요.'); }
  }
  return { version, root, versionJsonPath, assetIndexPath, javaPath };
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
  cleanupOldLogs().catch(() => {});
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
    } else if (message.type === 'log') {
      send('game-log', { instanceId: ref.instanceId, line: message.line || '', at: message.at || new Date().toISOString() });
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
  worker.postMessage({ type:'launch', options:ref.options, offlineCache:ref.offlineCache || null, instanceId:ref.instanceId, name:ref.instance.name, logPath:launchLogPath(ref.instanceId) });
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

  let { config, instance: rawInstance } = await getInstance(id);
  if (!rawInstance) return { ok:false, error:'실행할 인스턴스를 찾을 수 없습니다.' };

  let summary = accountSummary(currentAccount);
  if (!summary || !currentAccount) summary = await loadSavedAccount();
  if (!summary || !currentAccount) {
    return { ok:false, needLogin:true, error:'Minecraft Java Edition을 사용하려면 EasyCraft 계정으로 로그인하거나 "EasyCraft 계정 없이 시작"에서 Microsoft Minecraft 계정을 인증해 주세요.' };
  }
  const authState = await ensureFreshAccountForLaunch();
  const offlineFallback = !authState.ok && authState.cached;
  if (!authState.ok && !offlineFallback) return { ok:false, needLogin:true, error:isDirectMicrosoftAccount(currentAccount) ? 'Microsoft Minecraft 로그인 정보를 갱신할 수 없습니다. 다시 로그인해 주세요.' : 'EasyCraft 계정에서 Minecraft 로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.' };
  if (offlineFallback && rawInstance.loader !== 'vanilla') {
    return { ok:false, error:'오프라인 실행은 Vanilla 인스턴스에서만 지원합니다. Fabric / Forge / NeoForge / Quilt는 온라인 계정 확인 후 실행해 주세요.' };
  }

  const automatic = await applyAutomaticInstanceVersionUpdates(id, config, rawInstance);
  config = automatic.config;
  const instance = automatic.instance;
  await ensureInstanceFolders(id);
  try {
    await ensureMinecraftInGameHud(id, instance);
  } catch (error) {
    // HUD 준비 실패가 Minecraft 실행 자체를 막지는 않도록 한다.
    await appendLauncherLog(id, `INGAME HUD WARNING ${error.message || error}`).catch(() => {});
  }
  const settings = instance.settings;
  let offlineFiles = null;
  if (offlineFallback) {
    try { offlineFiles = await resolveCachedVanillaOfflineFiles(id, instance, settings); }
    catch (error) { return { ok:false, error:error.message }; }
  }

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
    // 인증 서버 연결에 실패했을 때도 마지막으로 정상 인증된 계정으로 Vanilla 싱글플레이를 시작할 수 있게 합니다.
    bypassOffline: offlineFallback,
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
    java: { path: offlineFiles?.javaPath || settings.javaPath || null, type:'jre' },
    screen: { width:settings.screen.width, height:settings.screen.height, fullscreen:!!settings.screen.fullscreen },
    JVM_ARGS: [`-Deasycraft.instance=${safeId(id)}`, ...splitArgsLines(settings.jvmArgs)],
    GAME_ARGS: splitArgsLines(settings.gameArgs),
    memory: { min:`${settings.memory.min}G`, max:`${settings.memory.max}G` }
  };

  const ref = {
    instanceId:id,
    instance,
    options,
    offlineCache: offlineFiles ? { enabled:true, root:offlineFiles.root, version:offlineFiles.version, versionJsonPath:offlineFiles.versionJsonPath, assetIndexPath:offlineFiles.assetIndexPath } : null,
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
  await appendLauncherLog(id, `LAUNCH 0.4.16 ${instance.name} mc=${instance.version} loader=${instance.loader} auth=${offlineFallback ? 'cached-offline' : 'online'} root=${root}`);
  startLaunchWatchdog(ref);
  spawnMinecraftWorker(ref);
  return { ok:true, isolatedWorker:true, config, versionChanges:automatic.changes, offlineMode:offlineFallback };
});

// ---------- EasyCraft 자체 자동 업데이트 ----------
let launcherUpdateState = { state: 'idle', currentVersion: app.getVersion(), availableVersion: null, percent: 0, repository: null, releaseUrl: null };
let autoUpdaterInstance = null;
let launcherUpdateTimer = null;
let updateRepository = null;
const LAUNCHER_UPDATE_CHECK_TIMEOUT_MS = 6500;

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
  const repoRes = await fetchWithTimeout(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers }, 6000);
  if (!repoRes.ok) {
    if (repoRes.status === 404) throw new Error(`404: ${repository} repository is not publicly accessible`);
    throw new Error(`GitHub 저장소 확인 실패 (HTTP ${repoRes.status})`);
  }

  // A published release is required for electron-updater. A missing release is
  // reported separately instead of exposing electron-updater's long raw 404.
  const releaseRes = await fetchWithTimeout(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, { headers }, 6000);
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
    const check = autoUpdaterInstance.checkForUpdates();
    await promiseWithTimeout(
      check,
      LAUNCHER_UPDATE_CHECK_TIMEOUT_MS,
      '업데이트 서버 응답 시간이 초과되었습니다.'
    );
    // electron-updater가 정상이라면 available/latest 이벤트가 먼저 상태를 바꿉니다.
    // 드물게 Promise만 끝나고 이벤트가 오지 않는 경우에도 시작 화면을 붙잡지 않습니다.
    if (launcherUpdateState.state === 'checking') {
      setLauncherUpdateState({ state: 'timeout', error: '응답하지 못했습니다. 나중에 다시 시도하세요.' });
    }
    return { ok: true };
  } catch (error) {
    const timedOut = /업데이트 서버 응답 시간이 초과/i.test(String(error?.message || error || ''));
    const message = timedOut
      ? '응답하지 못했습니다. 나중에 다시 시도하세요.'
      : friendlyUpdateError(error);
    setLauncherUpdateState({ state: timedOut ? 'timeout' : 'error', error: message });
    return { ok: false, error: message };
  }
}
function scheduleAutomaticUpdateChecks() {
  // 첫 화면이 뜬 직후 업데이트를 검사합니다. 새 버전이 있을 때만 선택 화면을 보여줍니다.
  const first = setTimeout(() => checkForLauncherUpdate().catch(() => {}), 350);
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
    // NSIS blockmap이 있는 경우 electron-updater의 차등 다운로드를 사용합니다.
    if ('disableDifferentialDownload' in autoUpdater) autoUpdater.disableDifferentialDownload = false;

    setLauncherUpdateState({ state: 'idle', repository: updateRepository, error: null });
    // checking-for-update is intentionally not forced into a popup in the renderer.
    autoUpdater.on('checking-for-update', () => setLauncherUpdateState({ state: 'checking', percent: 0, error: null }));
    autoUpdater.on('update-available', info2 => setLauncherUpdateState({ state: 'available', availableVersion: info2.version, percent: 0, error: null, startupPrompt: true, releaseUrl: releasePageUrl(info2.version) }));
    autoUpdater.on('update-not-available', () => setLauncherUpdateState({ state: 'latest', availableVersion: null, percent: 0, error: null, startupPrompt: false, releaseUrl: null }));
    autoUpdater.on('download-progress', p => setLauncherUpdateState({ state: 'downloading', percent: Math.round(p.percent || 0), bytesPerSecond: Number(p.bytesPerSecond || 0), transferred: Number(p.transferred || 0), total: Number(p.total || 0), error: null }));
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


async function findInstalledUninstaller() {
  if (!app.isPackaged || process.platform !== 'win32') return null;
  const installDir = path.dirname(process.execPath);
  try {
    const entries = await fsp.readdir(installDir, { withFileTypes: true });
    const hit = entries.find(entry => entry.isFile() && /^Uninstall.*\.exe$/i.test(entry.name));
    return hit ? path.join(installDir, hit.name) : null;
  } catch { return null; }
}

async function startSilentUninstall() {
  if (process.platform !== 'win32') return { ok: false, error: '현재는 Windows 설치본에서만 프로그램 삭제를 지원합니다.' };
  if (!app.isPackaged) return { ok: false, error: '개발 모드에서는 프로그램 삭제를 실행할 수 없습니다.' };
  const uninstaller = await findInstalledUninstaller();
  if (!uninstaller) return { ok: false, error: 'EasyCraft Launcher 삭제 프로그램을 찾지 못했습니다. Windows 설정에서 설치 상태를 확인해 주세요.' };
  try {
    const helperDir = path.join(app.getPath('temp'), 'EasyCraft-Uninstall');
    await fsp.mkdir(helperDir, { recursive: true });
    const helperPath = path.join(helperDir, 'easycraft-uninstall.ps1');
    const appData = app.getPath('appData');
    const userDataPaths = [...new Set([
      app.getPath('userData'),
      path.join(appData, 'EasyCraft Launcher'),
      path.join(appData, 'easycraft-launcher'),
      path.join(appData, 'EasyCraftLauncher')
    ])];
    const script = String.raw`param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$Uninstaller,
  [Parameter(Mandatory=$true)][string]$DataJson
)
$ErrorActionPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddMinutes(3)
while ((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 200
}
Start-Process -FilePath $Uninstaller -ArgumentList '/S' -Wait -WindowStyle Hidden
try { $targets = ConvertFrom-Json $DataJson } catch { $targets = @() }
foreach ($target in $targets) {
  if ($target -and (Test-Path -LiteralPath $target)) {
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`;
    await fsp.writeFile(helperPath, script, 'utf8');
    const child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', helperPath,
      '-ParentPid', String(process.pid),
      '-Uninstaller', uninstaller,
      '-DataJson', JSON.stringify(userDataPaths)
    ], { detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
    setTimeout(() => app.quit(), 200);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error || '삭제를 시작하지 못했습니다.') };
  }
}

ipcMain.handle('uninstall-easycraft', async () => startSilentUninstall());
