const api = window.launcherAPI;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {
  config: { instances: [], selectedInstanceId: null },
  account: null,
  appVersion: '0.4.9',
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
  selectedContent: new Set(),
  detailItem: null
};

function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function currentInstance() { return state.config.instances.find(i => i.id === state.config.selectedInstanceId) || null; }
function loaderLabel(v) { return ({vanilla:'Vanilla',fabric:'Fabric',forge:'Forge',neoforge:'NeoForge',quilt:'Quilt'})[v] || v || 'Vanilla'; }
function contentTypeLabel(v=state.contentType) { return ({mods:'모드',resourcepacks:'리소스팩',shaderpacks:'셰이더',modpacks:'모드팩'})[v] || '콘텐츠'; }
function contentKindLabel(v) { return ({mod:'모드',resourcepack:'리소스팩',shader:'셰이더',modpack:'모드팩'})[v] || '콘텐츠'; }
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
  syncContentHeaderFade(view === 'content' ? $('#view-content').scrollTop : 0, view === 'content');
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
  renderHomeLaunchState();
}
function renderHomeLaunchState(){
  const el=$('#heroLaunchState'), text=$('#heroLaunchStateText');
  if(!el||!text)return;
  if(state.launchState==='running'){el.classList.remove('hidden');el.dataset.state='running';text.textContent='EasyCraft Launcher로 실행됨';}
  else if(state.launchState==='preparing'){el.classList.remove('hidden');el.dataset.state='preparing';text.textContent='EasyCraft Launcher에서 Minecraft 준비 중';}
  else if(state.launchState==='stopping'){el.classList.remove('hidden');el.dataset.state='stopping';text.textContent='Minecraft 종료 중';}
  else{el.classList.add('hidden');delete el.dataset.state;}
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
  state.launchState=v.state||'idle'; state.activeInstanceId=v.instanceId||state.activeInstanceId; renderPlayButton(); renderHomeLaunchState();
  if(state.launchState==='preparing') showLaunchPop('Minecraft 준비 중',v.name?`${v.name}을(를) 준비하고 있습니다.`:'필요한 파일을 확인하고 있습니다.',2,true);
  else if(state.launchState==='stopping'){showLaunchPop('Minecraft 중지 중','종료 요청을 보냈습니다.',null,false);clearTimeout(applyLaunchState._stopT);applyLaunchState._stopT=setTimeout(hideLaunchPop,350);}
  else if(state.launchState==='running'){ showLaunchPop('Minecraft 실행됨',v.name?`${v.name}이(가) 실행 중입니다.`:'게임이 실행 중입니다.',100,false); clearTimeout(applyLaunchState._t); applyLaunchState._t=setTimeout(hideLaunchPop,1800); }
  else { hideLaunchPop(); state.activeInstanceId=null; }
}

