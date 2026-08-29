const api = window.launcherAPI;
const state = {
  config: { instances: [], selectedInstanceId: null, memory: { min: 2, max: 6 } },
  account: null,
  versions: [],
  latest: 'latest_release',
  contentType: 'mods',
  loaderChoice: 'vanilla',
  launching: false,
  updates: new Map(),
  searchBusy: false
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function currentInstance() {
  return state.config.instances.find(i => i.id === state.config.selectedInstanceId) || null;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function toast(message, error = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 3600);
}
function setStatus(text, percent = null) {
  $('#statusText').textContent = text;
  if (percent !== null) $('#progressBar').style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
}
function appendLog(line) {
  const box = $('#logBox');
  const text = String(line || '').trim();
  if (!text) return;
  box.textContent = `${box.textContent === '게임을 실행하면 진행 상황이 여기에 표시됩니다.' ? '' : box.textContent + '\n'}${text}`.slice(-12000);
  box.scrollTop = box.scrollHeight;
}
function formatDownloads(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return String(n);
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
function renderSelected() {
  const inst = currentInstance();
  $('#selectedPill').textContent = inst ? inst.name : '인스턴스 없음';
  $('#heroInstanceName').textContent = inst ? inst.name : '인스턴스를 만들어 주세요';
  $('#heroMeta').textContent = inst ? `Minecraft ${inst.version} · ${inst.loader === 'vanilla' ? 'Vanilla' : inst.loader}` : 'Minecraft 버전과 모드 로더를 고른 뒤 실행할 수 있습니다.';
  $('#contentInstanceHint').textContent = inst ? `${inst.name} · Minecraft ${inst.version} · ${inst.loader}` : '먼저 인스턴스를 선택해 주세요.';
  $('#launchBtn').disabled = !inst || state.launching;
  $('#openGameFolderBtn').disabled = !inst;
  $('#openContentFolderBtn').disabled = !inst;
  $('#pickContentBtn').disabled = !inst;
  $('#checkUpdatesBtn').disabled = !inst;
  $('#modrinthSearchBtn').disabled = !inst;
  $('#modrinthSearchInput').disabled = !inst;
  state.updates = new Map();
  $('#updateBanner').classList.add('hidden');
  renderInstances();
  renderContent();
}
function renderInstances() {
  const grid = $('#instanceGrid');
  grid.innerHTML = '';
  if (!state.config.instances.length) {
    grid.innerHTML = '<div class="empty-state">아직 인스턴스가 없습니다.<br><br><button class="primary" id="emptyCreateBtn">＋ 첫 인스턴스 만들기</button></div>';
    $('#emptyCreateBtn')?.addEventListener('click', openModal);
    return;
  }
  state.config.instances.forEach(inst => {
    const card = document.createElement('div');
    card.className = `instance-card ${inst.id === state.config.selectedInstanceId ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="instance-card-actions"><button class="mini-btn delete-instance" title="삭제">삭제</button></div>
      <h3>${escapeHtml(inst.name)}</h3>
      <p>Minecraft ${escapeHtml(inst.version)}</p>
      <span class="instance-badge">${escapeHtml(inst.loader)}</span>`;
    card.addEventListener('click', async e => {
      if (e.target.closest('.delete-instance')) return;
      const r = await api.selectInstance(inst.id);
      if (r.ok) { state.config = r.config; renderSelected(); }
    });
    card.querySelector('.delete-instance').addEventListener('click', async () => {
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
      list.innerHTML = '<div class="empty-state compact">아직 설치된 콘텐츠가 없습니다. 위에서 검색해서 바로 설치해 보세요.</div>';
      return;
    }
    items.forEach(item => {
      const update = item.projectId ? state.updates.get(item.projectId) : null;
      const row = document.createElement('div');
      row.className = 'content-row';
      const title = item.title || item.displayName;
      const subtitle = item.managed
        ? `${item.versionNumber || '버전 정보 없음'} · Modrinth${item.autoDependency ? ' · 자동 의존성' : ''}`
        : '직접 추가한 파일';
      row.innerHTML = `
        <div class="content-file">
          <strong class="managed-name">${escapeHtml(title)}</strong>
          <small>${escapeHtml(subtitle)}</small>
          <div class="content-tags">
            <span class="tiny-tag">${item.enabled ? '사용 중' : '사용 안 함'}</span>
            ${item.autoDependency ? '<span class="tiny-tag dep">필수 의존성</span>' : ''}
            ${update ? `<span class="tiny-tag">${escapeHtml(update.latestVersion)} 업데이트</span>` : ''}
          </div>
        </div>
        ${update && !item.autoDependency ? '<button class="update-one">업데이트</button>' : '<span></span>'}
        <button class="toggle ${item.enabled ? 'on' : ''}" title="켜기/끄기"></button>
        <button class="delete-file" title="${item.autoDependency ? '상위 모드를 삭제하면 자동으로 같이 정리됩니다.' : '삭제'}" ${item.autoDependency ? 'disabled' : ''}>×</button>`;
      row.querySelector('.toggle').addEventListener('click', async () => {
        await api.toggleContent(inst.id, state.contentType, item.name);
        renderContent();
      });
      row.querySelector('.delete-file')?.addEventListener('click', async () => {
        if (item.autoDependency) { toast('이 파일은 다른 모드의 필수 의존성입니다. 상위 모드를 삭제하면 필요 여부를 확인해 자동으로 정리됩니다.', true); return; }
        const msg = item.managed
          ? `${title}을(를) 삭제할까요?\n이 프로젝트 때문에 자동 설치된 불필요한 의존성도 같이 정리됩니다.`
          : `${item.displayName} 파일을 삭제할까요?`;
        if (!confirm(msg)) return;
        const r = await api.deleteContent(inst.id, state.contentType, item.name);
        if (!r.ok) toast(r.error || '삭제 실패', true);
        else toast(`${title} 삭제 완료`);
        await renderContent();
        await refreshSearchInstalledFlags();
      });
      row.querySelector('.update-one')?.addEventListener('click', async () => {
        const btn = row.querySelector('.update-one');
        btn.disabled = true; btn.textContent = '업데이트 중…';
        const r = await api.modrinthUpdate(inst.id, item.projectId);
        if (r.ok) {
          toast(`${title} 업데이트 완료`);
          state.updates.delete(item.projectId);
          await renderContent();
          updateBanner();
        } else {
          btn.disabled = false; btn.textContent = '업데이트'; toast(r.error || '업데이트 실패', true);
        }
      });
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state compact">목록 오류: ${escapeHtml(e.message)}</div>`;
  }
}
function contentCopy() {
  const map = {
    mods: ['모드 파일을 여기에 끌어놓으세요', '.jar 파일을 직접 넣어야 할 때만 사용하세요. 일반적으로 위 Modrinth 검색을 이용하는 것이 편합니다.'],
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
    instances:['인스턴스','버전과 모드 로더가 다른 Minecraft 환경을 각각 따로 관리하세요.'],
    content:['모드 & 콘텐츠','Modrinth에서 검색하고 현재 인스턴스에 바로 설치하세요.'],
    settings:['설정','메모리와 계정 설정을 관리합니다.']
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

function openModal() {
  $('#instanceModal').classList.remove('hidden');
  $('#instanceNameInput').value = '';
  state.loaderChoice = 'vanilla';
  $$('.loader-option').forEach(b => b.classList.toggle('active', b.dataset.loader === 'vanilla'));
  $('#instanceNameInput').focus();
}
function closeModal() { $('#instanceModal').classList.add('hidden'); }
async function login() {
  if (state.account) { toast(`${state.account.name} 계정으로 로그인되어 있습니다.`); return; }
  setStatus('Microsoft 로그인 중…', 0);
  const r = await api.loginMicrosoft();
  if (r.ok) { state.account = r.account; renderAccount(); }
  else toast(r.error || '로그인 실패', true);
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
  const inst = currentInstance();
  const box = $('#modrinthResults');
  if (!inst) {
    box.innerHTML = '<div class="empty-state compact">먼저 인스턴스를 선택해 주세요.</div>';
    return;
  }
  if (state.searchBusy) return;
  state.searchBusy = true;
  $('#modrinthSearchBtn').disabled = true;
  box.innerHTML = '<div class="loading-card">Modrinth에서 호환되는 콘텐츠를 찾는 중…</div>';
  const q = $('#modrinthSearchInput').value.trim();
  const r = await api.modrinthSearch(inst.id, state.contentType, q);
  state.searchBusy = false;
  $('#modrinthSearchBtn').disabled = false;
  if (!r.ok) {
    box.innerHTML = `<div class="empty-state compact">${escapeHtml(r.error || '검색 실패')}</div>`;
    return;
  }
  renderSearchResults(r.results || []);
}
function renderSearchResults(results) {
  const box = $('#modrinthResults');
  box.innerHTML = '';
  if (!results.length) {
    box.innerHTML = '<div class="empty-state compact">현재 인스턴스와 호환되는 검색 결과가 없습니다.</div>';
    return;
  }
  results.forEach(item => {
    const card = document.createElement('div');
    card.className = 'market-item';
    const icon = item.iconUrl
      ? `<img class="market-icon" src="${escapeHtml(item.iconUrl)}" alt="" />`
      : '<div class="market-icon placeholder">MC</div>';
    card.innerHTML = `
      ${icon}
      <div class="market-main">
        <div class="market-title-row"><div><div class="market-title">${escapeHtml(item.title)}</div><div class="market-author">by ${escapeHtml(item.author || 'unknown')}</div></div></div>
        <div class="market-desc">${escapeHtml(item.description || '')}</div>
        <div class="market-meta"><small class="download-count">↓ ${formatDownloads(item.downloads)}</small><button class="primary install-btn" ${item.installed ? 'disabled' : ''}>${item.installed ? '설치됨' : '설치'}</button></div>
      </div>`;
    const btn = card.querySelector('.install-btn');
    if (!item.installed) btn.addEventListener('click', async () => {
      const inst = currentInstance(); if (!inst) return;
      btn.disabled = true; btn.textContent = '설치 중…';
      const r = await api.modrinthInstall(inst.id, item.projectId);
      if (r.ok) {
        btn.textContent = '설치됨'; item.installed = true;
        toast(`${r.title || item.title} ${r.version ? `(${r.version}) ` : ''}설치 완료`);
        await renderContent();
      } else {
        btn.disabled = false; btn.textContent = '설치'; toast(r.error || '설치 실패', true);
      }
    });
    box.appendChild(card);
  });
}
async function refreshSearchInstalledFlags() {
  // 현재 검색을 다시 실행해서 설치/미설치 버튼 상태까지 동기화
  if ($('#view-content').classList.contains('active')) await searchModrinth();
}
function updateBanner() {
  const banner = $('#updateBanner');
  const count = state.updates.size;
  if (!count) { banner.classList.add('hidden'); return; }
  $('#updateText').textContent = `업데이트 가능한 콘텐츠가 ${count}개 있습니다.`;
  banner.classList.remove('hidden');
}
async function checkUpdates(showNoUpdateToast = true) {
  const inst = currentInstance(); if (!inst) return;
  $('#checkUpdatesBtn').disabled = true; $('#checkUpdatesBtn').textContent = '확인 중…';
  const r = await api.modrinthCheckUpdates(inst.id);
  $('#checkUpdatesBtn').disabled = false; $('#checkUpdatesBtn').textContent = '업데이트 확인';
  if (!r.ok) { toast(r.error || '업데이트 확인 실패', true); return; }
  state.updates = new Map((r.updates || []).map(u => [u.projectId, u]));
  updateBanner(); await renderContent();
  if (!state.updates.size && showNoUpdateToast) toast('설치된 Modrinth 콘텐츠가 모두 최신입니다.');
  else if (state.updates.size) toast(`${state.updates.size}개의 업데이트를 찾았습니다.`);
}

async function launch() {
  const inst = currentInstance();
  if (!inst) { toast('실행할 인스턴스가 없습니다.', true); return; }
  state.launching = true; $('#launchBtn').disabled = true; $('#launchBtn').textContent = '준비 중…';
  setStatus('Minecraft 준비 중…', 1); appendLog('Minecraft 실행을 준비하고 있습니다…');
  const r = await api.launchGame(inst.id);
  if (!r.ok) {
    if (r.needLogin) { toast('Microsoft 로그인이 필요합니다.', true); await login(); }
    else toast(r.error || '실행 실패', true);
    state.launching = false; $('#launchBtn').disabled = false; $('#launchBtn').textContent = '▶ 게임 실행';
  }
}

$$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$('#goInstancesBtn').addEventListener('click', () => switchView('instances'));
$('#newInstanceBtn').addEventListener('click', openModal);
$('#closeModalBtn').addEventListener('click', closeModal);
$('#cancelModalBtn').addEventListener('click', closeModal);
$('#instanceModal').addEventListener('click', e => { if (e.target.id === 'instanceModal') closeModal(); });
$$('.loader-option').forEach(b => b.addEventListener('click', () => {
  state.loaderChoice = b.dataset.loader;
  $$('.loader-option').forEach(x => x.classList.toggle('active', x === b));
}));
$('#createInstanceBtn').addEventListener('click', async () => {
  const name = $('#instanceNameInput').value.trim();
  const version = $('#versionSelect').value;
  const r = await api.createInstance({ name, version, loader: state.loaderChoice });
  if (!r.ok) { toast(r.error || '만들기 실패', true); return; }
  state.config = r.config; closeModal(); renderSelected(); switchView('play'); toast(`${r.instance.name} 인스턴스를 만들었습니다.`);
});
$('#instanceNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#createInstanceBtn').click(); });
$('#loginBtn').addEventListener('click', login);
$('#settingsLoginBtn').addEventListener('click', login);
$('#logoutBtn').addEventListener('click', async () => { await api.logout(); state.account = null; renderAccount(); toast('로그아웃했습니다.'); });
$('#launchBtn').addEventListener('click', launch);

$$('.quick-add').forEach(b => b.addEventListener('click', () => {
  selectContentType(b.dataset.type, false);
  switchView('content');
  $('#modrinthSearchInput').focus();
}));
$$('.content-tab').forEach(b => b.addEventListener('click', () => selectContentType(b.dataset.type)));
$('#modrinthSearchBtn').addEventListener('click', searchModrinth);
$('#modrinthSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchModrinth(); });
$('#checkUpdatesBtn').addEventListener('click', () => checkUpdates(true));
$('#updateAllBtn').addEventListener('click', async () => {
  const inst = currentInstance(); if (!inst) return;
  const btn = $('#updateAllBtn'); btn.disabled = true; btn.textContent = '업데이트 중…';
  const r = await api.modrinthUpdateAll(inst.id);
  btn.disabled = false; btn.textContent = '모두 업데이트';
  if (!r.ok) { toast(r.error || '일괄 업데이트 실패', true); return; }
  toast(`${r.count}개 콘텐츠 업데이트 완료`);
  state.updates = new Map(); updateBanner(); await renderContent(); await refreshSearchInstalledFlags();
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
  const files = [...e.dataTransfer.files];
  const paths = files.map(f => { try { return api.getFilePath(f); } catch { return null; } }).filter(Boolean);
  if (!paths.length) { toast('파일 경로를 읽지 못했습니다. 파일 선택 버튼을 사용해 주세요.', true); return; }
  const r = await api.addContentPaths(inst.id, state.contentType, paths);
  if (r.added?.length) toast(`${r.added.length}개 파일을 추가했습니다.`);
  if (r.skipped?.length) toast(`지원하지 않는 파일 ${r.skipped.length}개는 건너뛰었습니다.`, true);
  renderContent();
});

$('#minRam').addEventListener('input', () => $('#minRamValue').textContent = `${$('#minRam').value} GB`);
$('#maxRam').addEventListener('input', () => $('#maxRamValue').textContent = `${$('#maxRam').value} GB`);
$('#saveMemoryBtn').addEventListener('click', async () => {
  let min = Number($('#minRam').value), max = Number($('#maxRam').value);
  if (max < min) { max = min; $('#maxRam').value = max; $('#maxRamValue').textContent = `${max} GB`; }
  const r = await api.updateMemory(min, max); state.config = r.config; toast('메모리 설정을 저장했습니다.');
});

api.onAccountChanged(account => { state.account = account; renderAccount(); });
api.onStatus(s => { if (s?.text) { setStatus(s.text); if (s.kind === 'error') toast(s.text, true); } });
api.onLaunchProgress(p => { if (p?.text) setStatus(p.text, p.percent ?? null); if (p?.text) appendLog(p.text); });
api.onGameLog(line => appendLog(line));
api.onLaunchError(message => {
  state.launching = false; $('#launchBtn').textContent = '▶ 게임 실행'; $('#launchBtn').disabled = !currentInstance();
  setStatus('실행 오류', 0); toast(message, true); appendLog(`ERROR: ${message}`);
});
api.onLaunchClosed(() => {
  state.launching = false; $('#launchBtn').textContent = '▶ 게임 실행'; $('#launchBtn').disabled = !currentInstance();
  setStatus('게임 종료', 0); appendLog('Minecraft가 종료되었습니다.');
});
api.onContentProgress(info => { if (info?.text) toast(info.text); });

(async function init() {
  const boot = await api.bootstrap();
  state.config = boot.config; state.account = boot.account;
  $('#appVersion').textContent = `v${boot.appVersion}`;
  $('#minRam').value = state.config.memory?.min || 2; $('#maxRam').value = state.config.memory?.max || 6;
  $('#minRamValue').textContent = `${$('#minRam').value} GB`; $('#maxRamValue').textContent = `${$('#maxRam').value} GB`;
  renderAccount(); renderSelected(); contentCopy();
  const vr = await api.fetchVersions(); state.versions = vr.versions || []; state.latest = vr.latest || 'latest_release';
  const sel = $('#versionSelect'); sel.innerHTML = '';
  const newest = document.createElement('option'); newest.value = state.latest; newest.textContent = `최신 릴리스 (${state.latest})`; sel.appendChild(newest);
  state.versions.filter(v => v !== state.latest).forEach(v => {
    const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
  });
})();
