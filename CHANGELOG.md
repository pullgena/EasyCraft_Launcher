# EasyCraft Launcher 0.4.13-beta.8

- 외부 EasyCraft 인증 사이트와 일회용 EC 코드 로그인 기능을 제거했습니다.
- 시스템 기본 브라우저 + `http://localhost:<임시포트>` 방식으로 Microsoft 로그인을 변경했습니다.
- Authorization Code + PKCE(S256), state 검증을 적용했습니다.
- Microsoft Client Secret을 런처에서 완전히 제거했습니다.
- 로그인 수신기는 `localhost`에만 열리고 로그인 완료/실패/3분 시간 초과 후 즉시 닫힙니다.
- 설정에 `Microsoft Client ID` 입력/저장 UI를 추가했습니다.
- 중복 로그인 클릭을 막고 로그인 진행 중 버튼 상태를 표시합니다.
- Microsoft 토큰 발급 후 기존 `minecraft-java-core`의 Minecraft 계정 변환 로직을 사용합니다.
- 저장된 refresh token 갱신도 같은 Client ID로 처리합니다.
- Beta 7 이전 저장 계정은 기존 갱신을 한 번 시도하며 실패 시 새 방식으로 다시 로그인할 수 있습니다.
- Beta 6의 업데이트 시작 화면 8초 안전 타이머 및 Beta 7 smoke test는 유지됩니다.

## 0.4.13-beta.7

- 로그인 버튼 이벤트 초기화 오류를 수정했습니다.
- 외부 인증 사이트를 이용한 EC 코드 로그인을 시험했습니다.

## 0.4.13-beta.6

- 시작 시 `최신 버전을 확인하고 있습니다` 화면이 무한정 남는 문제를 수정했습니다.
