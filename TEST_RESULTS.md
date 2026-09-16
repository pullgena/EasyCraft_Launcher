# EasyCraft Launcher v0.4.25 테스트 결과

- `main.js`, `renderer.js`, `preload.js`, `minecraft-worker.js` Node 문법 검사: PASS
- UI ID / IPC handler smoke test: PASS
- Release tag / updater asset 검사: PASS
- EasyCraft 계정 refresh 경로에서 클라이언트 `Microsoft().refresh()` / legacy vault fallback 미사용 검사: PASS
- `server-issued-minecraft-session-v1` 요구 capability 검사: PASS
- `launcher-microsoft-link-v1` 최초 연결 기능 검사: PASS
- 모드 toggle / HUD 제거 regression 검사: PASS

실제 Microsoft 로그인과 실제 Minecraft 실행은 Windows 환경에서 최종 확인이 필요합니다.
