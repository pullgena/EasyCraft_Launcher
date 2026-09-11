# EasyCraft Launcher v0.4.19 테스트 결과

- `src/main.js` 문법 검사 ✅
- `src/renderer.js` 문법 검사 ✅
- `src/preload.js` 문법 검사 ✅
- `src/minecraft-worker.js` 문법 검사 ✅
- 빌드 스크립트 JavaScript 문법 검사 ✅
- Smoke Test ✅
- UI ID 139개 참조 검사 ✅
- 직접 이벤트 핸들러 14개 검사 ✅
- IPC invoke 45개 대응 검사 ✅
- 시스템 HUD 자물쇠 `시스템 잠금` hover 안내 검사 ✅
- 모드 설치 후 전체 Modrinth 검색을 다시 실행하지 않는지 검사 ✅
- 검색 결과의 설치 상태를 버튼 단위로 부분 갱신하는지 검사 ✅
- 설치/검색 목록 DocumentFragment 원자적 교체 검사 ✅
- CustomHud 프로필을 `config/custom-hud/profiles`에 작성하는지 검사 ✅
- CustomHud `config.json`의 `enabled` / `activeProfileName` 활성화 처리 검사 ✅
- 기존 활성 CustomHud 프로필 보존 로직 검사 ✅
- Fabric 전용 EasyCraft HUD 잠금/삭제 방지 검사 ✅
- package version `0.4.19` 검사 ✅
- Release tag `v0.4.19` 검사 ✅
- 자동 업데이트 `.exe`, `.blockmap`, `latest.yml` workflow 검사 ✅
- `npm pack --dry-run --ignore-scripts` ✅
- 이전 버전 번호 잔존 검사 ✅

실제 Minecraft 화면에서 HUD 렌더링되는 최종 확인은 Fabric + 실제 Minecraft 실행 환경이 필요합니다. 이번 수정은 CustomHud 공식 소스의 현재 프로필 경로와 `config.json` 활성 프로필 구조에 맞게 적용했습니다.
