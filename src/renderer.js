const api = window.launcherAPI;
const state = {
  config: { instances: [], selectedInstanceId: null },
  account: null,
  versions: [],
  latest: 'latest_release',
  contentType: 'mods',
  loaderChoice: 'vanilla',
  launchState: 'idle',
  activeInstanceId: null,
  updates: new Map(),
  searchBusy: false,
  settingsInstanceId: null,
  launcherUpdate: { state: 'idle', percent: 0 }
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function currentInstance() {
  return state.config.instances.find(i => i.id === state.config.selectedInstanceId) || null;
}
function instanceById(id) {
  return state.config.instances.find(i => i.id === id) || null;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}
function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 3800);
}
function showLaunchOverlay() {
  clearTimeout(showLaunchOverlay._hideTimer);
  $('#launchOverlay').classList.remove('hidden');
}
function scheduleHideLaunchOverlay(delay = 2500) {
  clearTimeout(showLaunchOverlay._hideTimer);
  showLaunchOverlay._hideTimer = setTimeout(() => $('#launchOverlay').classList.add('hidden'), delay);
}
function setStatus(text, percent = null) {
  showLaunchOverlay();
  $('#statusText').textContent = text;
  if (percent !== null) $('#progressBar').style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
}
function appendLog(line) {
  const box = $('#logBox');
  const text = String(line || '').trim();
  if (!text) return;
  box.textContent = `${box.textContent === 'Minecraft 실행 준비 중…' ? '' : `${box.textContent}\n`}${text}`.slice(-9000);
  box.scrollTop = box.scrollHeight;
}
function formatDownloads(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(n);
}
function normalizeSettings(inst) {
  return {
    memory: { min: 2, max: 6, ...(inst?.settings?.memory || {}) },
    screen: { width: 1280, height: 720, fullscreen: false, ...(inst?.settings?.screen || {}) },
    javaPath: inst?.settings?.javaPath || '',
    jvmArgs: inst?.settings?.jvmArgs || '',
    gameArgs: inst?.settings?.gameArgs || '',
    autoUpdateContent: inst?.settings?.autoUpdateContent !== false
  };
}

