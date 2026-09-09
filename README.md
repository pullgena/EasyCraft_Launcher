# EasyCraft Launcher 0.4.13-beta.7

Windows용 Minecraft Java Edition 런처 EasyCraft의 로그인/시작 안정화 베타입니다.

## Beta 7 핵심 수정

- 로그인 선택 화면의 버튼들이 반응하지 않던 문제를 수정했습니다.
- 원인이었던 Renderer의 누락된 `logout()` 핸들러를 복구했습니다. 이 오류 때문에 로그인 관련 후속 이벤트와 초기화 코드가 중간에 멈출 수 있었습니다.
- 왼쪽 계정 아바타를 눌러도 로그인 창이 열리도록 했습니다.
- Microsoft 로그인 시작/성공/실패 상태를 화면 토스트로 표시합니다.
- 인증 사이트 연결, 코드 교환, Microsoft 토큰 요청에 네트워크 타임아웃을 추가했습니다.
- 업데이트 서버가 느리거나 막혀도 시작 화면은 최대 8초 뒤 자동으로 열립니다.
- GitHub Actions 빌드 전에 UI ID, 이벤트 핸들러, IPC 연결을 검사하는 `npm run test:smoke`를 추가했습니다.

## 코드 로그인

1. EasyCraft 설정에서 배포한 인증 사이트 URL을 저장합니다.
2. 로그인 → `EasyCraft 코드 로그인 · BETA 7`를 선택합니다.
3. 인증 사이트에서 Microsoft 로그인합니다. 학교 PC에서 막히면 휴대폰에서 같은 사이트를 이용할 수 있습니다.
4. 사이트에 표시된 `EC-XXXX-XXXX-XXXX` 코드를 EasyCraft에 입력합니다.
5. 코드는 5분 동안 한 번만 사용할 수 있습니다.

인증 사이트 배포 방법은 `AUTH_SITE_SETUP.md`를 확인하세요.