async function renderContent() {
  const inst=currentInstance();
  $('#contentContext').textContent=inst?`${inst.name} · Minecraft ${inst.version} · ${loaderLabel(inst.loader)}`:'먼저 홈에서 인스턴스를 선택해 주세요.';
  $('#searchInput').placeholder=`${contentTypeLabel()} 이름을 입력하면 자동으로 검색됩니다`;
  $('#installedTools').classList.toggle('modpack-tools',state.contentType==='modpacks');
  $('#searchInput').disabled=!inst; $('#contentUpdatesBtn').disabled=!inst; $('#contentFolderBtn').disabled=!inst; $('#pickLocalContentBtn').disabled=!inst || state.contentType==='modpacks';
  $('#pickLocalContentBtn').title=state.contentType==='modpacks'?'모드팩은 Modrinth에서 설치해 주세요.':'직접 파일 추가';
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
    const typeIcon=state.contentType==='mods'?'M':state.contentType==='resourcepacks'?'R':state.contentType==='shaderpacks'?'S':'P';
    const toggleButton=state.contentType==='modpacks'?'':`<button class="btn subtle small toggle">${item.enabled?'끄기':'켜기'}</button>`;
    row.innerHTML=`${selector}${item.iconUrl?`<img class="result-icon" src="${esc(item.iconUrl)}" alt="">`:`<div class="result-placeholder">${typeIcon}</div>`}<div class="item-copy"><button class="content-name installed-name" type="button">${esc(item.title||item.displayName)}</button><span>${item.managed?`Modrinth${item.versionNumber?` · ${esc(item.versionNumber)}`:''}${item.autoDependency?' · 필수 의존성':''}`:'직접 추가한 파일'}${state.contentType==='modpacks'?' · 적용됨':` · ${item.enabled?'사용 중':'꺼짐'}`}</span></div><div class="item-actions">${toggleButton}${item.managed&&!item.autoDependency?'<button class="btn subtle small update">업데이트</button>':''}<button class="btn danger small remove" ${item.autoDependency?'disabled title="필요한 모드를 먼저 삭제해 주세요."':''}>삭제</button></div>`;
    row.querySelector('.installed-name')?.addEventListener('click',()=>openContentDetail(item));
    row.querySelector('.select-installed')?.addEventListener('change',e=>{
      if(e.currentTarget.checked) state.selectedContent.add(key); else state.selectedContent.delete(key);
      row.classList.toggle('selected',e.currentTarget.checked); syncBulkControls();
    });
    row.querySelector('.toggle')?.addEventListener('click',async()=>{const r=await api.toggleContent(inst.id,state.contentType,item.name);if(!r.ok)toast(r.error||'변경 실패',true);await refreshCapabilities();await renderContent();});
    row.querySelector('.update')?.addEventListener('click',async e=>{e.target.disabled=true;e.target.textContent='확인 중…';const r=await api.modrinthUpdate(inst.id,item.projectId);if(!r.ok)toast(r.error||'업데이트 실패',true);else{if(r.config){state.config=r.config;renderAll();}toast('업데이트를 적용했습니다.');}await refreshCapabilities();await renderContent();});
    row.querySelector('.remove')?.addEventListener('click',async()=>{if(item.autoDependency)return;const yes=await askConfirm(`${item.title||item.displayName}을(를) 삭제할까요?`,'콘텐츠 삭제');if(!yes)return;const r=await api.deleteContent(inst.id,state.contentType,item.name);if(!r.ok)return toast(r.error||'삭제 실패',true);state.selectedContent.delete(key);await refreshCapabilities();await renderContent();toast(r.retainedAsDependency?'다른 모드에서 필요해 파일은 의존성으로 유지했습니다.':'삭제했습니다.');});
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
let searchSequence=0;
let searchTimer=null;
async function searchContent() {
  const inst=currentInstance(); if(!inst)return;
  const seq=++searchSequence;
  const query=$('#searchInput').value.trim();
  const area=$('#searchResults');
  $('#searchLiveStatus').textContent=query?'검색 중…':'인기순';
  if(!state.searchResults.length) area.innerHTML='<div class="empty">불러오는 중…</div>';
  const r=await api.modrinthSearch(inst.id,state.contentType,query);
  if(seq!==searchSequence)return;
  if(!r.ok){area.innerHTML=`<div class="empty">${esc(r.error||'검색 실패')}</div>`;$('#searchLiveStatus').textContent='오류';return;}
  state.searchResults=r.results||[];
  $('#searchLiveStatus').textContent=query?`${state.searchResults.length}개 결과`:'인기순';
  renderSearchResults();
}
function scheduleContentSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(searchContent,320);}

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

let confirmPromptResolve=null;
function closeConfirmPrompt(answer=false){closeModal('confirmModal');const resolve=confirmPromptResolve;confirmPromptResolve=null;if(resolve)resolve(!!answer);}
function askConfirm(message,title='확인'){
  if(confirmPromptResolve)closeConfirmPrompt(false);
  $('#confirmTitle').textContent=title;$('#confirmMessage').textContent=message;openModal('confirmModal');
  return new Promise(resolve=>{confirmPromptResolve=resolve;});
}