function renderAccount() {
  const logged = !!state.account;
  $('#accountName').textContent = logged ? state.account.name : '로그인 필요';
  $('#accountHint').textContent = logged ? 'Microsoft / Minecraft' : 'Microsoft 계정';
  $('.avatar').textContent = logged ? (state.account.name?.[0] || 'M').toUpperCase() : '?';
  $('#loginBtn').textContent = logged ? '계정 로그인됨' : 'Microsoft 로그인';
  $('#settingsLoginBtn').textContent = logged ? `${state.account.name} 로그인됨` : 'Microsoft 로그인';
  $('#logoutBtn').disabled = !logged;
}
function applyLaunchButton() {
  const btn = $('#launchBtn');
  const inst = currentInstance();
  btn.classList.remove('stop-mode');
  if (!inst) {
    btn.disabled = true;
    btn.textContent = '▶ 게임 실행';
    return;
  }
  if (state.activeInstanceId && state.activeInstanceId !== inst.id) {
    btn.disabled = true;
    btn.textContent = '다른 인스턴스 실행 중';
    return;
  }
  if (state.launchState === 'preparing') {
    btn.disabled = true;
    btn.textContent = '… 준비 중';
  } else if (state.launchState === 'running') {
    btn.disabled = false;
    btn.textContent = '■ 게임 종료';
    btn.classList.add('stop-mode');
  } else if (state.launchState === 'stopping') {
    btn.disabled = true;
    btn.textContent = '■ 종료 중…';
    btn.classList.add('stop-mode');
  } else {
    btn.disabled = false;
    btn.textContent = '▶ 게임 실행';
  }
}
function applyLaunchState(payload = {}) {
  state.launchState = payload.state || 'idle';
  state.activeInstanceId = state.launchState === 'idle' ? null : (payload.instanceId || state.activeInstanceId);
  const active = instanceById(payload.instanceId || state.activeInstanceId);
  if (active) $('#overlayInstanceName').textContent = active.name;
  $('#overlayStatusDot').classList.toggle('running', state.launchState === 'running');
  $('#overlayStatusDot').classList.toggle('busy', state.launchState === 'preparing' || state.launchState === 'stopping');

  if (state.launchState === 'preparing') {
    showLaunchOverlay();
    $('#statusText').textContent = 'Minecraft 준비 중…';
  } else if (state.launchState === 'running') {
    showLaunchOverlay();
    $('#statusText').textContent = 'Minecraft 실행 중';
    $('#progressBar').style.width = '100%';
  } else if (state.launchState === 'stopping') {
    showLaunchOverlay();
    $('#statusText').textContent = 'Minecraft 종료 중…';
  } else {
    $('#statusText').textContent = payload.error ? '실행 오류' : '게임 종료';
    if (!payload.error) scheduleHideLaunchOverlay();
  }
  applyLaunchButton();
  renderInstances();
}
function renderSelected() {
  const inst = currentInstance();
  $('#selectedPill').textContent = inst ? inst.name : '인스턴스 없음';
  $('#heroInstanceName').textContent = inst ? inst.name : '인스턴스를 만들어 주세요';
  $('#heroMeta').textContent = inst ? `Minecraft ${inst.version} · ${inst.loader === 'vanilla' ? 'Vanilla' : inst.loader}` : 'Minecraft 버전과 모드 로더를 고른 뒤 실행할 수 있습니다.';
  $('#contentInstanceHint').textContent = inst ? `${inst.name} · Minecraft ${inst.version} · ${inst.loader}` : '먼저 인스턴스를 선택해 주세요.';
  $('#settingsInstanceName').textContent = inst ? `${inst.name} · ${inst.version} · ${inst.loader}` : '인스턴스 없음';
  $('#heroInstanceSettingsBtn').disabled = !inst;
  $('#settingsInstanceBtn').disabled = !inst;
  $('#openGameFolderBtn').disabled = !inst;
  $('#openContentFolderBtn').disabled = !inst;
  $('#pickContentBtn').disabled = !inst;
  $('#checkUpdatesBtn').disabled = !inst;
  $('#modrinthSearchBtn').disabled = !inst;
  $('#modrinthSearchInput').disabled = !inst;
  state.updates = new Map();
  $('#updateBanner').classList.add('hidden');
  applyLaunchButton();
  renderInstances();
  renderContent();
}
function renderInstances() {
  const grid = $('#instanceGrid');
  grid.innerHTML = '';
  if (!state.config.instances.length) {
    grid.innerHTML = '<div class="empty-state">아직 인스턴스가 없습니다.<br><br><button class="primary" id="emptyCreateBtn">＋ 첫 인스턴스 만들기</button></div>';
    $('#emptyCreateBtn')?.addEventListener('click', openCreateModal);
    return;
  }
  state.config.instances.forEach(inst => {
    const settings = normalizeSettings(inst);
    const card = document.createElement('div');
    card.className = `instance-card ${inst.id === state.config.selectedInstanceId ? 'selected' : ''} ${state.activeInstanceId === inst.id ? 'running-instance' : ''}`;
    card.innerHTML = `
      <div class="instance-card-actions">
        <button class="mini-btn instance-settings" title="인스턴스 설정">⚙ 설정</button>
        <button class="mini-btn delete-instance" title="삭제">삭제</button>
      </div>
      <h3>${escapeHtml(inst.name)}</h3>
      <p>Minecraft ${escapeHtml(inst.version)} · RAM ${settings.memory.min}-${settings.memory.max}GB</p>
      <span class="instance-badge">${escapeHtml(inst.loader)}</span>
      ${state.activeInstanceId === inst.id ? '<span class="running-badge">● 실행 중</span>' : ''}`;
    card.addEventListener('click', async e => {
      if (e.target.closest('.delete-instance') || e.target.closest('.instance-settings')) return;
      const r = await api.selectInstance(inst.id);
      if (r.ok) { state.config = r.config; renderSelected(); }
    });
    card.querySelector('.instance-settings').addEventListener('click', e => { e.stopPropagation(); openInstanceSettings(inst.id); });
    card.querySelector('.delete-instance').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`'${inst.name}' 인스턴스를 삭제할까요?\n\n이 인스턴스의 모드, 리소스팩, 셰이더, 세이브, 설정, 다운로드된 게임 파일까지 전부 같이 삭제됩니다.`)) return;
      const r = await api.deleteInstance(inst.id);
      if (r.ok) {
        state.config = r.config;
        renderSelected();
        toast('인스턴스와 관련 파일을 모두 삭제했습니다.');
      } else toast(r.error || '삭제 실패', true);
    });
    grid.appendChild(card);
  });
}

