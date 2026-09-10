# EasyCraft Launcher v0.4.14 검사 결과

확인한 항목:

- `src/main.js`, `src/renderer.js`, `src/preload.js` JavaScript 문법 검사 통과
- UI ID 130개 참조 검사 통과
- 직접 이벤트 핸들러 13개 검사 통과
- Renderer → Main IPC invoke 43개 연결 검사 통과
- EasyCraft Account Vault / SRP 인증 구조 유지 확인
- 번들된 ngrok HTTPS 계정 서버 주소 확인
- `v0.4.14` 태그 전용 GitHub Release Workflow 확인
- Release Assets 이름 `EasyCraft-Launcher-Setup-0.4.14.exe`, `.blockmap`, `latest.yml` 검사 로직 확인
- 전체 화면 업데이트 게이트 제거 확인
- 가운데 아래 비차단 업데이트 토스트 UI 확인
- `최신버전입니다!` / `응답하지 못했습니다. 나중에 다시 시도하세요.` 문구 검사
- NSIS differential update 설정 및 `.blockmap` 사용 유지 확인
- 배포 파일/locale 경량화 설정 확인
- Fabric 전용 `EasyCraft HUD` 시스템 항목 확인
- EasyCraft HUD 삭제/끄기/선택/상세보기 차단 확인
- CustomHud 및 최신 버전용 포트 fallback 확인
- Git 충돌 마커 검사 통과
- 사용자 EasyCraft 비밀번호 원문이 런처 소스에 포함되지 않음을 확인

실제 Windows NSIS EXE 빌드는 이 실행 환경에서 npm 의존성을 내려받을 수 없어 수행하지 못했습니다. GitHub Actions에서 `v0.4.14` Release를 Publish하면 실제 Windows 빌드와 Release Asset 검증이 실행됩니다.
## v0.4.14 build-fix verification

- `npm run test:smoke`: PASS
- `node --check src/main.js`: PASS
- `node --check src/renderer.js`: PASS
- `node --check src/preload.js`: PASS
- `node --check src/minecraft-worker.js`: PASS
- Startup-order smoke check now uses statement order rather than LF-only exact text, so Windows/CRLF GitHub checkouts do not fail falsely.

