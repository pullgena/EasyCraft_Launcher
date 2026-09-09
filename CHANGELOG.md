# Changelog

## 0.4.13-beta.8.1

- 설정 화면의 Microsoft Client ID 입력/저장 UI를 완전히 제거했습니다.
- Microsoft Client ID는 개발자가 빌드할 때만 주입하도록 변경했습니다.
- GitHub Actions Secret `EASYCRAFT_MS_CLIENT_ID`를 지원합니다.
- 로컬 빌드용 `SET_MICROSOFT_CLIENT_ID.bat`을 추가했습니다.
- 기존 사용자 config에 남아 있는 `microsoftClientId` 값은 더 이상 사용하지 않습니다.
- 시스템 브라우저 + localhost PKCE 로그인 구조는 그대로 유지합니다.
- Client Secret은 계속 사용하지 않습니다.