async function renderContent() {
  const list = $('#contentList');
  const inst = currentInstance();
  if (!inst) {
    list.innerHTML = '<div class="empty-state compact">인스턴스를 선택하면 설치된 콘텐츠가 표시됩니다.</div>';
    return;
  }
  try {
    const items = await api.listContent(inst.id, state.contentType);
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="empty-state compact">아직 실제 폴더에 설치된 콘텐츠가 없습니다. 위에서 검색해서 바로 설치해 보세요.</div>';
      return;
    }
    items.forEach(item => {
      const update = item.projectId ? state.updates.get(item.projectId) : null;
      const row = document.createElement('div');
      row.className = 'content-row';
      const title = item.title || item.displayName;
      const subtitle = item.managed ? `${item.versionNumber || '버전 정보 없음'} · Modrinth${item.autoDependency ? ' · 자동 의존성' : ''}` : '직접 추가한 파일';
      row.innerHTML = `
        <div class="content-file">
          <strong class="managed-name">${escapeHtml(title)}</strong>
          <small>${escapeHtml(subtitle)}</small>
          <div class="content-tags"><span class="tiny-tag">${item.enabled ? '사용 중' : '사용 안 함'}</span>${item.autoDependency ? '<span class="tiny-tag dep">필수 의존성</span>' : ''}${update ? `<span class="tiny-tag">${escapeHtml(update.latestVersion)} 업데이트</span>` : ''}</div>
        </div>
        ${update && !item.autoDependency ? '<button class="update-one">업데이트</button>' : '<span></span>'}
        <button class="toggle ${item.enabled ? 'on' : ''}" title="켜기/끄기"></button>
        <button class="delete-file" title="${item.autoDependency ? '상위 모드를 삭제하면 자동으로 같이 정리됩니다.' : '삭제'}" ${item.autoDependency ? 'disabled' : ''}>×</button>`;
      row.querySelector('.toggle').addEventListener('click', async () => { await api.toggleContent(inst.id, state.contentType, item.name); renderContent(); });
      row.querySelector('.delete-file')?.addEventListener('click', async () => {
        if (item.autoDependency) { toast('이 파일은 다른 모드의 필수 의존성입니다.', true); return; }
        const msg = item.managed ? `${title}을(를) 삭제할까요?\n자동 설치된 불필요한 의존성도 같이 정리됩니다.` : `${item.displayName} 파일을 삭제할까요?`;
        if (!confirm(msg)) return;
        const r = await api.deleteContent(inst.id, state.contentType, item.name);
        if (!r.ok) toast(r.error || '삭제 실패', true); else toast(`${title} 삭제 완료`);
        await renderContent(); await refreshSearchInstalledFlags();
      });
      row.querySelector('.update-one')?.addEventListener('click', async () => {
        const btn = row.querySelector('.update-one');
        btn.disabled = true; btn.textContent = '업데이트 중…';
        const r = await api.modrinthUpdate(inst.id, item.projectId);
        if (r.ok) {
          toast(`${title} 업데이트 완료`);
          state.updates.delete(item.projectId);
          updateBanner(); await renderContent();
        } else { btn.disabled = false; btn.textContent = '업데이트'; toast(r.error || '업데이트 실패', true); }
      });
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state compact">목록 오류: ${escapeHtml(e.message)}</div>`;
  }
}
function contentCopy() {
  const map = {
    mods: ['모드 파일을 여기에 끌어놓으세요', '.jar 파일을 직접 넣어야 할 때만 사용하세요. 일반적으로 위 Modrinth 검색을 이용하세요.'],
    resourcepacks: ['리소스팩을 여기에 끌어놓으세요', '.zip 리소스팩을 직접 추가할 수도 있습니다.'],
    shaderpacks: ['셰이더팩을 여기에 끌어놓으세요', '.zip 셰이더팩을 직접 추가할 수도 있습니다.']
  };
  $('#dropTitle').textContent = map[state.contentType][0];
  $('#dropHint').textContent = map[state.contentType][1];
  const labels = { mods: '모드', resourcepacks: '리소스팩', shaderpacks: '셰이더' };
  $('#modrinthSearchInput').placeholder = `Modrinth에서 ${labels[state.contentType]} 검색...`;
}
function switchView(view) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  const meta = {
    play:['플레이','인스턴스를 고르고 바로 Minecraft를 실행하세요.'],
    instances:['인스턴스','각 Minecraft 환경과 실행 설정을 완전히 따로 관리하세요.'],
    content:['모드 & 콘텐츠','Modrinth에서 검색하고 현재 인스턴스에 바로 설치하세요.'],
    settings:['설정','인스턴스, 계정, EasyCraft 업데이트를 관리합니다.']
  }[view];
  $('#pageTitle').textContent = meta[0]; $('#pageSubtitle').textContent = meta[1];
  if (view === 'content' && currentInstance()) searchModrinth();
}
function selectContentType(type, doSearch = true) {
  state.contentType = type;
  $$('.content-tab').forEach(x => x.classList.toggle('active', x.dataset.type === type));
  contentCopy(); renderContent();
  if (doSearch && currentInstance()) searchModrinth();
}

