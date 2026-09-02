const api = window.launcherAPI;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {
  config: { instances: [], selectedInstanceId: null },
  account: null,
  appVersion: '0.4.8',
  versions: [],
  latest: 'latest_release',
  contentType: 'mods',
  capabilities: { irisInstalled: false },
  launchState: 'idle',
  activeInstanceId: null,
  update: { state: 'idle', percent: 0 },
  updatePromptDismissed: false,
  editingInstanceId: null,
  searchResults: [],
  installedItems: [],
  selectedContent: new Set()
};

function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function currentInstance() { return state.config.instances.find(i => i.id === state.config.selectedInstanceId) || null; }
function loaderLabel(v) { return ({vanilla:'Vanilla',fabric:'Fabric',forge:'Forge',neoforge:'NeoForge',quilt:'Quilt'})[v] || v || 'Vanilla'; }
function toast(message, error=false) {
  const el = $('#toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), error ? 5000 : 2800);
}
function switchView(view) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  const copy = {
    home:['EASYCRAFT PLAY','Minecraft를 시작하세요'],
    content:['MODRINTH LIBRARY','콘텐츠를 찾고 바로 적용하세요'],
    settings:['EASYCRAFT SETTINGS','런처와 인스턴스를 관리하세요']
  }[view];
  $('#pageKicker').textContent = copy[0]; $('#pageTitle').textContent = copy[1];
  if (view === 'content') { refreshCapabilities().then(async () => { await renderContent(); await searchContent(); }); }
  if (view === 'settings') renderSettings();
}