async function openContentDetail(item){
  const inst=currentInstance(); if(!inst)return;
  state.detailItem=item;
  openModal('contentDetailModal');
  $('#contentDetailTitle').textContent=item.title||item.displayName||'콘텐츠 정보';
  $('#contentDetailKind').textContent=contentKindLabel(item.projectType||({mods:'mod',resourcepacks:'resourcepack',shaderpacks:'shader',modpacks:'modpack'})[state.contentType]).toUpperCase();
  $('#contentDetailDescription').textContent=item.description||'상세 정보를 불러오고 있습니다.';
  $('#contentDetailStatus').textContent=item.installed||item.managed?'설치됨':'확인 중';
  $('#contentDetailMeta').innerHTML='';
  const icon=$('#contentDetailIcon'), placeholder=$('#contentDetailPlaceholder');
  if(item.iconUrl){icon.src=item.iconUrl;icon.classList.remove('hidden');placeholder.classList.add('hidden');}else{icon.classList.add('hidden');placeholder.classList.remove('hidden');}
  if(!item.projectId){
    $('#contentDetailStatus').textContent='직접 추가됨';
    $('#contentDetailDescription').textContent='직접 추가한 파일입니다. Modrinth 프로젝트 정보가 연결되어 있지 않습니다.';
    renderDetailActions({...item,installed:true,local:true});return;
  }
  const r=await api.modrinthProjectDetail(inst.id,item.projectId);
  if(!r.ok){$('#contentDetailDescription').textContent=r.error||'상세 정보를 불러오지 못했습니다.';renderDetailActions(item);return;}
  const d={...item,...r.detail};state.detailItem=d;
  $('#contentDetailTitle').textContent=d.title;
  $('#contentDetailKind').textContent=contentKindLabel(d.projectType).toUpperCase();
  $('#contentDetailDescription').textContent=d.description||'설명이 없습니다.';
  $('#contentDetailStatus').textContent=d.updateAvailable?'업데이트 가능':d.installed?'설치됨':'설치 가능';
  if(d.iconUrl){icon.src=d.iconUrl;icon.classList.remove('hidden');placeholder.classList.add('hidden');}
  const meta=[];
  if(d.currentVersion)meta.push(['현재 버전',d.currentVersion]);
  if(d.latestVersion)meta.push(['최신 호환 버전',d.latestVersion]);
  if(Number.isFinite(Number(d.downloads)))meta.push(['다운로드',Number(d.downloads).toLocaleString()]);
  if(d.license)meta.push(['라이선스',d.license]);
  if(d.categories?.length)meta.push(['분류',d.categories.slice(0,5).join(' · ')]);
  $('#contentDetailMeta').innerHTML=meta.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  renderDetailActions(d);
}
function renderDetailActions(d){
  const actions=$('#contentDetailActions');actions.innerHTML='<button class="btn subtle" data-detail-close>닫기</button>';
  actions.querySelector('[data-detail-close]').addEventListener('click',()=>closeModal('contentDetailModal'));
  if(d.local)return;
  if(!d.installed){const b=document.createElement('button');b.className='btn primary';b.textContent='설치';b.addEventListener('click',()=>installFromDetail(b));actions.appendChild(b);}
  else{
    if(d.updateAvailable){const b=document.createElement('button');b.className='btn primary';b.textContent='업데이트';b.addEventListener('click',()=>updateFromDetail(b));actions.appendChild(b);}
    if(!d.autoDependency){const b=document.createElement('button');b.className='btn danger';b.textContent='삭제';b.addEventListener('click',()=>deleteFromDetail(b));actions.appendChild(b);}
  }
}
async function installProject(projectId,title,button=null){
  const inst=currentInstance();if(!inst)return false;
  if(button){button.disabled=true;button.textContent='확인 중…';}
  const plan=await api.modrinthInstallPlan(inst.id,projectId);
  if(!plan.ok){toast(plan.error||'설치 정보를 확인하지 못했습니다.',true);if(button){button.disabled=false;button.textContent='설치';}return false;}
  let allow=false;
  if(plan.dependencies?.length){allow=await askDependencyInstall(plan.rootTitle,plan.dependencies);if(!allow){if(button){button.disabled=false;button.textContent='설치';}return false;}}
  if(button)button.textContent='설치 중…';
  const r=await api.modrinthInstall(inst.id,projectId,allow);
  if(!r.ok){toast(r.error||'설치하지 못했습니다.',true);if(button){button.disabled=false;button.textContent='설치';}return false;}
  if(r.config){state.config=r.config;renderAll();}
  toast(`${r.title||title} 설치 완료`);state.selectedContent.clear();await refreshCapabilities();await renderContent();await searchContent();return true;
}
async function installFromDetail(button){const d=state.detailItem;if(!d?.projectId)return;if(await installProject(d.projectId,d.title,button))await openContentDetail({...d,installed:true});}
async function updateFromDetail(button){const d=state.detailItem;if(!d?.projectId)return;button.disabled=true;button.textContent='업데이트 중…';const r=await api.modrinthUpdate(currentInstance().id,d.projectId);if(!r.ok){toast(r.error||'업데이트 실패',true);button.disabled=false;button.textContent='업데이트';return;}if(r.config){state.config=r.config;renderAll();}toast('업데이트를 적용했습니다.');await refreshCapabilities();await renderContent();await openContentDetail(d);}
async function deleteFromDetail(button){const d=state.detailItem;if(!d?.projectId)return;const yes=await askConfirm(`${d.title}을(를) 삭제할까요?`,'콘텐츠 삭제');if(!yes)return;button.disabled=true;const r=await api.modrinthUninstall(currentInstance().id,d.projectId);if(!r.ok){toast(r.error||'삭제 실패',true);button.disabled=false;return;}closeModal('contentDetailModal');await refreshCapabilities();await renderContent();await searchContent();toast('삭제했습니다.');}