function fillVersionSelect(select, selected) {
  const values = [state.latest, ...state.versions].filter(Boolean);
  if (selected && !values.includes(selected)) values.unshift(selected);
  select.innerHTML = '';
  [...new Set(values)].forEach(v => {
    const o = document.createElement('option'); o.value = v; o.textContent = v === state.latest ? `최신 릴리스 (${v})` : v; select.appendChild(o);
  });
  if (selected) select.value = selected;
}
function openCreateModal() {
  $('#instanceModal').classList.remove('hidden');
  $('#instanceNameInput').value = '';
  state.loaderChoice = 'vanilla';
  $$('.loader-option').forEach(b => b.classList.toggle('active', b.dataset.loader === 'vanilla'));
  fillVersionSelect($('#versionSelect'), state.latest);
  $('#instanceNameInput').focus();
}
function closeCreateModal() { $('#instanceModal').classList.add('hidden'); }
function openInstanceSettings(id = currentInstance()?.id) {
  const inst = instanceById(id);
  if (!inst) { toast('인스턴스를 먼저 선택해 주세요.', true); return; }
  if (state.activeInstanceId === id) { toast('게임 실행 중에는 이 인스턴스 설정을 바꿀 수 없습니다.', true); return; }
  state.settingsInstanceId = id;
  const s = normalizeSettings(inst);
  $('#instanceSettingsHint').textContent = `${inst.name}에만 적용되는 설정입니다.`;
  $('#editInstanceName').value = inst.name;
  fillVersionSelect($('#editInstanceVersion'), inst.version);
  $('#editInstanceLoader').value = inst.loader;
  $('#editMinRam').value = s.memory.min; $('#editMaxRam').value = s.memory.max;
  $('#editWidth').value = s.screen.width; $('#editHeight').value = s.screen.height;
  $('#editFullscreen').checked = !!s.screen.fullscreen;
  $('#editJavaPath').value = s.javaPath;
  $('#editJvmArgs').value = s.jvmArgs;
  $('#editGameArgs').value = s.gameArgs;
  $('#editAutoUpdateContent').checked = s.autoUpdateContent;
  $('#instanceSettingsModal').classList.remove('hidden');
}
function closeInstanceSettings() { $('#instanceSettingsModal').classList.add('hidden'); state.settingsInstanceId = null; }