function renderAccount() {
  const account = state.account;
  $('#accountName').textContent = account?.name || '로그인 필요';
  $('#accountSub').textContent = account ? 'Microsoft 연결됨' : 'Microsoft 계정';
  const avatar=$('#accountAvatar');
  const faceUrl = account?.faceUrl || null;
  const overlayUrl = account?.faceOverlayUrl || null;
  avatar.textContent = faceUrl ? '' : (account?.name?.trim()?.[0]?.toUpperCase() || '?');
  avatar.classList.toggle('skin-head', !!faceUrl);
  avatar.style.backgroundImage = faceUrl ? `${overlayUrl ? `url("${String(overlayUrl).replace(/["\\]/g,'')}"), ` : ''}url("${String(faceUrl).replace(/["\\]/g,'')}")` : '';
  $('#railLoginBtn').classList.toggle('hidden', !!account);
  $('#railLogoutBtn').classList.toggle('hidden', !account);
  $('#settingsLoginBtn').classList.toggle('hidden', !!account);
  $('#settingsLogoutBtn').classList.toggle('hidden', !account);
  $('#settingsAccountName').textContent = account ? `${account.name} 계정으로 로그인됨` : 'Microsoft 계정이 연결되지 않았습니다.';
}
function renderHero() {
  const inst = currentInstance();
  $('#selectedChip').textContent = inst ? inst.name : '인스턴스 없음';
  $('#heroName').textContent = inst?.name || 'Minecraft를 준비해 볼까요?';
  $('#heroBadge').textContent = inst ? `${loaderLabel(inst.loader)} 인스턴스` : '새 인스턴스를 만들어 시작하세요';
  $('#heroMeta').textContent = inst ? `Minecraft ${inst.version} · ${loaderLabel(inst.loader)}${inst.loader !== 'vanilla' ? ` ${inst.loaderVersion === 'latest' || !inst.loaderVersion ? '(최신 자동)' : inst.loaderVersion}` : ''} · RAM ${inst.settings?.memory?.max || 6}GB` : '버전과 로더를 선택하면 모드까지 인스턴스별로 깔끔하게 관리할 수 있습니다.';
  $('#settingsInstanceName').textContent = inst ? `${inst.name} · Minecraft ${inst.version}` : '인스턴스 없음';
  $('#playBtn').disabled = !inst && state.launchState === 'idle';
  $('#heroSettingsBtn').disabled = !inst;
  $('#heroContentBtn').disabled = !inst;
  $('#openInstanceFolderBtn').disabled = !inst;
  $('#settingsInstanceBtn').disabled = !inst;
  $('#settingsOpenFolderBtn').disabled = !inst;
  renderPlayButton();
}
function renderPlayButton() {
  const btn = $('#playBtn');
  if (state.launchState === 'preparing') btn.textContent = '■ 준비 중지';
  else if (state.launchState === 'stopping') btn.textContent = '중지 요청됨';
  else if (state.launchState === 'running') btn.textContent = '■ 게임 종료';
  else btn.textContent = '▶ 게임 실행';
  btn.disabled = !currentInstance();
}
function renderInstances() {
  const grid = $('#instanceGrid'); grid.innerHTML = '';
  if (!state.config.instances.length) {
    grid.innerHTML = '<div class="empty-card">아직 인스턴스가 없습니다.<br>오른쪽의 <b>새 인스턴스</b>를 눌러 만들어 주세요.</div>';
    return;
  }
  for (const inst of state.config.instances) {
    const card = document.createElement('article');
    card.className = `instance-card${inst.id === state.config.selectedInstanceId ? ' selected' : ''}`;
    card.innerHTML = `<button class="instance-menu" title="설정">•••</button><span class="instance-loader">${esc(loaderLabel(inst.loader))}</span><h3>${esc(inst.name)}</h3><p>Minecraft ${esc(inst.version)}${inst.loader !== 'vanilla' ? ` · ${esc(inst.loaderVersion === 'latest' || !inst.loaderVersion ? '로더 최신 자동' : inst.loaderVersion)}` : ''} · RAM ${esc(inst.settings?.memory?.max || 6)}GB</p>`;
    card.addEventListener('click', async e => {
      if (e.target.closest('.instance-menu')) return;
      const r = await api.selectInstance(inst.id); if (r.ok) { state.config = r.config; await refreshCapabilities(); renderAll(); }
    });
    card.querySelector('.instance-menu').addEventListener('click', e => { e.stopPropagation(); openInstanceModal(inst.id); });
    grid.appendChild(card);
  }
}
async function refreshCapabilities() {
  const inst = currentInstance();
  if (!inst) { state.capabilities = { irisInstalled:false }; renderShaderVisibility(); return; }
  const r = await api.instanceCapabilities(inst.id);
  state.capabilities = r?.ok ? r : { irisInstalled:false };
  renderShaderVisibility();
}
function renderShaderVisibility() {
  const show = !!state.capabilities.irisInstalled;
  $('#shaderTab').classList.toggle('hidden', !show);
  $('#shaderQuick').classList.toggle('hidden', !show);
  if (!show && state.contentType === 'shaderpacks') state.contentType = 'mods';
  $$('.content-tab').forEach(b => b.classList.toggle('active', b.dataset.type === state.contentType));
}
function renderAll() { renderAccount(); renderHero(); renderInstances(); renderSettings(); renderShaderVisibility(); }

function fillVersionSelect(select, value) {
  const versions = state.versions.length ? state.versions : ['latest_release'];
  select.innerHTML = '';
  const wanted = value || state.latest || versions[0];
  for (const v of versions) { const o=document.createElement('option'); o.value=v; o.textContent=v === 'latest_release' ? '최신 정식 버전' : v; select.appendChild(o); }
  if (![...select.options].some(o => o.value === wanted)) { const o=document.createElement('option'); o.value=wanted; o.textContent=wanted; select.prepend(o); }
  select.value = wanted;
}
async function fillLoaderVersionSelect(loader, minecraftVersion, select, wrap, wanted='latest', autoWrap=null) {
  const enabled = loader && loader !== 'vanilla';
  wrap.classList.toggle('hidden', !enabled);
  if (autoWrap) autoWrap.classList.toggle('hidden', !enabled);
  if (!enabled) { select.innerHTML='<option value="latest">최신 자동</option>'; select.value='latest'; return; }
  select.disabled = true;
  select.innerHTML = '<option value="latest">불러오는 중…</option>';
  const r = await api.fetchLoaderVersions(loader, minecraftVersion);
  select.innerHTML = '';
  const automatic = document.createElement('option'); automatic.value='latest'; automatic.textContent = r?.latest ? `최신 자동 (${r.latest})` : '최신 자동'; select.appendChild(automatic);
  for (const item of r?.versions || []) {
    const o=document.createElement('option'); o.value=item.version; o.textContent=`${item.version}${item.stable===false?' · 실험':''}`; select.appendChild(o);
  }
  const desired = wanted || 'latest';
  const hasDesired = [...select.options].some(o=>o.value===desired);
  if (desired !== 'latest' && !hasDesired && !r?.ok) { const o=document.createElement('option'); o.value=desired; o.textContent=`${desired} · 기존 선택`; select.prepend(o); }
  select.value = [...select.options].some(o=>o.value===desired) ? desired : 'latest';
  select.disabled = false;
}
async function syncCreateLoaderVersion(wanted='latest') {
  await fillLoaderVersionSelect($('#createLoader').value, $('#createVersion').value, $('#createLoaderVersion'), $('#createLoaderVersionWrap'), wanted);
}
async function syncEditLoaderVersion(wanted=null) {
  const inst=state.config.instances.find(i=>i.id===state.editingInstanceId);
  await fillLoaderVersionSelect($('#editLoader').value, $('#editVersion').value, $('#editLoaderVersion'), $('#editLoaderVersionWrap'), wanted ?? inst?.loaderVersion ?? 'latest', $('#editAutoLoaderWrap'));
}
function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }
function openCreateModal() { $('#createName').value=''; fillVersionSelect($('#createVersion'), state.latest || state.versions[0]); $('#createLoader').value='vanilla'; syncCreateLoaderVersion('latest'); openModal('createModal'); setTimeout(()=>$('#createName').focus(),50); }
function openInstanceModal(id = currentInstance()?.id) {
  const inst = state.config.instances.find(i => i.id === id); if (!inst) return toast('인스턴스를 먼저 선택해 주세요.', true);
  state.editingInstanceId = id;
  $('#editName').value = inst.name; fillVersionSelect($('#editVersion'), inst.version); $('#editLoader').value=inst.loader;
  const s=inst.settings||{}; $('#editAutoContent').checked=s.autoUpdateContent!==false; $('#editAutoMinecraftVersion').checked=!!s.autoUpdateMinecraftVersion; $('#editAutoLoaderVersion').checked=s.autoUpdateLoaderVersion!==false; $('#editMinRam').value=s.memory?.min||2; $('#editMaxRam').value=s.memory?.max||6; $('#editWidth').value=s.screen?.width||1280; $('#editHeight').value=s.screen?.height||720; $('#editFullscreen').checked=!!s.screen?.fullscreen; $('#editJavaPath').value=s.javaPath||''; $('#editJvmArgs').value=s.jvmArgs||''; $('#editGameArgs').value=s.gameArgs||'';
  $('#instanceVersionHint').textContent='Minecraft와 모드 로더의 최신 버전을 확인할 수 있습니다.';
  syncEditLoaderVersion(inst.loaderVersion || 'latest');
  openModal('instanceModal');
}

async function login() {
  const r = await api.loginMicrosoft();
  if (!r.ok) toast(r.error || '로그인하지 못했습니다.', true); else { state.account=r.account; renderAccount(); }
}
async function logout() {
  if (!state.account) return;
  if (!confirm(`${state.account.name} 계정에서 로그아웃할까요?`)) return;
  const r=await api.logout(); if (r.ok) { state.account=null; renderAccount(); toast('로그아웃했습니다.'); }
}

async function launchOrStop() {
  const inst=currentInstance(); if (!inst) return toast('인스턴스를 먼저 만들어 주세요.', true);
  if (['preparing','running','stopping'].includes(state.launchState)) {
    if (state.launchState === 'stopping') return;
    state.launchState='stopping'; renderPlayButton(); showLaunchPop('Minecraft 중지 중','실행 준비와 게임 프로세스를 종료하고 있습니다.',null,true);
    const r=await api.stopGame(inst.id);
    if(!r.ok){toast(r.error||'중지하지 못했습니다.',true); state.launchState='idle'; renderPlayButton();}
    else if(r.immediate){state.launchState='idle';state.activeInstanceId=null;renderPlayButton();hideLaunchPop();toast('Minecraft 중지를 요청했습니다.');}
    return;
  }
  if (!state.account) { toast('먼저 Microsoft 계정으로 로그인해 주세요.', true); return login(); }
  state.launchState='preparing'; state.activeInstanceId=inst.id; renderPlayButton(); showLaunchPop('Minecraft 준비 중',`${inst.name}을(를) 준비하고 있습니다.`,2,true);
  const r=await api.launchGame(inst.id);
  if(!r.ok){ state.launchState='idle'; renderPlayButton(); hideLaunchPop(); if(r.needLogin){state.account=null;renderAccount();} toast(r.error||'Minecraft를 실행하지 못했습니다.',true); return; }
  if(r.config){ state.config=r.config; renderHero(); renderInstances(); }
  if(r.versionChanges?.length) toast(`자동 업데이트: ${r.versionChanges.join(' · ')}`);
}
function showLaunchPop(title,text,percent=null,showStop=true){ const el=$('#launchPop'); el.classList.remove('hidden'); $('#launchPopTitle').textContent=title; $('#launchPopText').textContent=text||''; if(percent!==null) $('#launchProgress').style.width=`${Math.max(0,Math.min(100,percent))}%`; $('#launchPopStopBtn').classList.toggle('hidden',!showStop); }
function hideLaunchPop(){ $('#launchPop').classList.add('hidden'); $('#launchProgress').style.width='0%'; }
function applyLaunchState(v={}) {
  state.launchState=v.state||'idle'; state.activeInstanceId=v.instanceId||state.activeInstanceId; renderPlayButton();
  if(state.launchState==='preparing') showLaunchPop('Minecraft 준비 중',v.name?`${v.name}을(를) 준비하고 있습니다.`:'필요한 파일을 확인하고 있습니다.',2,true);
  else if(state.launchState==='stopping'){showLaunchPop('Minecraft 중지 중','종료 요청을 보냈습니다.',null,false);clearTimeout(applyLaunchState._stopT);applyLaunchState._stopT=setTimeout(hideLaunchPop,350);}
  else if(state.launchState==='running'){ showLaunchPop('Minecraft 실행됨',v.name?`${v.name}이(가) 실행 중입니다.`:'게임이 실행 중입니다.',100,false); clearTimeout(applyLaunchState._t); applyLaunchState._t=setTimeout(hideLaunchPop,1800); }
  else { hideLaunchPop(); state.activeInstanceId=null; }
}

async function renderContent() {
  const inst=currentInstance();
  $('#contentContext').textContent=inst?`${inst.name} · Minecraft ${inst.version} · ${loaderLabel(inst.loader)}`:'먼저 홈에서 인스턴스를 선택해 주세요.';
  $('#searchInput').disabled=!inst; $('#searchBtn').disabled=!inst; $('#contentUpdatesBtn').disabled=!inst; $('#contentFolderBtn').disabled=!inst; $('#pickLocalContentBtn').disabled=!inst;
  renderShaderVisibility();
  if(!inst){
    state.installedItems=[]; state.selectedContent.clear();
    $('#installedCount').textContent='0';
    $('#searchResults').innerHTML='<div class="empty">인스턴스를 선택하면 콘텐츠를 검색할 수 있습니다.</div>';
    $('#installedList').innerHTML='<div class="empty">인스턴스가 선택되지 않았습니다.</div>';
    syncBulkControls();
    return;
  }
  const items=await api.listContent(inst.id,state.contentType);
  state.installedItems=items||[];
  const validKeys=new Set(state.installedItems.filter(i=>!i.autoDependency).map(contentSelectionKey));
  for(const key of [...state.selectedContent]) if(!validKeys.has(key)) state.selectedContent.delete(key);
  $('#installedCount').textContent=String(state.installedItems.length);
  const list=$('#installedList'); list.innerHTML='';
  if(!state.installedItems.length){
    list.innerHTML='<div class="empty">설치된 콘텐츠가 없습니다.</div>';
  } else for(const item of state.installedItems){
    const key=contentSelectionKey(item);
    const selectable=!item.autoDependency;
    const selected=state.selectedContent.has(key);
    const row=document.createElement('div'); row.className=`installed-item${selected?' selected':''}${item.autoDependency?' dependency':''}`;
    row.dataset.key=key;
    const selector=selectable
      ? `<label class="item-check" title="선택"><input type="checkbox" class="select-installed" ${selected?'checked':''}></label>`
      : '<span class="dependency-lock" title="다른 모드가 필요로 하는 필수 의존성">필수</span>';
    row.innerHTML=`${selector}${item.iconUrl?`<img class="result-icon" src="${esc(item.iconUrl)}" alt="">`:`<div class="result-placeholder">${state.contentType==='mods'?'M':state.contentType==='resourcepacks'?'R':'S'}</div>`}<div class="item-copy"><strong>${esc(item.title||item.displayName)}</strong><span>${item.managed?`Modrinth${item.versionNumber?` · ${esc(item.versionNumber)}`:''}${item.autoDependency?' · 필수 의존성':''}`:'직접 추가한 파일'} · ${item.enabled?'사용 중':'꺼짐'}</span></div><div class="item-actions"><button class="btn subtle small toggle">${item.enabled?'끄기':'켜기'}</button>${item.managed&&!item.autoDependency?'<button class="btn subtle small update">업데이트</button>':''}<button class="btn danger small remove" ${item.autoDependency?'disabled title="필요한 모드를 먼저 삭제해 주세요."':''}>삭제</button></div>`;
    row.querySelector('.select-installed')?.addEventListener('change',e=>{
      if(e.currentTarget.checked) state.selectedContent.add(key); else state.selectedContent.delete(key);
      row.classList.toggle('selected',e.currentTarget.checked); syncBulkControls();
    });
    row.querySelector('.toggle').addEventListener('click',async()=>{const r=await api.toggleContent(inst.id,state.contentType,item.name);if(!r.ok)toast(r.error||'변경 실패',true);await refreshCapabilities();await renderContent();});
    row.querySelector('.update')?.addEventListener('click',async e=>{e.target.disabled=true;e.target.textContent='확인 중…';const r=await api.modrinthUpdate(inst.id,item.projectId);if(!r.ok)toast(r.error||'업데이트 실패',true);else toast('업데이트를 적용했습니다.');await refreshCapabilities();await renderContent();});
    row.querySelector('.remove')?.addEventListener('click',async()=>{if(item.autoDependency)return;if(!confirm(`${item.title||item.displayName}을(를) 삭제할까요?`))return;const r=await api.deleteContent(inst.id,state.contentType,item.name);if(!r.ok)return toast(r.error||'삭제 실패',true);state.selectedContent.delete(key);await refreshCapabilities();await renderContent();toast(r.retainedAsDependency?'다른 모드에서 필요해 파일은 의존성으로 유지했습니다.':'삭제했습니다.');});
    list.appendChild(row);
  }
  syncSearchInstalledFlags();
  syncBulkControls();
}
function contentSelectionKey(item){return item.projectId?`project:${item.projectId}`:`file:${item.name}`;}
function selectedInstalledItems(){const keys=state.selectedContent;return state.installedItems.filter(i=>keys.has(contentSelectionKey(i))&&!i.autoDependency);}
function syncSearchInstalledFlags(){
  const installedProjects=new Set(state.installedItems.filter(i=>i.projectId).map(i=>i.projectId));
  for(const item of state.searchResults) item.installed=installedProjects.has(item.projectId);
  if($('#view-content').classList.contains('active')) renderSearchResults();
}
function syncBulkControls(){
  const selectable=state.installedItems.filter(i=>!i.autoDependency);
  const selected=selectedInstalledItems();
  const selectAll=$('#selectAllInstalled');
  selectAll.disabled=!selectable.length;
  selectAll.checked=!!selectable.length && selected.length===selectable.length;
  selectAll.indeterminate=selected.length>0 && selected.length<selectable.length;
  const updatable=selected.filter(i=>i.managed&&i.projectId);
  $('#updateSelectedContentBtn').disabled=!updatable.length;
  $('#deleteSelectedContentBtn').disabled=!selected.length;
  $('#updateAllContentBtn').disabled=!state.installedItems.some(i=>i.managed&&!i.autoDependency&&i.projectId);
  $('#deleteAllContentBtn').disabled=!state.installedItems.length;
}
async function searchContent() {
  const inst=currentInstance(); if(!inst)return;
  const area=$('#searchResults'); area.innerHTML='<div class="empty">검색 중…</div>';
  const r=await api.modrinthSearch(inst.id,state.contentType,$('#searchInput').value.trim());
  if(!r.ok){area.innerHTML=`<div class="empty">${esc(r.error||'검색 실패')}</div>`;return;}
  state.searchResults=r.results||[]; renderSearchResults();
}
let dependencyPromptResolve=null;
function closeDependencyPrompt(answer=false){
  closeModal('dependencyModal');
  const resolve=dependencyPromptResolve; dependencyPromptResolve=null;
  if(resolve) resolve(!!answer);
}
function askDependencyInstall(rootTitle,dependencies=[]){
  if(dependencyPromptResolve) closeDependencyPrompt(false);
  const names=dependencies.map(d=>d.title).filter(Boolean);
  $('#dependencyMessage').textContent=`${rootTitle} 모드를 설치하려면 ${names.join(', ')} 모드가 필요해요. 설치할까요?`;
  $('#dependencyList').innerHTML=dependencies.map(d=>`<div class="dependency-row"><span>＋</span><strong>${esc(d.title)}</strong></div>`).join('');
  openModal('dependencyModal');
  return new Promise(resolve=>{dependencyPromptResolve=resolve;});
}
function renderSearchResults(){
  const area=$('#searchResults');area.innerHTML='';
  if(!state.searchResults.length){area.innerHTML='<div class="empty">검색 결과가 없습니다.</div>';return;}
  for(const item of state.searchResults){
    const row=document.createElement('div');row.className='result-item';
    row.innerHTML=`${item.iconUrl?`<img class="result-icon" src="${esc(item.iconUrl)}" alt="">`:'<div class="result-placeholder">◇</div>'}<div class="item-copy"><strong>${esc(item.title)}</strong><span>${esc(item.author||'')} · ${Number(item.downloads||0).toLocaleString()} 다운로드</span><span>${esc(item.description||'')}</span></div><button class="mod-install-btn ${item.installed?'installed':''} install" ${item.installed?'disabled':''}>${item.installed?'✓ 설치됨':'＋ 설치'}</button>`;
    row.querySelector('.install')?.addEventListener('click',async e=>{
      if(item.installed)return;
      const btn=e.currentTarget;btn.disabled=true;btn.textContent='확인 중…';
      const plan=await api.modrinthInstallPlan(currentInstance().id,item.projectId);
      if(!plan.ok){toast(plan.error||'설치 정보를 확인하지 못했습니다.',true);btn.disabled=false;btn.textContent='＋ 설치';return;}
      let allow=false;
      if(plan.dependencies?.length){
        allow=await askDependencyInstall(plan.rootTitle,plan.dependencies);
        if(!allow){btn.disabled=false;btn.textContent='＋ 설치';return;}
      }
      btn.textContent='설치 중…';
      const r=await api.modrinthInstall(currentInstance().id,item.projectId,allow);
      if(!r.ok){toast(r.error||'설치하지 못했습니다.',true);btn.disabled=false;btn.textContent='＋ 설치';return;}
      toast(`${r.title||item.title} 설치 완료`);item.installed=true;state.selectedContent.clear();await refreshCapabilities();await renderContent();
    });
    area.appendChild(row);
  }
}
async function checkContentUpdates(showLatest=true){const inst=currentInstance();if(!inst)return;const r=await api.modrinthCheckUpdates(inst.id);if(!r.ok)return toast(r.error||'업데이트 확인 실패',true);const strip=$('#contentUpdateStrip');if(!r.updates?.length){strip.classList.add('hidden');if(showLatest)toast('설치된 콘텐츠가 최신 상태입니다.');return;}strip.classList.remove('hidden');$('#contentUpdateText').textContent=`${r.updates.length}개 콘텐츠를 업데이트할 수 있습니다.`;}

function updateSettingsText(u=state.update){ const version=state.appVersion; const title=$('#updateStatusTitle'), text=$('#updateStatusText'), action=$('#settingsUpdateActionBtn'), notes=$('#settingsReleaseNotesBtn'), progress=$('#updateProgress'); progress.style.width=`${u.percent||0}%`; action.classList.add('hidden'); action.dataset.action=''; notes.classList.toggle('hidden', !['available','downloading','downloaded'].includes(u.state)); if(u.state==='latest'){title.textContent='최신 버전입니다';text.textContent=`EasyCraft v${version}을 사용하고 있습니다.`;}else if(u.state==='available'){title.textContent=`v${u.availableVersion} 업데이트 가능`;text.textContent='새 버전을 다운로드하기 전에 GitHub에서 업데이트 내역을 확인할 수 있습니다.';action.textContent='업데이트';action.dataset.action='download';action.classList.remove('hidden');}else if(u.state==='downloading'){title.textContent=`업데이트 다운로드 중 · ${u.percent||0}%`;text.textContent='GitHub Release에서 이번 업데이트의 변경사항을 확인할 수 있습니다.';}else if(u.state==='downloaded'){title.textContent=`v${u.availableVersion} 준비 완료`;text.textContent='업데이트 내역을 확인하거나 재시작해서 새 버전을 적용하세요.';action.textContent='재시작하여 업데이트';action.dataset.action='install';action.classList.remove('hidden');}else if(u.state==='installing'){title.textContent=`v${u.availableVersion||''} 업데이트 적용 중`;text.textContent='작은 업데이트 창에서 설치 진행 상태를 확인할 수 있습니다.';}else if(u.state==='checking'||u.state==='idle'){title.textContent='업데이트 확인 중';text.textContent='최신 버전을 확인하고 있습니다.';}else if(u.state==='dev'){title.textContent='개발 모드';text.textContent='설치된 EXE에서 업데이트를 확인할 수 있습니다.';}else if(u.state==='error'){title.textContent='업데이트 확인 오류';text.textContent=u.error||'업데이트 서버에 연결하지 못했습니다.';}else{title.textContent='업데이트 상태';text.textContent='업데이트 확인 버튼을 눌러 확인할 수 있습니다.';} }
function renderStartupUpdate(u=state.update){ const gate=$('#startupGate'), checking=$('#gateChecking'), avail=$('#gateAvailable'); if(state.updatePromptDismissed){gate.classList.add('hidden');return;} if(u.state==='checking'||u.state==='idle'){gate.classList.remove('hidden');checking.classList.remove('hidden');avail.classList.add('hidden');return;} if(u.state==='available'||u.state==='downloading'||u.state==='downloaded'){gate.classList.remove('hidden');checking.classList.add('hidden');avail.classList.remove('hidden');$('#gateUpdateTitle').textContent=u.state==='downloaded'?`EasyCraft v${u.availableVersion} 준비 완료`:`EasyCraft v${u.availableVersion} 업데이트`;$('#gateUpdateDescription').textContent=u.state==='downloaded'?'재시작하면 새 버전을 바로 사용할 수 있습니다.':u.state==='downloading'?`업데이트를 다운로드하고 있습니다. ${u.percent||0}%`:`현재 v${state.appVersion} → 새 버전 v${u.availableVersion}. 지금 업데이트하시겠어요?`;$('#gateProgressWrap').classList.toggle('hidden',u.state==='available');$('#gateProgress').style.width=`${u.percent||0}%`;$('#gateReleaseNotesBtn').classList.toggle('hidden', !u.availableVersion);$('#updateLaterBtn').disabled=u.state==='downloading';$('#updateNowBtn').disabled=u.state==='downloading';$('#updateNowBtn').textContent=u.state==='downloaded'?'재시작하여 업데이트':u.state==='downloading'?'다운로드 중…':'업데이트';return;} gate.classList.add('hidden');}
function applyUpdateState(u={}){state.update={...state.update,...u};updateSettingsText(state.update);renderStartupUpdate(state.update);}
function renderSettings(){renderAccount();renderHero();updateSettingsText(state.update);}

// navigation
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m){if(m.id==='dependencyModal')closeDependencyPrompt(false);else closeModal(m.id);}}));
$('#newInstanceBtn').addEventListener('click',openCreateModal);
$('#heroSettingsBtn').addEventListener('click',()=>openInstanceModal());
$('#settingsInstanceBtn').addEventListener('click',()=>openInstanceModal());
$('#heroContentBtn').addEventListener('click',()=>{state.contentType='mods';switchView('content');});
$$('.quick-card').forEach(b=>b.addEventListener('click',()=>{state.contentType=b.dataset.content;switchView('content');}));
$('#createConfirmBtn').addEventListener('click',async()=>{const name=$('#createName').value.trim();if(!name)return toast('인스턴스 이름을 입력해 주세요.',true);const btn=$('#createConfirmBtn');btn.disabled=true;const r=await api.createInstance({name,version:$('#createVersion').value,loader:$('#createLoader').value,loaderVersion:$('#createLoader').value==='vanilla'?null:$('#createLoaderVersion').value});btn.disabled=false;if(!r.ok)return toast(r.error||'인스턴스를 만들지 못했습니다.',true);state.config=r.config;closeModal('createModal');await refreshCapabilities();renderAll();toast(`${r.instance.name} 인스턴스를 만들었습니다.`);});
let composing=false;$('#createName').addEventListener('compositionstart',()=>composing=true);$('#createName').addEventListener('compositionend',()=>composing=false);$('#createName').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!composing&&e.keyCode!==229)$('#createConfirmBtn').click();});
$('#createLoader').addEventListener('change',()=>syncCreateLoaderVersion('latest'));
$('#createVersion').addEventListener('change',()=>syncCreateLoaderVersion($('#createLoaderVersion').value||'latest'));
$('#editLoader').addEventListener('change',()=>syncEditLoaderVersion('latest'));
$('#editVersion').addEventListener('change',()=>syncEditLoaderVersion($('#editLoaderVersion').value||'latest'));
$('#checkInstanceVersionsBtn').addEventListener('click',async()=>{const id=state.editingInstanceId;if(!id)return;const el=$('#instanceVersionHint');el.textContent='최신 버전을 확인하고 있습니다…';const r=await api.instanceVersionStatus(id);if(!r.ok){el.textContent=`확인 실패: ${r.error||'알 수 없는 오류'}`;return;}const parts=[];parts.push(r.minecraftUpdateAvailable?`Minecraft ${r.currentMinecraft} → ${r.latestMinecraft} 업데이트 가능`:`Minecraft ${r.currentMinecraft} 최신`);const inst=state.config.instances.find(i=>i.id===id);if(inst?.loader!=='vanilla')parts.push(r.currentLoader==='latest'?`${loaderLabel(inst.loader)}는 최신 자동 선택 중`:r.loaderUpdateAvailable?`${loaderLabel(inst.loader)} ${r.currentLoader} → ${r.latestLoader} 업데이트 가능`:`${loaderLabel(inst.loader)} ${r.currentLoader||'자동'} 최신`);el.textContent=parts.join(' · ');});
$('#pickJavaBtn').addEventListener('click',async()=>{const r=await api.pickJava();if(r.ok)$('#editJavaPath').value=r.path||'';});
$('#saveInstanceBtn').addEventListener('click',async()=>{const id=state.editingInstanceId;if(!id)return;const r=await api.updateInstanceSettings(id,{name:$('#editName').value,version:$('#editVersion').value,loader:$('#editLoader').value,loaderVersion:$('#editLoader').value==='vanilla'?null:$('#editLoaderVersion').value,autoUpdateContent:$('#editAutoContent').checked,autoUpdateMinecraftVersion:$('#editAutoMinecraftVersion').checked,autoUpdateLoaderVersion:$('#editAutoLoaderVersion').checked,memory:{min:$('#editMinRam').value,max:$('#editMaxRam').value},screen:{width:$('#editWidth').value,height:$('#editHeight').value,fullscreen:$('#editFullscreen').checked},javaPath:$('#editJavaPath').value,jvmArgs:$('#editJvmArgs').value,gameArgs:$('#editGameArgs').value});if(!r.ok)return toast(r.error||'설정을 저장하지 못했습니다.',true);state.config=r.config;closeModal('instanceModal');await refreshCapabilities();renderAll();toast('인스턴스 설정을 저장했습니다.');});
$('#deleteInstanceBtn').addEventListener('click',async()=>{const id=state.editingInstanceId;const inst=state.config.instances.find(i=>i.id===id);if(!inst)return;if(!confirm(`${inst.name} 인스턴스를 삭제할까요?\n모드, 월드, 리소스팩 등 이 인스턴스의 파일도 함께 삭제됩니다.`))return;const r=await api.deleteInstance(id);if(!r.ok)return toast(r.error||'삭제 실패',true);state.config=r.config;closeModal('instanceModal');await refreshCapabilities();renderAll();toast('인스턴스를 삭제했습니다.');});
$('#railLoginBtn').addEventListener('click',login);$('#settingsLoginBtn').addEventListener('click',login);$('#railLogoutBtn').addEventListener('click',logout);$('#settingsLogoutBtn').addEventListener('click',logout);
$('#playBtn').addEventListener('click',launchOrStop);$('#launchPopStopBtn').addEventListener('click',launchOrStop);
async function openSelectedInstanceFolder(){
  const i=currentInstance();
  if(!i) return toast('인스턴스를 먼저 선택해 주세요.',true);
  const r=await api.openInstanceFolder(i.id);
  if(!r?.ok) return toast(r?.error||'인스턴스 폴더를 열지 못했습니다.',true);
}
$('#openInstanceFolderBtn').addEventListener('click',openSelectedInstanceFolder);
$('#settingsOpenFolderBtn').addEventListener('click',openSelectedInstanceFolder);
$$('.content-tab').forEach(b=>b.addEventListener('click',async()=>{state.contentType=b.dataset.type;state.selectedContent.clear();$$('.content-tab').forEach(x=>x.classList.toggle('active',x===b));state.searchResults=[];$('#searchInput').value='';await renderContent();await searchContent();}));
$('#searchBtn').addEventListener('click',searchContent);$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')searchContent();});$('#contentFolderBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return toast('인스턴스를 먼저 선택해 주세요.',true);const r=await api.openContentFolder(i.id,state.contentType);if(!r?.ok)toast(r?.error||'콘텐츠 폴더를 열지 못했습니다.',true);});$('#pickLocalContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const r=await api.pickContent(i.id,state.contentType);if(r.added?.length)toast(`${r.added.length}개 파일을 추가했습니다.`);state.selectedContent.clear();await refreshCapabilities();await renderContent();});$('#contentUpdatesBtn').addEventListener('click',()=>checkContentUpdates(true));
$('#selectAllInstalled').addEventListener('change',e=>{const selectable=state.installedItems.filter(i=>!i.autoDependency);state.selectedContent.clear();if(e.currentTarget.checked)for(const item of selectable)state.selectedContent.add(contentSelectionKey(item));renderContent();});
$('#updateSelectedContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const selected=selectedInstalledItems().filter(x=>x.managed&&x.projectId);if(!selected.length)return;const btn=$('#updateSelectedContentBtn');btn.disabled=true;btn.textContent='업데이트 중…';const r=await api.modrinthUpdateBatch(i.id,selected.map(x=>x.projectId));btn.textContent='선택 업데이트';if(!r.ok){syncBulkControls();return toast(r.error||'업데이트 실패',true);}toast(r.count?`${r.count}개 콘텐츠를 업데이트했습니다.`:'선택한 콘텐츠가 모두 최신입니다.');await refreshCapabilities();await renderContent();});
$('#deleteSelectedContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const selected=selectedInstalledItems();if(!selected.length)return;if(!confirm(`선택한 ${selected.length}개 콘텐츠를 삭제할까요?`))return;const btn=$('#deleteSelectedContentBtn');btn.disabled=true;btn.textContent='삭제 중…';const r=await api.deleteContentBatch(i.id,state.contentType,selected.map(x=>x.name));btn.textContent='선택 삭제';if(!r.ok){syncBulkControls();return toast(r.error||'삭제 실패',true);}state.selectedContent.clear();await refreshCapabilities();await renderContent();toast(`${r.count||selected.length}개 콘텐츠를 삭제했습니다.`);});
$('#updateAllContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const btn=$('#updateAllContentBtn');btn.disabled=true;btn.textContent='업데이트 중…';const r=await api.modrinthUpdateAll(i.id,state.contentType);btn.textContent='전체 업데이트';if(!r.ok){syncBulkControls();return toast(r.error||'업데이트 실패',true);}toast(r.count?`${r.count}개 콘텐츠를 업데이트했습니다.`:'설치된 콘텐츠가 모두 최신입니다.');$('#contentUpdateStrip').classList.add('hidden');await refreshCapabilities();await renderContent();});
$('#deleteAllContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i||!state.installedItems.length)return;if(!confirm(`현재 ${state.contentType==='mods'?'모드':state.contentType==='resourcepacks'?'리소스팩':'셰이더'}를 모두 삭제할까요?`))return;const btn=$('#deleteAllContentBtn');btn.disabled=true;btn.textContent='삭제 중…';const r=await api.deleteAllContent(i.id,state.contentType);btn.textContent='전체 삭제';if(!r.ok){syncBulkControls();return toast(r.error||'전체 삭제 실패',true);}state.selectedContent.clear();await refreshCapabilities();await renderContent();toast('전체 삭제가 완료되었습니다.');});
$('#dependencyConfirmBtn').addEventListener('click',()=>closeDependencyPrompt(true));$('#dependencyCancelBtn').addEventListener('click',()=>closeDependencyPrompt(false));$('#dependencyCloseBtn').addEventListener('click',()=>closeDependencyPrompt(false));
async function openReleaseNotes(){const version=state.update.availableVersion;if(!version)return toast('확인할 업데이트 버전이 없습니다.',true);const r=await api.openLauncherReleaseNotes(version);if(!r.ok)toast(r.error||'업데이트 내역을 열지 못했습니다.',true);}
$('#settingsReleaseNotesBtn').addEventListener('click',openReleaseNotes);
$('#gateReleaseNotesBtn').addEventListener('click',openReleaseNotes);
$('#manualUpdateCheckBtn').addEventListener('click',async()=>{const r=await api.checkLauncherUpdate();if(!r.ok)toast(r.error||'업데이트 확인 실패',true);});
$('#settingsUpdateActionBtn').addEventListener('click',async()=>{const action=$('#settingsUpdateActionBtn').dataset.action;const r=action==='install'?await api.installLauncherUpdate():await api.downloadLauncherUpdate();if(!r.ok)toast(r.error||'업데이트 처리 실패',true);});
$('#updateLaterBtn').addEventListener('click',()=>{state.updatePromptDismissed=true;$('#startupGate').classList.add('hidden');});
$('#updateNowBtn').addEventListener('click',async()=>{if(state.update.state==='downloaded'){const r=await api.installLauncherUpdate();if(!r.ok)toast(r.error||'업데이트 적용 실패',true);}else{const r=await api.downloadLauncherUpdate();if(!r.ok)toast(r.error||'업데이트 다운로드 실패',true);}});

api.onAccountChanged(a=>{state.account=a;renderAccount();});
api.onStatus(s=>{if(s?.kind==='error'&&s.text)toast(s.text,true);});
api.onLaunchProgress(p=>{if(state.launchState!=='stopping')showLaunchPop('Minecraft 준비 중',p?.text||'준비 중…',p?.percent??null,true);});
api.onLaunchState(applyLaunchState);
api.onLaunchError(msg=>{state.launchState='idle';renderPlayButton();hideLaunchPop();toast(`Minecraft 실행 실패: ${msg}`,true);});
api.onLaunchClosed(()=>{state.launchState='idle';renderPlayButton();hideLaunchPop();});
api.onContentProgress(info=>{if(info?.text)toast(info.text);});
api.onLauncherUpdateState(applyUpdateState);

(async function init(){
  const boot=await api.bootstrap();state.config=boot.config||state.config;state.account=boot.account||null;state.appVersion=boot.appVersion||'0.4.8';state.update=boot.updateState||state.update;state.launchState=boot.launchState?.state||'idle';state.activeInstanceId=boot.launchState?.instanceId||null;
  $('#versionFoot').textContent=`EasyCraft v${state.appVersion}`;
  renderAll();applyUpdateState(state.update);applyLaunchState(boot.launchState||{state:'idle'});
  const vr=await api.fetchVersions();state.versions=vr.versions||[];state.latest=vr.latest||'latest_release';
  await refreshCapabilities();renderAll();
  // 네트워크/업데이트 서비스가 응답하지 않아도 런처 자체는 열 수 있게 합니다.
  setTimeout(()=>{if(!$('#startupGate').classList.contains('hidden') && ['idle','checking'].includes(state.update.state)){state.updatePromptDismissed=true;$('#startupGate').classList.add('hidden');}},9000);
})();
