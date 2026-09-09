# EasyCraft Launcher 0.4.13-beta.7

- **로그인 버튼/로그인 방식 선택 버튼이 동작하지 않던 치명적 Renderer 오류를 수정했습니다.**
  - `renderer.js`에서 `logout` 함수가 정의되지 않은 상태로 이벤트 등록에 사용되고 있었습니다.
  - 이 ReferenceError 때문에 로그인 방식 버튼, 업데이트 이벤트 구독, 앱 초기화가 뒤쪽에서 실행되지 않을 수 있었습니다.
- 로그아웃 기능을 정상 구현하고 계정 UI를 즉시 갱신하도록 수정했습니다.
- 계정 아바타를 클릭해도 로그인 선택 창이 열리도록 개선했습니다.
- Microsoft 로그인 진행 상태(info/success/error)를 UI 토스트로 표시하도록 변경했습니다.
- EasyCraft 인증 Relay의 redeem/refresh/health 요청에 타임아웃을 추가했습니다.
- Microsoft 토큰 POST 요청에도 타임아웃을 추가해 네트워크가 멈췄을 때 무한 대기하지 않도록 했습니다.
- 인증 사이트 Worker의 Microsoft/Xbox/Minecraft 요청에도 15초 타임아웃을 추가했습니다.
- 자동 빌드 전에 다음을 검사하는 `npm run test:smoke`를 추가했습니다.
  - Renderer가 참조하는 HTML ID 존재 여부
  - 직접 등록되는 이벤트 핸들러 정의 여부
  - Preload IPC invoke와 Main IPC handler 일치 여부
  - Git 충돌 마커 존재 여부
- 기존 Beta 6의 시작 업데이트 8초 안전 타이머는 그대로 유지됩니다.

## 0.4.13-beta.6

- 시작 시 `최신 버전을 확인하고 있습니다` 화면이 무한정 남는 문제를 수정했습니다.
- 업데이트/일반 네트워크 요청에 타임아웃을 추가하고 업데이트 실패가 런처 실행을 막지 않도록 했습니다.

## 0.4.13-beta.5

- EasyCraft 인증 사이트에서 Microsoft 로그인 후 발급되는 일회용 코드 로그인을 추가했습니다.
- 학교 PC에서 사이트 로그인이 막히면 휴대폰에서 같은 사이트를 이용할 수 있게 했습니다.