function renderSearchResults(){
  const area=$('#searchResults');area.innerHTML='';
  if(!state.searchResults.length){area.innerHTML='<div class="empty">검색 결과가 없습니다.</div>';return;}
  for(const item of state.searchResults){
    const row=document.createElement('div');row.className='result-item';
    row.innerHTML=`${item.iconUrl?`<img class="result-icon" src="${esc(item.iconUrl)}" alt="">`:'<div class="result-placeholder">◇</div>'}<div class="item-copy"><button class="content-name result-name" type="button">${esc(item.title)}</button><span>${esc(item.author||'')} · ${Number(item.downloads||0).toLocaleString()} 다운로드</span><span>${esc(item.description||'')}</span></div><button class="mod-install-btn ${item.installed?'installed':''} install" ${item.installed?'disabled':''}>${item.installed?'✓ 설치됨':'＋ 설치'}</button>`;
    row.querySelector('.result-name').addEventListener('click',()=>openContentDetail(item));
    row.querySelector('.install')?.addEventListener('click',async e=>{if(item.installed)return;const ok=await installProject(item.projectId,item.title,e.currentTarget);if(ok)item.installed=true;});
    area.appendChild(row);
  }
}
async function checkContentUpdates(showLatest=true){const inst=currentInstance();if(!inst)return;const r=await api.modrinthCheckUpdates(inst.id);if(!r.ok)return toast(r.error||'업데이트 확인 실패',true);const strip=$('#contentUpdateStrip');if(!r.updates?.length){strip.classList.add('hidden');if(showLatest)toast('설치된 콘텐츠가 최신 상태입니다.');return;}strip.classList.remove('hidden');$('#contentUpdateText').textContent=`${r.updates.length}개 콘텐츠를 업데이트할 수 있습니다.`;}

