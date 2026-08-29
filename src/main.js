const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { Launch, Microsoft } = require('minecraft-java-core');

let mainWindow;
let currentAccount = null;
let activeLauncher = null;

const APP_UA = 'EasyCraftLauncher/0.3.0 (Minecraft launcher; Modrinth integration)';
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
    autoUpdateContent: true
  };
}
function normalizeInstance(instance, legacyMemory = null) {
  const base = defaultInstanceSettings(legacyMemory);
  const settings = instance?.settings || {};
  return {
    ...instance,
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
    uuid: account.uuid || account.id || account.profile?.id || null
  };
}
async function loadSavedAccount() {
  try {
    const account = JSON.parse(await fsp.readFile(accountPath(), 'utf8'));
    if (!account.refresh_token) return null;
    const refreshed = await new Microsoft().refresh(account);
    if (!refreshed || refreshed.error) throw new Error(refreshed?.error || 'Microsoft 인증 갱신 실패');
    await fsp.writeFile(accountPath(), JSON.stringify(refreshed, null, 2), 'utf8');
    currentAccount = refreshed;
    return accountSummary(refreshed);
  } catch {
    currentAccount = null;
    return null;
  }
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240, height: 800, minWidth: 1000, minHeight: 650,
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
ipcMain.handle('login-microsoft', async () => {
  try {
    send('status', { text: 'Microsoft 로그인 창을 준비하고 있습니다…', kind: 'info' });
    const account = await new Microsoft().getAuth();
    if (!account || account.error) throw new Error(account?.error || '로그인에 실패했습니다.');
    currentAccount = account;
    await fsp.writeFile(accountPath(), JSON.stringify(account, null, 2), 'utf8');
    const summary = accountSummary(account);
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
  await fsp.rm(accountPath(), { force: true }).catch(() => {});
  send('account-changed', null);
  return { ok: true };
});

ipcMain.handle('create-instance', async (_event, input) => {
  const name = String(input?.name || '').trim().slice(0, 40);
  const version = String(input?.version || 'latest_release').trim();
  const loader = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(input?.loader) ? input.loader : 'vanilla';
  if (!name) return { ok: false, error: '인스턴스 이름을 입력해 주세요.' };
  const config = await readConfig();
  const id = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const instance = { id, name, version, loader, createdAt: new Date().toISOString(), settings: defaultInstanceSettings(config.memory) };
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
  await fsp.rm(instanceDir(id), { recursive: true, force: true });
  return { ok: true, config };
});
ipcMain.handle('update-instance', async (_event, id, patch) => {
  const config = await readConfig();
  const instance = config.instances.find(i => i.id === id);
  if (!instance) return { ok: false, error: '인스턴스를 찾을 수 없습니다.' };
  if (patch?.name) instance.name = String(patch.name).trim().slice(0, 40) || instance.name;
  if (patch?.version) instance.version = String(patch.version).trim();
  if (['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(patch?.loader)) instance.loader = patch.loader;
  await writeConfig(config);
  return { ok: true, config, instance };
});
ipcMain.handle('update-instance-settings', async (_event, id, patch) => {
  const config = await readConfig();
  const index = config.instances.findIndex(i => i.id === id);
  if (index < 0) return { ok: false, error: '인스턴스를 찾을 수 없습니다.' };
  if (activeLauncher?.instanceId === id) return { ok: false, error: '게임 실행 중에는 이 인스턴스 설정을 변경할 수 없습니다.' };

  const instance = normalizeInstance(config.instances[index], config.memory);
  if (patch?.name) instance.name = String(patch.name).trim().slice(0, 40) || instance.name;
  if (patch?.version) instance.version = String(patch.version).trim();
  if (['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(patch?.loader)) instance.loader = patch.loader;

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
    autoUpdateContent: patch?.autoUpdateContent !== false
  };
  config.instances[index] = instance;
  await writeConfig(config);
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
ipcMain.handle('list-content', async (_event, id, type) => {
  const folder = targetFolder(id, type); await fsp.mkdir(folder, { recursive: true });
  const meta = validateContentType(type), registry = await managedForType(id, type);
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
      autoDependency: !!managed?.autoDependency
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
      projectId, title: project.title, slug: project.slug, projectType,
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
ipcMain.handle('modrinth-install', async (_event, id, projectId) => {
  try {
    const { instance } = await getInstance(id); if (!instance) throw new Error('인스턴스를 찾을 수 없습니다.');
    await ensureInstanceFolders(id);
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

ipcMain.handle('get-launch-state', async () => {
  return activeLauncher ? { state: activeLauncher.state || 'preparing', instanceId: activeLauncher.instanceId } : { state: 'idle', instanceId: null };
});

ipcMain.handle('stop-game', async (_event, id) => {
  if (!activeLauncher || activeLauncher.instanceId !== id) return { ok: false, error: '이 인스턴스에서 실행 중인 Minecraft가 없습니다.' };
  if (activeLauncher.state !== 'running') return { ok: false, error: 'Minecraft가 아직 실행 준비 중입니다.' };
  emitLaunchState('stopping', id);
  const needle = safeId(id);
  try {
    if (process.platform === 'win32') {
      const psNeedle = needle.replace(/'/g, "''");
      const script = `$needle='${psNeedle}'; $p=Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'javaw.exe') -and $_.CommandLine -and $_.CommandLine.Contains($needle) }; if(-not $p){exit 3}; $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true }, (err) => err ? reject(err) : resolve()));
    } else {
      await new Promise((resolve, reject) => execFile('pkill', ['-f', needle], err => err ? reject(err) : resolve()));
    }
    return { ok: true };
  } catch (error) {
    emitLaunchState('running', id);
    return { ok: false, error: '게임 프로세스를 찾거나 종료하지 못했습니다. Minecraft 창에서 직접 종료해 주세요.' };
  }
});

ipcMain.handle('launch-game', async (_event, id) => {
  if (activeLauncher) return { ok: false, error: '이미 Minecraft를 실행하고 있습니다.' };
  const summary = await loadSavedAccount();
  if (!summary || !currentAccount) return { ok: false, needLogin: true, error: '먼저 Microsoft 계정으로 로그인해 주세요.' };
  const { config, instance: rawInstance } = await getInstance(id);
  if (!rawInstance) return { ok: false, error: '실행할 인스턴스를 찾을 수 없습니다.' };
  const instance = normalizeInstance(rawInstance, config.memory);
  await ensureInstanceFolders(id);

  if (instance.settings.autoUpdateContent) {
    try {
      send('launch-progress', { percent: 1, text: 'Modrinth 콘텐츠 업데이트 확인 중…' });
      const count = await updateAllManagedContent(id, instance);
      if (count) send('content-progress', { text: `실행 전에 ${count}개 콘텐츠를 자동 업데이트했습니다.` });
    } catch (error) {
      await appendLauncherLog(id, `AUTO CONTENT UPDATE ERROR ${error.message || error}`);
    }
  }
  await repairManagedContent(id);

  const root = gameDir(id);
  const launcher = new Launch();
  activeLauncher = { launcher, instanceId: id, state: 'preparing' };
  emitLaunchState('preparing', id, { name: instance.name });
  const loaderEnabled = instance.loader !== 'vanilla';
  const settings = instance.settings;
  const opts = {
    path: root,
    authenticator: currentAccount,
    version: instance.version || 'latest_release',
    detached: false,
    verify: true,
    timeout: 30000,
    loader: {
      enable: loaderEnabled,
      type: loaderEnabled ? instance.loader : null,
      build: 'latest',
      path: path.join(root, 'loader')
    },
    java: { path: settings.javaPath || null, type: 'jre' },
    screen: {
      width: settings.screen.width,
      height: settings.screen.height,
      fullscreen: !!settings.screen.fullscreen
    },
    JVM_ARGS: splitArgsLines(settings.jvmArgs),
    GAME_ARGS: splitArgsLines(settings.gameArgs),
    memory: { min: `${settings.memory.min}G`, max: `${settings.memory.max}G` }
  };

  const onLine = line => {
    const text = String(line || '').trim();
    if (!text) return;
    if (text.startsWith('Launching with arguments')) {
      emitLaunchState('running', id, { name: instance.name });
      send('launch-progress', { percent: 100, text: 'Minecraft 실행 중' });
    }
    send('game-log', text.slice(-1600));
    appendLauncherLog(id, text);
  };
  launcher.on('progress', (progress, total) => {
    let pct = Number(progress);
    if (Number(total) > 0 && Number(progress) > 1) pct = (Number(progress) / Number(total)) * 100;
    if (!Number.isFinite(pct)) pct = 0;
    send('launch-progress', { percent: Math.max(0, Math.min(99, pct)), text: '게임/Java/라이브러리 확인 및 다운로드 중…' });
  });
  launcher.on('extract', name => send('launch-progress', { text: `압축 해제: ${name}` }));
  launcher.on('patch', text => { send('launch-progress', { text: String(text).trim().slice(0, 180) }); onLine(text); });
  launcher.on('data', onLine);
  launcher.on('error', err => {
    const msg = launcherErrorMessage(err);
    onLine(`ERROR ${msg}`);
    send('launch-error', msg);
    emitLaunchState('idle', id, { error: msg });
    activeLauncher = null;
  });
  launcher.on('close', () => {
    send('launch-closed', { instanceId: id });
    emitLaunchState('idle', id);
    activeLauncher = null;
  });

  try {
    send('launch-progress', { percent: 2, text: `${instance.name} 준비 중…` });
    await appendLauncherLog(id, `LAUNCH ${instance.name} mc=${instance.version} loader=${instance.loader} root=${root} mods=${targetFolder(id, 'mods')}`);
    launcher.Launch(opts).catch(error => {
      const msg = launcherErrorMessage(error);
      appendLauncherLog(id, `LAUNCH ASYNC ERROR ${msg}`);
      send('launch-error', msg);
      emitLaunchState('idle', id, { error: msg });
      activeLauncher = null;
    });
    return { ok: true };
  } catch (error) {
    activeLauncher = null;
    const msg = launcherErrorMessage(error);
    await appendLauncherLog(id, `LAUNCH ERROR ${msg}`);
    send('launch-error', msg);
    emitLaunchState('idle', id, { error: msg });
    return { ok: false, error: msg };
  }
});

// ---------- EasyCraft 자체 자동 업데이트 ----------
let launcherUpdateState = { state: 'idle', currentVersion: app.getVersion(), availableVersion: null, percent: 0, repository: null };
let autoUpdaterInstance = null;
let launcherUpdateTimer = null;

function readBuildInfo() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf8')); }
  catch { return { repository: '' }; }
}
function setLauncherUpdateState(patch) {
  launcherUpdateState = { ...launcherUpdateState, ...patch, currentVersion: app.getVersion() };
  send('launcher-update-state', launcherUpdateState);
}
async function checkForLauncherUpdate({ manual = false } = {}) {
  if (!app.isPackaged) {
    if (manual) setLauncherUpdateState({ state: 'dev' });
    return { ok: false, error: '개발 모드에서는 자동 업데이트를 검사하지 않습니다. 설치된 .exe에서 확인해 주세요.' };
  }
  if (!autoUpdaterInstance) {
    return { ok: false, error: '업데이트 기능이 준비되지 않았습니다. GitHub Actions로 빌드한 설치본인지 확인해 주세요.' };
  }
  if (['checking', 'downloading', 'downloaded'].includes(launcherUpdateState.state)) return { ok: true, skipped: true };
  try {
    await autoUpdaterInstance.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message = error.message || String(error);
    setLauncherUpdateState({ state: 'error', error: message });
    return { ok: false, error: message };
  }
}
function scheduleAutomaticUpdateChecks() {
  // 시작 직후 UI가 뜬 다음 자동으로 한 번 확인합니다.
  const first = setTimeout(() => checkForLauncherUpdate().catch(() => {}), 2500);
  first.unref?.();

  // 런처를 오래 켜 두는 경우에도 4시간마다 새 릴리스를 확인합니다.
  launcherUpdateTimer = setInterval(() => {
    checkForLauncherUpdate().catch(() => {});
  }, 4 * 60 * 60 * 1000);
  launcherUpdateTimer.unref?.();
}
function initAutoUpdater() {
  if (!app.isPackaged) {
    setLauncherUpdateState({ state: 'dev', repository: readBuildInfo().repository || null });
    return;
  }
  try {
    const info = readBuildInfo();
    const [owner, repo] = String(info.repository || '').split('/');
    if (!owner || !repo) {
      setLauncherUpdateState({ state: 'unconfigured', repository: null });
      return;
    }

    const { autoUpdater } = require('electron-updater');
    autoUpdaterInstance = autoUpdater;

    // 업데이트 발견 즉시 사용자 조작 없이 다운로드합니다.
    autoUpdater.autoDownload = true;
    // 다운로드가 끝난 뒤 사용자가 런처를 정상 종료해도 업데이트가 적용됩니다.
    // 오른쪽 위의 '재시작하여 업데이트' 버튼을 누르면 즉시 적용됩니다.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    // 현재 프로젝트는 빌드 시 GitHub 저장소 정보를 build-info.json에도 보존합니다.
    // GitHub Actions에서 만들어진 공개 Release의 latest.yml을 사용합니다.
    autoUpdater.setFeedURL({ provider: 'github', owner, repo });

    setLauncherUpdateState({ state: 'idle', repository: `${owner}/${repo}`, error: null });
    autoUpdater.on('checking-for-update', () => setLauncherUpdateState({ state: 'checking', percent: 0, error: null }));
    autoUpdater.on('update-available', info2 => setLauncherUpdateState({ state: 'available', availableVersion: info2.version, percent: 0, error: null }));
    autoUpdater.on('update-not-available', () => setLauncherUpdateState({ state: 'latest', availableVersion: null, percent: 0, error: null }));
    autoUpdater.on('download-progress', p => setLauncherUpdateState({ state: 'downloading', percent: Math.round(p.percent || 0), error: null }));
    autoUpdater.on('update-downloaded', info2 => setLauncherUpdateState({ state: 'downloaded', availableVersion: info2.version, percent: 100, error: null }));
    autoUpdater.on('error', error => setLauncherUpdateState({ state: 'error', error: error.message || String(error) }));

    scheduleAutomaticUpdateChecks();
  } catch (error) {
    setLauncherUpdateState({ state: 'error', error: error.message || String(error) });
  }
}

ipcMain.handle('check-launcher-update', async () => checkForLauncherUpdate({ manual: true }));
ipcMain.handle('download-launcher-update', async () => {
  if (!autoUpdaterInstance) return { ok: false, error: '업데이트 기능이 준비되지 않았습니다.' };
  try {
    // 0.3.1부터는 원래 자동 다운로드되지만 수동 버튼/이전 UI와의 호환을 위해 유지합니다.
    await autoUpdaterInstance.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});
ipcMain.handle('install-launcher-update', async () => {
  if (!autoUpdaterInstance || launcherUpdateState.state !== 'downloaded') {
    return { ok: false, error: '다운로드가 완료된 업데이트가 없습니다.' };
  }
  // Windows NSIS 설치 후 EasyCraft를 다시 실행합니다.
  setImmediate(() => autoUpdaterInstance.quitAndInstall(false, true));
  return { ok: true };
});