async function login() {
  if (state.account) { toast(`${state.account.name} 계정으로 로그인되어 있습니다.`); return; }
  const r = await api.loginMicrosoft();
  if (r.ok) { state.account = r.account; renderAccount(); } else toast(r.error || '로그인 실패', true);
}
async function addPicked(type = state.contentType) {
  const inst = currentInstance();
  if (!inst) { toast('먼저 인스턴스를 만들어 주세요.', true); switchView('instances'); return; }
  const r = await api.pickContent(inst.id, type);
  if (r.added?.length) toast(`${r.added.length}개 파일을 추가했습니다.`);
  if (r.skipped?.length) toast(`지원하지 않는 파일 ${r.skipped.length}개는 건너뛰었습니다.`, true);
  if (type === state.contentType) renderContent();
}
async function searchModrinth() {
  const inst = currentInstance(); const box = $('#modrinthResults');
  if (!inst) { box.innerHTML = '<div class="empty-state compact">먼저 인스턴스를 선택해 주세요.</div>'; return; }
  if (state.searchBusy) return;
  state.searchBusy = true; $('#modrinthSearchBtn').disabled = true;
  box.innerHTML = '<div class="loading-card">Modrinth에서 호환되는 콘텐츠를 찾는 중…</div>';
  const r = await api.modrinthSearch(inst.id, state.contentType, $('#modrinthSearchInput').value.trim());
  state.searchBusy = false; $('#modrinthSearchBtn').disabled = false;
  if (!r.ok) { box.innerHTML = `<div class="empty-state compact">${escapeHtml(r.error || '검색 실패')}</div>`; return; }
  renderSearchResults(r.results || []);
}
function renderSearchResults(results) {
  const box = $('#modrinthResults'); box.innerHTML = '';
  if (!results.length) { box.innerHTML = '<div class="empty-state compact">현재 인스턴스와 호환되는 검색 결과가 없습니다.</div>'; return; }
  results.forEach(item => {
    const card = document.createElement('div'); card.className = 'market-item';
    const icon = item.iconUrl ? `<img class="market-icon" src="${escapeHtml(item.iconUrl)}" alt="" />` : '<div class="market-icon placeholder">MC</div>';
    card.innerHTML = `${icon}<div class="market-main"><div class="market-title-row"><div><div class="market-title">${escapeHtml(item.title)}</div><div class="market-author">by ${escapeHtml(item.author || 'unknown')}</div></div></div><div class="market-desc">${escapeHtml(item.description || '')}</div><div class="market-meta"><small class="download-count">↓ ${formatDownloads(item.downloads)}</small><button class="primary install-btn" ${item.installed ? 'disabled' : ''}>${item.installed ? '실제 설치됨' : '설치'}</button></div></div>`;
    const btn = card.querySelector('.install-btn');
    if (!item.installed) btn.addEventListener('click', async () => {
      const inst = currentInstance(); if (!inst) return;
      btn.disabled = true; btn.textContent = '설치 중…';
      const r = await api.modrinthInstall(inst.id, item.projectId);
      if (r.ok) {
        btn.textContent = '실제 설치됨'; item.installed = true;
        toast(`${r.title || item.title} ${r.version ? `(${r.version}) ` : ''}설치 완료`);
        await renderContent();
      } else { btn.disabled = false; btn.textContent = '설치'; toast(r.error || '설치 실패', true); }
    });
    box.appendChild(card);
  });
}
async function refreshSearchInstalledFlags() { if ($('#view-content').classList.contains('active')) await searchModrinth(); }
function updateBanner() {
  const count = state.updates.size;
  if (!count) { $('#updateBanner').classList.add('hidden'); return; }
  $('#updateText').textContent = `업데이트 가능한 콘텐츠가 ${count}개 있습니다.`; $('#updateBanner').classList.remove('hidden');
}
async function checkUpdates(showNoUpdateToast = true) {
  const inst = currentInstance(); if (!inst) return;
  $('#checkUpdatesBtn').disabled = true; $('#checkUpdatesBtn').textContent = '확인 중…';
  const r = await api.modrinthCheckUpdates(inst.id);
  $('#checkUpdatesBtn').disabled = false; $('#checkUpdatesBtn').textContent = '업데이트 확인';
  if (!r.ok) { toast(r.error || '업데이트 확인 실패', true); return; }
  state.updates = new Map((r.updates || []).map(u => [u.projectId, u])); updateBanner(); await renderContent();
  if (!state.updates.size && showNoUpdateToast) toast('설치된 Modrinth 콘텐츠가 모두 최신입니다.');
  else if (state.updates.size) toast(`${state.updates.size}개의 업데이트를 찾았습니다.`);
}
async function launchOrStop() {
  const inst = currentInstance();
  if (!inst) { toast('실행할 인스턴스가 없습니다.', true); return; }
  if (state.launchState === 'running' && state.activeInstanceId === inst.id) {
    const r = await api.stopGame(inst.id);
    if (!r.ok) toast(r.error || '게임 종료 실패', true);
    return;
  }
  if (state.launchState !== 'idle') return;
  state.activeInstanceId = inst.id; state.launchState = 'preparing';
  $('#overlayInstanceName').textContent = inst.name; $('#logBox').textContent = 'Minecraft 실행 준비 중…';
  $('#progressBar').style.width = '1%'; applyLaunchState({ state: 'preparing', instanceId: inst.id });
  const r = await api.launchGame(inst.id);
  if (!r.ok) {
    applyLaunchState({ state: 'idle', instanceId: inst.id, error: r.error });
    if (r.needLogin) { toast('Microsoft 로그인이 필요합니다.', true); await login(); } else toast(r.error || '실행 실패', true);
  }
}

