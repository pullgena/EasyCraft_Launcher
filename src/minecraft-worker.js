'use strict';

const fs = require('fs');
const path = require('path');
const { Launch } = require('minecraft-java-core');

let launcher = null;
let finished = false;
let lastProgressSentAt = 0;
let lastProgressValue = -1;
let logPath = null;

function send(type, payload = {}) {
  const message = { type, ...payload };
  if (process.parentPort) {
    try { process.parentPort.postMessage(message); return; } catch {}
  }
  if (typeof process.send === 'function' && process.connected) {
    try { process.send(message); } catch {}
  }
}

function writeLog(text) {
  if (!logPath || !text) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${String(text).trim()}\n`, 'utf8');
  } catch {}
}

function errorText(err) {
  if (!err) return '알 수 없는 실행 오류';
  if (typeof err === 'string') return err;
  return err.message || err.error || err.stack || JSON.stringify(err);
}

function finishWithError(err) {
  if (finished) return;
  finished = true;
  const message = errorText(err);
  writeLog(`ERROR ${message}`);
  send('error', { error: message });
  setTimeout(() => process.exit(1), 30).unref?.();
}

function sendProgress(progress, total, element) {
  let pct = Number(progress);
  const size = Number(total);
  if (size > 0 && Number.isFinite(pct)) pct = (pct / size) * 100;
  if (!Number.isFinite(pct)) pct = 0;
  pct = Math.max(0, Math.min(99, pct));

  const now = Date.now();
  if (now - lastProgressSentAt < 100 && Math.abs(pct - lastProgressValue) < 1) return;
  lastProgressSentAt = now;
  lastProgressValue = pct;

  let text = 'Minecraft 파일 준비 중…';
  if (pct >= 97) text = '다운로드 마무리 중…';
  else if (pct >= 70) text = '게임 파일 다운로드 중…';
  else if (pct >= 20) text = '라이브러리와 Java 준비 중…';
  if (element && String(element).trim()) {
    const short = path.basename(String(element)).slice(0, 80);
    if (short) text = `${text.replace('…', '')} · ${short}`;
  }
  send('progress', { percent: pct, text });
}

function startLaunch(payload) {
  if (launcher || finished) return;
  const options = payload?.options;
  if (!options) return finishWithError('Minecraft 실행 옵션이 전달되지 않았습니다.');
  logPath = payload.logPath || null;

  launcher = new Launch();
  let runningSent = false;

  launcher.on('check', (progress, total, element) => {
    sendProgress(progress, total, element);
  });
  launcher.on('progress', (progress, total, element) => {
    sendProgress(progress, total, element);
  });
  launcher.on('extract', name => {
    send('activity', { text: `Java/로더 압축 해제 중 · ${path.basename(String(name || '파일')).slice(0, 70)}` });
  });
  launcher.on('patch', patch => {
    const text = String(patch || '').trim();
    if (text) send('activity', { text: '모드 로더 적용 중…' });
    writeLog(text);
  });
  launcher.on('data', line => {
    const text = String(line || '').trim();
    if (!text) return;
    writeLog(text);
    // minecraft-java-core는 실제 Java spawn 직전에 이 줄을 emit한다.
    if (!runningSent && /Launching with arguments/i.test(text)) {
      runningSent = true;
      send('running', { text: 'Minecraft 실행 중' });
    }
  });
  launcher.on('error', err => finishWithError(err));
  launcher.on('close', code => {
    if (finished) return;
    finished = true;
    writeLog(`Minecraft closed with code ${code}`);
    send('close', { code: Number.isFinite(Number(code)) ? Number(code) : null });
    setTimeout(() => process.exit(0), 30).unref?.();
  });

  writeLog(`WORKER START mc=${options.version} loader=${options.loader?.enable ? options.loader?.type : 'vanilla'} root=${options.path}`);
  send('activity', { text: 'Minecraft 파일 확인 중…' });

  try {
    // Launch() 자체는 내부 start()를 시작한 뒤 즉시 반환하므로 완료 여부는 이벤트로 추적한다.
    launcher.Launch(options);
  } catch (error) {
    finishWithError(error);
  }
}

if (process.parentPort) {
  process.parentPort.on('message', event => {
    const message = event?.data ?? event;
    if (message?.type === 'launch') startLaunch(message);
  });
} else {
  process.on('message', message => {
    if (message?.type === 'launch') startLaunch(message);
  });
}
process.on('uncaughtException', finishWithError);
process.on('unhandledRejection', finishWithError);
