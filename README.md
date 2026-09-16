# EasyCraft Launcher v0.4.25

## 인증 구조

1. EasyCraft 웹사이트에서 EasyCraft 계정으로 로그인합니다.
2. Minecraft 계정이 아직 연결되지 않았다면 Microsoft 로그인이 가능한 PC의 **설정 > Microsoft 계정 연결**을 한 번 실행합니다.
3. 받은 refresh token은 HTTPS로 EasyCraft Account Server에 보내고 서버에서 암호화 저장합니다.
4. 이후 다른 PC는 EasyCraft 계정으로만 로그인합니다.
5. 다른 PC는 Microsoft에 직접 refresh 요청을 하지 않고 Account Server에서 Minecraft 실행용 단기 인증정보만 받습니다.

정식 Release 태그: `v0.4.25`