function renderLauncherUpdate(u = {}) {
  state.launcherUpdate = { ...state.launcherUpdate, ...u };
  const s = state.launcherUpdate;
  const text = $('#launcherUpdateText');
  const progress = $('#launcherUpdateProgress');
  const check = $('#launcherUpdateCheckBtn');
  const action = $('#launcherUpdateActionBtn');
  const overlay = $('#launcherUpdateOverlay');
  const overlayText = $('#overlayUpdateText');
  const overlayProgress = $('#overlayUpdateProgress');
  const overlayInstall = $('#overlayUpdateInstallBtn');

  const pct = Math.max(0, Math.min(100, Number(s.percent) || 0));
  progress.style.width = `${pct}%`;
  overlayProgress.style.width = `${pct}%`;
  action.classList.add('hidden');
  action.disabled = false;
  overlayInstall.classList.add('hidden');
  overlayInstall.disabled = false;
  check.disabled = false;

  const messages = {
    idle: '실행 시 자동으로 업데이트를 확인합니다.',
    dev: '개발 모드에서는 설치형 업데이트를 검사하지 않습니다.',
    unconfigured: 'GitHub 업데이트 저장소를 감지하지 못했습니다.',
    checking: '새 버전을 자동으로 확인하는 중…',
    latest: '현재 최신 버전입니다.',
    available: `새 버전 ${s.availableVersion || ''} 발견. 자동 다운로드를 시작합니다…`,
    downloading: `버전 ${s.availableVersion || ''} 다운로드 중… ${Math.round(s.percent || 0)}%`,
    downloaded: `버전 ${s.availableVersion || ''} 준비 완료. 재시작하면 자동 적용됩니다.`,
    error: `업데이트 오류: ${s.error || '알 수 없는 오류'}`
  };
  const message = messages[s.state] || messages.idle;
  text.textContent = message;
  overlayText.textContent = message;

  if (s.state === 'checking' || s.state === 'downloading' || s.state === 'available') check.disabled = true;
  if (s.state === 'downloaded') {
    action.textContent = '재시작하여 업데이트';
    action.dataset.action = 'install';
    action.classList.remove('hidden');
    overlayInstall.classList.remove('hidden');
  }
  $('#updateRepositoryText').textContent = s.repository ? `업데이트 저장소: ${s.repository}` : '';

  const shouldShowOverlay = ['checking', 'available', 'downloading', 'downloaded', 'error'].includes(s.state);
  clearTimeout(renderLauncherUpdate._hideTimer);
  if (shouldShowOverlay && !renderLauncherUpdate._dismissed) {
    overlay.classList.remove('hidden');
    $('#launchOverlay').classList.add('updater-visible');
  } else if (s.state === 'latest') {
    overlay.classList.remove('hidden');
    $('#launchOverlay').classList.add('updater-visible');
    renderLauncherUpdate._hideTimer = setTimeout(() => {
      overlay.classList.add('hidden');
      $('#launchOverlay').classList.remove('updater-visible');
    }, 1800);
  } else if (!shouldShowOverlay) {
    overlay.classList.add('hidden');
    $('#launchOverlay').classList.remove('updater-visible');
  }

  // 새 업데이트를 찾거나 다운로드가 끝나면 이전에 닫았던 알림도 다시 보여 줍니다.
  if (s.state === 'available' || s.state === 'downloaded') {
    renderLauncherUpdate._dismissed = false;
    overlay.classList.remove('hidden');
    $('#launchOverlay').classList.add('updater-visible');
  }
}


