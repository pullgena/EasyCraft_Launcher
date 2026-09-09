const AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';
const CODE_TTL_MS = 5 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const enc = new TextEncoder();
const dec = new TextDecoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'} });
}
function html(body, status = 200) {
  return new Response(body, { status, headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'} });
}
function escapeHtml(v) { return String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function b64url(bytes) { let bin=''; for(const b of bytes) bin+=String.fromCharCode(b); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function fromB64url(v) { const s=v.replace(/-/g,'+').replace(/_/g,'/'); const p=s+'='.repeat((4-s.length%4)%4); const bin=atob(p); return Uint8Array.from(bin,c=>c.charCodeAt(0)); }
async function hmac(secret,value){ const k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(value))); }
async function makeState(secret){ const payload=b64url(enc.encode(JSON.stringify({n:crypto.randomUUID(),exp:Date.now()+STATE_TTL_MS}))); return `${payload}.${b64url(await hmac(secret,payload))}`; }
async function verifyState(secret,state){ try{const [p,s]=String(state||'').split('.');if(!p||!s)return false;const e=b64url(await hmac(secret,p));if(e.length!==s.length)return false;let d=0;for(let i=0;i<s.length;i++)d|=e.charCodeAt(i)^s.charCodeAt(i);if(d)return false;return Number(JSON.parse(dec.decode(fromB64url(p))).exp)>Date.now();}catch{return false;} }
async function aesKey(secret){ const h=await crypto.subtle.digest('SHA-256',enc.encode(secret)); return crypto.subtle.importKey('raw',h,'AES-GCM',false,['encrypt','decrypt']); }
async function encryptObject(secret,obj){ const iv=crypto.getRandomValues(new Uint8Array(12));const k=await aesKey(secret);const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(JSON.stringify(obj))));const all=new Uint8Array(iv.length+ct.length);all.set(iv);all.set(ct,iv.length);return b64url(all); }
async function decryptObject(secret,blob){ const all=fromB64url(blob),iv=all.slice(0,12),ct=all.slice(12),k=await aesKey(secret);const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},k,ct);return JSON.parse(dec.decode(clear)); }
function randomCode(){ const bytes=crypto.getRandomValues(new Uint8Array(12));let c='';for(const b of bytes)c+=ALPHABET[b%ALPHABET.length];return `EC-${c.slice(0,4)}-${c.slice(4,8)}-${c.slice(8,12)}`; }
function callbackUri(request){ return `${new URL(request.url).origin}/oauth/callback`; }
function requiredEnv(env){ const m=['MS_CLIENT_ID','MS_CLIENT_SECRET','STATE_SECRET','TOKEN_ENCRYPTION_KEY'].filter(k=>!String(env[k]||'').trim());if(m.length)throw new Error(`서버 설정 누락: ${m.join(', ')}`); }
async function fetchWithTimeout(url, options={}, timeoutMs=15000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  catch(error){if(error?.name==='AbortError')throw new Error(`인증 서버 응답 시간이 초과되었습니다. (${Math.round(timeoutMs/1000)}초)`);throw error;}
  finally{clearTimeout(timer);}
}
async function postForm(url,values){ const r=await fetchWithTimeout(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:new URLSearchParams(values)},15000);const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error_description||d.error||`Microsoft OAuth HTTP ${r.status}`);return d; }
async function postJson(url,body){ const r=await fetchWithTimeout(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(body)},15000);const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.error_description||d.errorMessage||d.error||`HTTP ${r.status}`);return d; }
async function getJson(url,headers={}){ const r=await fetchWithTimeout(url,{headers:{'accept':'application/json',...headers}},15000);const d=await r.json().catch(()=>({}));if(!r.ok||d.error)throw new Error(d.errorMessage||d.error||`HTTP ${r.status}`);return d; }
async function minecraftAccountFromOauth(oauth2){
  if(!oauth2?.access_token||!oauth2?.refresh_token)throw new Error('Microsoft 토큰을 받지 못했습니다.');
  const xbl=await postJson('https://user.auth.xboxlive.com/user/authenticate',{Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:`d=${oauth2.access_token}`},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'});
  const xsts=await postJson('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[xbl.Token]},RelyingParty:'rp://api.minecraftservices.com/',TokenType:'JWT'});
  const uhs=xbl?.DisplayClaims?.xui?.[0]?.uhs;if(!uhs||!xsts?.Token)throw new Error('Xbox 인증 정보를 확인하지 못했습니다.');
  const mc=await postJson('https://api.minecraftservices.com/authentication/login_with_xbox',{identityToken:`XBL3.0 x=${uhs};${xsts.Token}`});
  if(!mc?.access_token)throw new Error('Minecraft 인증 토큰을 받지 못했습니다.');
  const store=await getJson('https://api.minecraftservices.com/entitlements/mcstore',{authorization:`Bearer ${mc.access_token}`});
  if(!Array.isArray(store.items)||!store.items.some(x=>x.name==='game_minecraft'||x.name==='product_minecraft'))throw new Error('이 Microsoft 계정에서 Minecraft Java Edition 소유권을 확인하지 못했습니다.');
  const profile=await getJson('https://api.minecraftservices.com/minecraft/profile',{authorization:`Bearer ${mc.access_token}`});
  if(!profile?.id||!profile?.name)throw new Error('Minecraft Java 프로필을 찾지 못했습니다.');
  let xboxAccount={};try{const xb=await postJson('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[xbl.Token]},RelyingParty:'http://xboxlive.com',TokenType:'JWT'});const x=xb?.DisplayClaims?.xui?.[0]||{};xboxAccount={xuid:x.xid||null,gamertag:x.gtg||null,ageGroup:x.agg||null};}catch{}
  return {access_token:mc.access_token,client_token:crypto.randomUUID(),uuid:profile.id,name:profile.name,refresh_token:oauth2.refresh_token,user_properties:'{}',meta:{type:'Xbox',access_token_expires_in:Date.now()+Number(mc.expires_in||3600)*1000,demo:false},xboxAccount,profile:{skins:Array.isArray(profile.skins)?profile.skins:[],capes:Array.isArray(profile.capes)?profile.capes:[]}};
}
async function exchangeCode(env,request,code){ return postForm(`${AUTHORITY}/token`,{client_id:env.MS_CLIENT_ID,client_secret:env.MS_CLIENT_SECRET,code,grant_type:'authorization_code',redirect_uri:callbackUri(request),scope:SCOPE}); }
async function refreshOauth(env,refreshToken){ return postForm(`${AUTHORITY}/token`,{client_id:env.MS_CLIENT_ID,client_secret:env.MS_CLIENT_SECRET,refresh_token:refreshToken,grant_type:'refresh_token',scope:SCOPE}); }
function storeStub(env){ return env.AUTH_SESSIONS.get(env.AUTH_SESSIONS.idFromName('easycraft-global')); }
async function storeCode(env,code,account){ const encrypted=await encryptObject(env.TOKEN_ENCRYPTION_KEY,account);const r=await storeStub(env).fetch('https://do/put',{method:'POST',body:JSON.stringify({code,encrypted,expiresAt:Date.now()+CODE_TTL_MS})});return r.ok; }
async function takeCode(env,code){ const r=await storeStub(env).fetch('https://do/take',{method:'POST',body:JSON.stringify({code})});if(!r.ok)return null;const d=await r.json();return d?.encrypted?decryptObject(env.TOKEN_ENCRYPTION_KEY,d.encrypted):null; }
function page(content){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EasyCraft Login</title><style>:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080b12;color:#f6f7fb;padding:24px}.wrap{width:min(620px,100%)}.brand{font-size:12px;letter-spacing:.18em;color:#8f9bb5;margin-bottom:14px}.card{background:#101521;border:1px solid #222b3d;border-radius:24px;padding:28px}.card h1{font-size:32px;margin:0 0 10px}.card p{color:#abb5c8;line-height:1.6}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;padding:14px 18px;font-weight:800;font-size:15px;cursor:pointer;text-decoration:none;background:#7658ff;color:white}.btn.secondary{background:#1b2231;color:#dbe1ee;margin-left:8px}.code{margin:24px 0;background:#090d16;border:1px solid #2f3950;border-radius:18px;padding:22px;text-align:center}.code small{display:block;color:#7f8aa0;margin-bottom:8px}.code strong{font-size:30px;letter-spacing:.1em;word-break:break-word}.warn{color:#ffadad!important}.steps{font-size:14px}.foot{font-size:12px;color:#707b90;margin-top:16px;text-align:center}@media(max-width:520px){.card{padding:20px}.card h1{font-size:27px}.code strong{font-size:23px}}</style></head><body><main class="wrap">${content}<div class="foot">EasyCraft Login Beta · Microsoft 비밀번호는 EasyCraft 서버가 저장하지 않습니다.</div></main></body></html>`;}
function homePage(){return page(`<div class="brand">EASYCRAFT LOGIN · BETA 7</div><section class="card"><h1>Microsoft 계정으로 로그인</h1><p>로그인을 완료하면 EasyCraft Launcher에 입력할 일회용 코드가 발급됩니다.</p><p class="steps">먼저 학교 PC에서 시도해 보고, Microsoft 로그인이 막히면 이 사이트를 휴대폰에서 열어 진행하세요.</p><a class="btn" href="/oauth/start">Microsoft로 로그인</a></section>`);}
function codePage(code){const safe=escapeHtml(code);return page(`<div class="brand">EASYCRAFT LOGIN · COMPLETE</div><section class="card"><h1>인증 코드가 발급되었습니다</h1><p>EasyCraft Launcher의 코드 로그인 화면에 아래 코드를 입력하세요.</p><div class="code"><small>5분 동안 한 번만 사용 가능</small><strong id="easycraftCode">${safe}</strong></div><button class="btn" id="copyCode" type="button">코드 복사</button><p id="copyState">EasyCraft에서 로그인에 성공하면 이 코드는 즉시 폐기됩니다.</p></section><script>document.getElementById('copyCode').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('easycraftCode').textContent);document.getElementById('copyState').textContent='코드를 복사했습니다.';}catch{document.getElementById('copyState').textContent='복사가 차단되었습니다. 코드를 길게 눌러 직접 복사해 주세요.';}});</script>`);}
function errorPage(message){return page(`<div class="brand">EASYCRAFT LOGIN · ERROR</div><section class="card"><h1>로그인하지 못했습니다</h1><p class="warn">${escapeHtml(message)}</p><a class="btn" href="/">다시 시도</a></section>`);}

export class AuthSessionStore {
  constructor(ctx){this.ctx=ctx;}
  async fetch(request){
    const url=new URL(request.url);if(request.method!=='POST')return json({ok:false},405);const body=await request.json().catch(()=>({}));const code=String(body.code||'').toUpperCase();
    if(url.pathname==='/put'){
      const listed=await this.ctx.storage.list({prefix:'code:',limit:40});for(const [k,v] of listed)if(Number(v?.expiresAt||0)<=Date.now())await this.ctx.storage.delete(k);
      const existing=await this.ctx.storage.get(`code:${code}`);if(existing&&Number(existing.expiresAt)>Date.now())return json({ok:false,error:'collision'},409);
      await this.ctx.storage.put(`code:${code}`,{encrypted:body.encrypted,expiresAt:Number(body.expiresAt)});return json({ok:true});
    }
    if(url.pathname==='/take'){const key=`code:${code}`;const item=await this.ctx.storage.get(key);if(!item)return json({ok:false,error:'not_found'},404);await this.ctx.storage.delete(key);if(Number(item.expiresAt)<=Date.now())return json({ok:false,error:'expired'},410);return json({ok:true,encrypted:item.encrypted});}
    return json({ok:false},404);
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    try{
      if(url.pathname==='/health')return json({ok:true,service:'easycraft-auth',version:'beta.7'});
      if(url.pathname==='/')return html(homePage());
      requiredEnv(env);
      if(url.pathname==='/oauth/start'){
        const state=await makeState(env.STATE_SECRET);const q=new URLSearchParams({client_id:env.MS_CLIENT_ID,response_type:'code',redirect_uri:callbackUri(request),response_mode:'query',scope:SCOPE,state,prompt:'select_account'});return Response.redirect(`${AUTHORITY}/authorize?${q}`,302);
      }
      if(url.pathname==='/oauth/callback'){
        const err=url.searchParams.get('error_description')||url.searchParams.get('error');if(err)return html(errorPage(err),400);
        if(!(await verifyState(env.STATE_SECRET,url.searchParams.get('state'))))return html(errorPage('로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.'),400);
        const c=url.searchParams.get('code');if(!c)return html(errorPage('Microsoft 인증 코드를 받지 못했습니다.'),400);
        const oauth=await exchangeCode(env,request,c);const account=await minecraftAccountFromOauth(oauth);let issued=null;for(let i=0;i<6;i++){const code=randomCode();if(await storeCode(env,code,account)){issued=code;break;}}if(!issued)throw new Error('일회용 코드를 만들지 못했습니다. 다시 시도해 주세요.');return html(codePage(issued));
      }
      if(url.pathname==='/api/redeem'&&request.method==='POST'){const body=await request.json().catch(()=>({}));const code=String(body.code||'').trim().toUpperCase();if(!/^EC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code))return json({ok:false,error:'인증 코드 형식이 올바르지 않습니다.'},400);const account=await takeCode(env,code);if(!account)return json({ok:false,error:'코드가 없거나 이미 사용되었거나 만료되었습니다.'},404);return json({ok:true,account});}
      if(url.pathname==='/api/refresh'&&request.method==='POST'){const body=await request.json().catch(()=>({}));if(!body.refresh_token)return json({ok:false,error:'refresh_token이 없습니다.'},400);const oauth=await refreshOauth(env,String(body.refresh_token));return json({ok:true,account:await minecraftAccountFromOauth(oauth)});}
      return json({ok:false,error:'Not Found'},404);
    }catch(error){const message=String(error?.message||error||'알 수 없는 오류');return url.pathname.startsWith('/api/')?json({ok:false,error:message},500):html(errorPage(message),500);}
  }
};
