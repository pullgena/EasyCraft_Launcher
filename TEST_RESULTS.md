# EasyCraft Launcher v0.4.17 테스트 결과

검사일: 2026-09-11

## 통과한 정적/스모크 검사

- `node --check src/main.js` ✅
- `node --check src/renderer.js` ✅
- `node --check src/preload.js` ✅
- `node --check src/minecraft-worker.js` ✅
- `node --check scripts/smoke-test.js` ✅
- `npm run test:smoke` ✅
- HTML 중복 ID 검사 ✅
- Renderer가 참조하는 HTML ID 139개 연결 검사 ✅
- 직접 이벤트 핸들러 14개 선언 검사 ✅
- Preload → Main IPC 45개 연결 검사 ✅
- `v0.4.17` Release 태그/버전 규칙 검사 ✅
- 자동 업데이트 EXE / blockmap / latest.yml 구성 검사 ✅
- Fabric EasyCraft HUD 보호 규칙 검사 ✅
- EasyCraft 계정 SRP/암호화 보관함 코드 유지 검사 ✅
- `EasyCraft 계정 없이 시작` 직접 Microsoft 로그인 경로 검사 ✅
- 직접 로그인 계정의 독립 토큰 갱신 경로 검사 ✅
- 이용약관/개인정보처리방침/제3자 고지/삭제 안내 파일 존재 검사 ✅
- 시작 인트로 UI 및 `안녕하세요!` 문구 검사 ✅

## 실제 계정/Windows 실행 테스트가 필요한 부분

- 실제 Microsoft/Minecraft 계정 인증 완료 여부
- 실제 GitHub Actions Windows NSIS 빌드
- 설치본 자동 업데이트/차등 다운로드
- Minecraft 각 버전별 Fabric HUD 표시
- Windows 환경별 Electron safeStorage 동작

이 항목들은 사용자 계정, Windows 빌드 환경 또는 실제 Minecraft 실행이 필요하므로 최종 Release 전에 실제 환경에서 한 번 확인하는 것을 권장합니다.
