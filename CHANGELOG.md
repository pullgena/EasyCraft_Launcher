# EasyCraft Launcher v0.4.26

- Minecraft가 실제로 실행되지 못하거나 시작 직후 비정상 종료되면 `Minecraft가 실행되지 않았습니다`를 표시합니다.
- EasyCraft 계정 로그인 사용자에게만 `오류 로그 서버로 보내기` 버튼을 표시합니다.
- 전송 시 현재 인스턴스의 보관된 런처/Minecraft 로그 전체를 묶어 Account Server로 보냅니다.
- access token, refresh token, EasyCraft 세션/서명 값 등 인증정보는 전송 전에 자동 마스킹합니다.
- Account Server의 서명된 로그인 세션이 있어야 로그 업로드가 승인됩니다.