function updateSettingsText(u=state.update){ const version=state.appVersion; const title=$('#updateStatusTitle'), text=$('#updateStatusText'), action=$('#settingsUpdateActionBtn'), notes=$('#settingsReleaseNotesBtn'), progress=$('#updateProgress'); progress.style.width=`${u.percent||0}%`; action.classList.add('hidden'); action.dataset.action=''; notes.classList.toggle('hidden', !['available','downloading','downloaded'].includes(u.state)); if(u.state==='latest'){title.textContent='최신 버전입니다';text.textContent=`EasyCraft v${version}을 사용하고 있습니다.`;}else if(u.state==='available'){title.textContent=`v${u.availableVersion} 업데이트 가능`;text.textContent='새 버전을 다운로드하기 전에 GitHub에서 업데이트 내역을 확인할 수 있습니다.';action.textContent='업데이트';action.dataset.action='download';action.classList.remove('hidden');}else if(u.state==='downloading'){title.textContent=`업데이트 다운로드 중 · ${u.percent||0}%`;text.textContent='GitHub Release에서 이번 업데이트의 변경사항을 확인할 수 있습니다.';}else if(u.state==='downloaded'){title.textContent=`v${u.availableVersion} 준비 완료`;text.textContent='업데이트 내역을 확인하거나 재시작해서 새 버전을 적용하세요.';action.textContent='재시작하여 업데이트';action.dataset.action='install';action.classList.remove('hidden');}else if(u.state==='installing'){title.textContent=`v${u.availableVersion||''} 업데이트 적용 중`;text.textContent='작은 업데이트 창에서 설치 진행 상태를 확인할 수 있습니다.';}else if(u.state==='checking'||u.state==='idle'){title.textContent='업데이트 확인 중';text.textContent='최신 버전을 확인하고 있습니다.';}else if(u.state==='dev'){title.textContent='개발 모드';text.textContent='설치된 EXE에서 업데이트를 확인할 수 있습니다.';}else if(u.state==='error'){title.textContent='업데이트 확인 오류';text.textContent=u.error||'업데이트 서버에 연결하지 못했습니다.';}else{title.textContent='업데이트 상태';text.textContent='업데이트 확인 버튼을 눌러 확인할 수 있습니다.';} }
function renderStartupUpdate(u=state.update){ const gate=$('#startupGate'), checking=$('#gateChecking'), avail=$('#gateAvailable'); if(state.updatePromptDismissed){gate.classList.add('hidden');return;} if(u.state==='checking'||u.state==='idle'){gate.classList.remove('hidden');checking.classList.remove('hidden');avail.classList.add('hidden');return;} if(u.state==='available'||u.state==='downloading'||u.state==='downloaded'){gate.classList.remove('hidden');checking.classList.add('hidden');avail.classList.remove('hidden');$('#gateUpdateTitle').textContent=u.state==='downloaded'?`EasyCraft v${u.availableVersion} 준비 완료`:`EasyCraft v${u.availableVersion} 업데이트`;$('#gateUpdateDescription').textContent=u.state==='downloaded'?'재시작하면 새 버전을 바로 사용할 수 있습니다.':u.state==='downloading'?`업데이트를 다운로드하고 있습니다. ${u.percent||0}%`:`현재 v${state.appVersion} → 새 버전 v${u.availableVersion}. 지금 업데이트하시겠어요?`;$('#gateProgressWrap').classList.toggle('hidden',u.state==='available');$('#gateProgress').style.width=`${u.percent||0}%`;$('#gateReleaseNotesBtn').classList.toggle('hidden', !u.availableVersion);$('#updateLaterBtn').disabled=u.state==='downloading';$('#updateNowBtn').disabled=u.state==='downloading';$('#updateNowBtn').textContent=u.state==='downloaded'?'재시작하여 업데이트':u.state==='downloading'?'다운로드 중…':'업데이트';return;} gate.classList.add('hidden');}
function applyUpdateState(u={}){state.update={...state.update,...u};updateSettingsText(state.update);renderStartupUpdate(state.update);}
function renderSettings(){renderAccount();renderHero();updateSettingsText(state.update);}

function syncContentHeaderFade(scrollTop=0,isContent=$('#view-content').classList.contains('active')){
  const heading=$('#pageHeading');if(!heading)return;
  if(!isContent){heading.style.opacity='1';heading.style.transform='translateY(0)';heading.style.pointerEvents='auto';return;}
  const progress=Math.max(0,Math.min(1,Number(scrollTop||0)/115));
  heading.style.opacity=String(1-progress);
  heading.style.transform=`translateY(${-10*progress}px)`;
  heading.style.pointerEvents=progress>.92?'none':'auto';
}
$('#view-content').addEventListener('scroll',e=>syncContentHeaderFade(e.currentTarget.scrollTop,true),{passive:true});

