# EasyCraft Launcher Changelog

## v0.4.22

- EasyCraft 전용 Microsoft/Minecraft 웹 인증 사이트 연동 추가
- 런처에서 일회용 인증 링크 생성 및 기본 브라우저 자동 열기
- 인증 사이트에서 Microsoft Device Code 인증 완료 후 서버에 Minecraft 연결 정보 저장
- EasyCraft 계정 로그인 시 서버 저장 정보를 이용한 Minecraft 세션 동기화
- Microsoft refresh token을 클라이언트로 전달하지 않는 서버 중심 인증 구조 적용
- 인증 링크 10분 만료 및 1회 사용 처리
- 인증 사이트 세션/CSRF 보호 추가
- 재연결 안내를 웹 인증 사이트 기준으로 변경
- Account Server v0.4.22 `web-microsoft-auth-v1` 기능 확인 추가
- 정식 Release 태그를 `v0.4.22`로 변경
