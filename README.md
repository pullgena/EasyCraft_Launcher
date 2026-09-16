# EasyCraft Launcher v0.4.23

EasyCraft Launcher v0.4.23 정식 버전 소스입니다.

## v0.4.23 핵심

- EasyCraft 계정에 Minecraft를 연결할 때 런처 내부 Microsoft 로그인 대신 웹 인증 사이트를 사용합니다.
- EasyCraft 로그인 후 `Microsoft 인증 사이트 열기`를 누르면 10분짜리 일회용 링크가 발급됩니다.
- 인증 사이트에서 Microsoft 공식 Device Code 로그인을 완료하면 Microsoft/Minecraft 연결 정보가 Account Server에 저장됩니다.
- 이후 다른 PC에서는 같은 EasyCraft 계정으로 로그인하면 서버에 저장된 연결 정보를 바탕으로 Minecraft 실행 세션을 받습니다.
- Microsoft refresh token은 런처로 내려오지 않고 서버에서 AES-256-GCM으로 암호화하여 보관합니다.
- `EasyCraft 계정 없이 시작`의 직접 Microsoft 로그인 모드는 그대로 별도 동작합니다.
- 자동 업데이트, Modrinth/인스턴스 기능은 유지됩니다.

Account Server도 반드시 v0.4.23로 업데이트해야 합니다.


## v0.4.23 주요 변경

- 직관적인 모드 On/Off 스위치
- 로그 레벨 색상 표시
- 설정 제목 sticky/compact 처리
- EasyCraft HUD 임시 제거
- EasyCraft 계정 로그인과 Minecraft 인증 동기화 분리
