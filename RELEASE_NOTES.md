# EasyCraft Launcher v0.4.20

🔐 EasyCraft 계정에 연결한 Microsoft/Minecraft 인증을 서버에서 자동 갱신할 수 있도록 개선했습니다.  
☁️ Microsoft 계정을 한 번 연결하면 refresh token이 서버 전용 키로 암호화되어 저장됩니다.  
🖥️ 다른 PC에서는 EasyCraft 계정 로그인만으로 저장된 Minecraft 연결을 불러올 수 있도록 개선했습니다.  
🛡️ 다른 PC에는 Microsoft refresh token을 전달하지 않고 Minecraft 실행에 필요한 단기 인증정보만 전달합니다.  
🔄 Microsoft 인증 서버의 일시적인 오류가 발생하면 자동으로 다시 시도하도록 개선했습니다.  
🔑 실제로 Microsoft 인증이 만료되거나 취소된 경우에만 계정 재연결을 요청하도록 개선했습니다.  
⬆️ 기존 EasyCraft 계정의 Minecraft 연결 정보를 v0.4.20 서버 방식으로 자동 이전할 수 있도록 추가했습니다.  
🛠️ 계정 인증 및 동기화 관련 오류 처리를 개선했습니다.

## 다운로드
Windows 사용자는 Release의 **EasyCraft-Launcher-Setup-0.4.20.exe** 파일만 다운로드하세요.
