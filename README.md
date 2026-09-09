# EasyCraft Launcher 0.4.13-beta.8

Windows용 Minecraft Java Edition 런처 EasyCraft의 **단일 PC Microsoft 로그인** 베타입니다.

## Beta 8 핵심 변경

- Beta 7의 외부 인증 사이트와 `EC-XXXX-XXXX-XXXX` 코드 로그인 기능을 제거했습니다.
- 로그인 버튼을 누르면 EasyCraft가 PC 내부 `localhost`에 임시 수신기를 연 뒤 **기본 브라우저의 Microsoft 로그인 페이지**를 엽니다.
- Microsoft 로그인 결과는 같은 PC의 EasyCraft로 자동 돌아옵니다.
- OAuth 2.0 Authorization Code + **PKCE(S256)**를 사용합니다.
- 데스크톱 Public Client 방식이므로 **Client Secret을 런처에 저장하지 않습니다.**
- 로그인 완료/취소/state 불일치/3분 시간 초과/localhost 포트 오류를 각각 처리합니다.
- 로그인 토큰 갱신도 저장된 Microsoft Client ID를 사용합니다.
- Beta 6/7의 시작 화면 타임아웃, UI 이벤트/IPC smoke test, Vanilla 오프라인 fallback은 유지됩니다.

## 처음 한 번 필요한 설정

Microsoft Entra에서 EasyCraft 앱 등록에 `Mobile and desktop applications` 플랫폼과 `http://localhost` Redirect URI를 추가한 뒤, Application (client) ID를 EasyCraft의 **설정 → Microsoft Client ID**에 저장하세요.

자세한 순서는 `MICROSOFT_LOGIN_SETUP.md`를 확인하세요.

> Minecraft/Xbox Services가 새 제3자 앱 등록을 허용하지 않는 경우 Microsoft 로그인은 성공해도 Minecraft 계정 확인 단계에서 거절될 수 있습니다. 이 부분은 localhost/PKCE 구현과 별개의 Microsoft/Minecraft 서비스 정책입니다.