// navigation
$$('.nav-btn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target!==m)return;if(m.id==='dependencyModal'||m.id==='confirmModal')return;closeModal(m.id);}));
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
$('#searchInput').addEventListener('input',scheduleContentSearch);$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(searchTimer);searchContent();}});$('#contentFolderBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return toast('인스턴스를 먼저 선택해 주세요.',true);const r=await api.openContentFolder(i.id,state.contentType);if(!r?.ok)toast(r?.error||'콘텐츠 폴더를 열지 못했습니다.',true);});$('#pickLocalContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const r=await api.pickContent(i.id,state.contentType);if(r.added?.length)toast(`${r.added.length}개 파일을 추가했습니다.`);state.selectedContent.clear();await refreshCapabilities();await renderContent();});$('#contentUpdatesBtn').addEventListener('click',()=>checkContentUpdates(true));
$('#selectAllInstalled').addEventListener('change',e=>{const selectable=state.installedItems.filter(i=>!i.autoDependency);state.selectedContent.clear();if(e.currentTarget.checked)for(const item of selectable)state.selectedContent.add(contentSelectionKey(item));renderContent();});
$('#updateSelectedContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const selected=selectedInstalledItems().filter(x=>x.managed&&x.projectId);if(!selected.length)return;const btn=$('#updateSelectedContentBtn');btn.disabled=true;btn.textContent='업데이트 중…';const r=await api.modrinthUpdateBatch(i.id,selected.map(x=>x.projectId));btn.textContent='선택 업데이트';if(!r.ok){syncBulkControls();return toast(r.error||'업데이트 실패',true);}if(r.config){state.config=r.config;renderAll();}toast(r.count?`${r.count}개 콘텐츠를 업데이트했습니다.`:'선택한 콘텐츠가 모두 최신입니다.');await refreshCapabilities();await renderContent();});
$('#deleteSelectedContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const selected=selectedInstalledItems();if(!selected.length)return;if(!(await askConfirm(`선택한 ${selected.length}개 콘텐츠를 삭제할까요?`,'선택한 콘텐츠 삭제')))return;const btn=$('#deleteSelectedContentBtn');btn.disabled=true;btn.textContent='삭제 중…';const r=await api.deleteContentBatch(i.id,state.contentType,selected.map(x=>x.name));btn.textContent='선택 삭제';if(!r.ok){syncBulkControls();return toast(r.error||'삭제 실패',true);}state.selectedContent.clear();await refreshCapabilities();await renderContent();toast(`${r.count||selected.length}개 콘텐츠를 삭제했습니다.`);});
$('#updateAllContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i)return;const btn=$('#updateAllContentBtn');btn.disabled=true;btn.textContent='업데이트 중…';const r=await api.modrinthUpdateAll(i.id,state.contentType);btn.textContent='전체 업데이트';if(!r.ok){syncBulkControls();return toast(r.error||'업데이트 실패',true);}if(r.config){state.config=r.config;renderAll();}toast(r.count?`${r.count}개 콘텐츠를 업데이트했습니다.`:'설치된 콘텐츠가 모두 최신입니다.');$('#contentUpdateStrip').classList.add('hidden');await refreshCapabilities();await renderContent();});
$('#deleteAllContentBtn').addEventListener('click',async()=>{const i=currentInstance();if(!i||!state.installedItems.length)return;if(!(await askConfirm(`현재 ${contentTypeLabel()}를 모두 삭제할까요?`,'전체 삭제')))return;const btn=$('#deleteAllContentBtn');btn.disabled=true;btn.textContent='삭제 중…';const r=await api.deleteAllContent(i.id,state.contentType);btn.textContent='전체 삭제';if(!r.ok){syncBulkControls();return toast(r.error||'전체 삭제 실패',true);}state.selectedContent.clear();await refreshCapabilities();await renderContent();toast('전체 삭제가 완료되었습니다.');});
$('#dependencyConfirmBtn').addEventListener('click',()=>closeDependencyPrompt(true));$('#dependencyCancelBtn').addEventListener('click',()=>closeDependencyPrompt(false));$('#confirmYesBtn').addEventListener('click',()=>closeConfirmPrompt(true));$('#confirmNoBtn').addEventListener('click',()=>closeConfirmPrompt(false));
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
  const boot=await api.bootstrap();state.config=boot.config||state.config;state.account=boot.account||null;state.appVersion=boot.appVersion||'0.4.9';state.update=boot.updateState||state.update;state.launchState=boot.launchState?.state||'idle';state.activeInstanceId=boot.launchState?.instanceId||null;
  $('#versionFoot').textContent=`EasyCraft v${state.appVersion}`;
  renderAll();applyUpdateState(state.update);applyLaunchState(boot.launchState||{state:'idle'});
  const vr=await api.fetchVersions();state.versions=vr.versions||[];state.latest=vr.latest||'latest_release';
  await refreshCapabilities();renderAll();
  // 네트워크/업데이트 서비스가 응답하지 않아도 런처 자체는 열 수 있게 합니다.
  setTimeout(()=>{if(!$('#startupGate').classList.contains('hidden') && ['idle','checking'].includes(state.update.state)){state.updatePromptDismissed=true;$('#startupGate').classList.add('hidden');}},9000);
})();
