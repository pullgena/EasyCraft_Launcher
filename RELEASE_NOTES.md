# EasyCraft Launcher v0.4.25

🔐 EasyCraft 계정의 Microsoft 인증 갱신을 **클라이언트가 아닌 Account Server에서만** 처리하도록 변경했습니다.  
💻 다른 PC에서는 Microsoft 로그인/refresh를 직접 시도하지 않고 EasyCraft 서버에서 Minecraft 실행용 단기 인증정보만 받습니다.  
🔗 설정에 **Microsoft 계정 연결** 버튼을 추가했습니다. 인증 가능한 PC에서 최초 1회 연결하면 서버에 암호화 저장됩니다.  
🛡️ 다른 PC에는 Microsoft refresh token을 전달하거나 저장하지 않습니다.  
🌐 EasyCraft 웹사이트는 EasyCraft 계정 로그인만 담당하도록 정리했습니다.  
🧹 구형 클라이언트 vault 자동 refresh fallback을 EasyCraft 계정 경로에서 제거했습니다.

> 다운로드할 때는 `.exe` 파일만 다운로드하세요!!!
