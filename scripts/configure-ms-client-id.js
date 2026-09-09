const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'src', 'microsoft-auth.json');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let clientId = String(process.env.EASYCRAFT_MS_CLIENT_ID || '').trim();
if (!clientId) {
  try {
    clientId = String(JSON.parse(fs.readFileSync(target, 'utf8')).clientId || '').trim();
  } catch {}
}

if (!uuid.test(clientId)) {
  console.error('BUILD ERROR: Microsoft Client ID가 설정되지 않았습니다.');
  console.error('GitHub 저장소 Settings > Secrets and variables > Actions 에 EASYCRAFT_MS_CLIENT_ID Secret을 등록하거나');
  console.error('SET_MICROSOFT_CLIENT_ID.bat을 실행해 개발용 Client ID를 한 번 저장해 주세요.');
  process.exit(1);
}

fs.writeFileSync(target, JSON.stringify({ clientId }, null, 2) + '\n', 'utf8');
console.log('Microsoft login app configuration embedded for this build.');
