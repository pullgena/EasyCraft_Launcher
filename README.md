# EasyCraft Launcher v0.4.24

EasyCraft의 계정 로그인과 Microsoft/Minecraft 연결을 웹사이트에서 처리하는 버전입니다.

## 로그인 흐름

1. 런처에서 `로그인`을 누릅니다.
2. 기본 브라우저에서 EasyCraft 로그인 사이트가 열립니다.
3. 사이트에서 EasyCraft ID/PW로 로그인합니다. 비밀번호 원문은 SRP 방식으로 서버에 전송하지 않습니다.
4. Minecraft 연결이 필요하면 같은 페이지에서 `Microsoft 인증하기`를 누릅니다.
5. Microsoft 공식 로그인 페이지에서 인증을 완료합니다.
6. 서버가 연결 정보를 암호화해 저장합니다.
7. 런처가 웹 로그인 완료를 자동으로 감지하고 로그인 상태를 가져옵니다.

## Release

정식 Release 태그는 정확히 `v0.4.24`입니다.
