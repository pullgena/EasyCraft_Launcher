# EasyCraft Launcher v0.4.13-beta.8.1

한 PC에서 시스템 브라우저 + localhost(PKCE) 방식으로 Microsoft 로그인을 처리합니다.

## Beta 8.1 변경점

- 사용자 설정 화면에서 **Microsoft Client ID 항목 제거**
- 학교 PC 사용자는 Client ID를 입력할 필요 없음
- 개발자가 빌드 시 `EASYCRAFT_MS_CLIENT_ID`를 한 번 주입
- Client Secret은 런처에 저장하거나 포함하지 않음
- 기존 인증 사이트/EC 코드 방식은 사용하지 않음
- Beta 6 시작 화면 무한 대기 수정과 Beta 7 로그인 버튼 수정 유지

Microsoft 설정 방법은 `MICROSOFT_LOGIN_SETUP.md`를 참고하세요.
