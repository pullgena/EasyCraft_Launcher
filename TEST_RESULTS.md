# EasyCraft Launcher v0.4.24 테스트 결과

- main.js / renderer.js / preload.js / minecraft-worker.js 문법 검사: PASS
- `npm run test:smoke`: PASS
- UI ID 검사: 143개 PASS
- IPC invoke/handler 검사: 48개 PASS
- v0.4.24 정확한 Release 태그 검사: PASS
- 웹 로그인(create/poll/redeem) IPC 검사: PASS
- 런처 내부 ID/PW 입력 UI 제거 검사: PASS
- 모드 스위치 기본 흰색 버튼 회귀 검사: PASS
- 자동 업데이트 `.exe + .blockmap + latest.yml` 구조 검사: PASS

실제 Windows EXE 설치 및 실제 Microsoft 인증은 Windows/GitHub Release 환경에서 최종 확인이 필요합니다.