$$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$('#goInstancesBtn').addEventListener('click', () => switchView('instances'));
$('#newInstanceBtn').addEventListener('click', openCreateModal);
$('#closeModalBtn').addEventListener('click', closeCreateModal);
$('#cancelModalBtn').addEventListener('click', closeCreateModal);
$('#instanceModal').addEventListener('click', e => { if (e.target.id === 'instanceModal') closeCreateModal(); });
$$('.loader-option').forEach(b => b.addEventListener('click', () => { state.loaderChoice = b.dataset.loader; $$('.loader-option').forEach(x => x.classList.toggle('active', x === b)); }));
$('#createInstanceBtn').addEventListener('click', async () => {
  const r = await api.createInstance({ name: $('#instanceNameInput').value.trim(), version: $('#versionSelect').value, loader: state.loaderChoice });
  if (!r.ok) { toast(r.error || '만들기 실패', true); return; }
  state.config = r.config; closeCreateModal(); renderSelected(); switchView('play'); toast(`${r.instance.name} 인스턴스를 만들었습니다.`);
});
$('#instanceNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#createInstanceBtn').click(); });

$('#heroInstanceSettingsBtn').addEventListener('click', () => openInstanceSettings());
$('#settingsInstanceBtn').addEventListener('click', () => openInstanceSettings());
$('#closeInstanceSettingsBtn').addEventListener('click', closeInstanceSettings);
$('#cancelInstanceSettingsBtn').addEventListener('click', closeInstanceSettings);
$('#instanceSettingsModal').addEventListener('click', e => { if (e.target.id === 'instanceSettingsModal') closeInstanceSettings(); });
$('#pickJavaBtn').addEventListener('click', async () => { const r = await api.pickJava(); if (r.ok && r.path) $('#editJavaPath').value = r.path; });
$('#saveInstanceSettingsBtn').addEventListener('click', async () => {
  const id = state.settingsInstanceId; if (!id) return;
  const min = Number($('#editMinRam').value), max = Number($('#editMaxRam').value);
  if (max < min) { toast('최대 RAM은 최소 RAM보다 작을 수 없습니다.', true); return; }
  const r = await api.updateInstanceSettings(id, {
    name: $('#editInstanceName').value.trim(), version: $('#editInstanceVersion').value, loader: $('#editInstanceLoader').value,
    memory: { min, max }, screen: { width: Number($('#editWidth').value), height: Number($('#editHeight').value), fullscreen: $('#editFullscreen').checked },
    javaPath: $('#editJavaPath').value.trim(), jvmArgs: $('#editJvmArgs').value, gameArgs: $('#editGameArgs').value,
    autoUpdateContent: $('#editAutoUpdateContent').checked
  });
  if (!r.ok) { toast(r.error || '설정 저장 실패', true); return; }
  state.config = r.config; closeInstanceSettings(); renderSelected(); toast('이 인스턴스 설정을 저장했습니다.');
});

$('#loginBtn').addEventListener('click', login); $('#settingsLoginBtn').addEventListener('click', login);
$('#logoutBtn').addEventListener('click', async () => { await api.logout(); state.account = null; renderAccount(); toast('로그아웃했습니다.'); });
$('#launchBtn').addEventListener('click', launchOrStop);

$$('.quick-add').forEach(b => b.addEventListener('click', () => { selectContentType(b.dataset.type, false); switchView('content'); $('#modrinthSearchInput').focus(); }));
$$('.content-tab').forEach(b => b.addEventListener('click', () => selectContentType(b.dataset.type)));
$('#modrinthSearchBtn').addEventListener('click', searchModrinth); $('#modrinthSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchModrinth(); });
$('#checkUpdatesBtn').addEventListener('click', () => checkUpdates(true));
$('#updateAllBtn').addEventListener('click', async () => {
  const inst = currentInstance(); if (!inst) return;
  const btn = $('#updateAllBtn'); btn.disabled = true; btn.textContent = '업데이트 중…';
  const r = await api.modrinthUpdateAll(inst.id); btn.disabled = false; btn.textContent = '모두 업데이트';
  if (!r.ok) { toast(r.error || '일괄 업데이트 실패', true); return; }
  toast(`${r.count}개 콘텐츠 업데이트 완료`); state.updates = new Map(); updateBanner(); await renderContent(); await refreshSearchInstalledFlags();
});
$('#pickContentBtn').addEventListener('click', () => addPicked());
$('#openContentFolderBtn').addEventListener('click', () => { const i = currentInstance(); if (i) api.openContentFolder(i.id, state.contentType); });
$('#openGameFolderBtn').addEventListener('click', () => { const i = currentInstance(); if (i) api.openInstanceFolder(i.id); });
$('#settingsOpenFolderBtn').addEventListener('click', () => { const i = currentInstance(); if (i) api.openInstanceFolder(i.id); else toast('인스턴스를 먼저 선택해 주세요.', true); });

const dz = $('#dropZone');
['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', async e => {
  const inst = currentInstance(); if (!inst) { toast('인스턴스를 먼저 선택해 주세요.', true); return; }
  const paths = [...e.dataTransfer.files].map(f => { try { return api.getFilePath(f); } catch { return null; } }).filter(Boolean);
  if (!paths.length) { toast('파일 경로를 읽지 못했습니다.', true); return; }
  const r = await api.addContentPaths(inst.id, state.contentType, paths);
  if (r.added?.length) toast(`${r.added.length}개 파일을 추가했습니다.`); if (r.skipped?.length) toast(`지원하지 않는 파일 ${r.skipped.length}개를 건너뛰었습니다.`, true); renderContent();
});

$('#launcherUpdateCheckBtn').addEventListener('click', async () => { const r = await api.checkLauncherUpdate(); if (!r.ok) toast(r.error || '업데이트 확인 실패', true); });
$('#overlayUpdateCloseBtn').addEventListener('click', () => { renderLauncherUpdate._dismissed = true; $('#launcherUpdateOverlay').classList.add('hidden'); $('#launchOverlay').classList.remove('updater-visible'); });
$('#overlayUpdateInstallBtn').addEventListener('click', async () => { const btn = $('#overlayUpdateInstallBtn'); btn.disabled = true; btn.textContent = '업데이트 적용 중…'; const r = await api.installLauncherUpdate(); if (!r.ok) { btn.disabled = false; btn.textContent = '재시작하여 업데이트'; toast(r.error || '업데이트 적용 실패', true); } });
$('#launcherUpdateActionBtn').addEventListener('click', async () => {
  const btn = $('#launcherUpdateActionBtn'); btn.disabled = true;
  const r = btn.dataset.action === 'install' ? await api.installLauncherUpdate() : await api.downloadLauncherUpdate();
  if (!r.ok) { btn.disabled = false; toast(r.error || '업데이트 작업 실패', true); }
});

api.onAccountChanged(account => { state.account = account; renderAccount(); });
api.onStatus(s => { if (s?.text && s.kind === 'error') toast(s.text, true); });
api.onLaunchProgress(p => { if (p?.text) setStatus(p.text, p.percent ?? null); if (p?.text) appendLog(p.text); });
api.onLaunchState(applyLaunchState);
api.onGameLog(line => appendLog(line));
api.onLaunchError(message => { setStatus('실행 오류', 0); toast(message, true); appendLog(`ERROR: ${message}`); applyLaunchState({ state: 'idle', instanceId: state.activeInstanceId, error: message }); });
api.onLaunchClosed(() => { setStatus('게임 종료', 0); appendLog('Minecraft가 종료되었습니다.'); applyLaunchState({ state: 'idle', instanceId: state.activeInstanceId }); });
api.onContentProgress(info => { if (info?.text) toast(info.text); });
api.onLauncherUpdateState(renderLauncherUpdate);

(async function init() {
  const boot = await api.bootstrap();
  state.config = boot.config; state.account = boot.account;
  state.launchState = boot.launchState?.state || 'idle'; state.activeInstanceId = boot.launchState?.instanceId || null;
  $('#appVersion').textContent = `v${boot.appVersion}`;
  renderAccount(); contentCopy(); renderLauncherUpdate(boot.updateState || {});
  const vr = await api.fetchVersions(); state.versions = vr.versions || []; state.latest = vr.latest || 'latest_release';
  fillVersionSelect($('#versionSelect'), state.latest);
  renderSelected(); applyLaunchState(boot.launchState || { state: 'idle' });
})();
