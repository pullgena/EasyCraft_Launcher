# EasyCraft Launcher 변경 기록

## v0.4.20

- EasyCraft 계정에 연결된 Microsoft/Minecraft 인증을 Account Server가 갱신하는 서버 중심 인증 방식 추가
- Microsoft 최초 연결 시 refresh token을 서버 전용 AES-256-GCM 키로 암호화하여 저장
- 다른 PC에는 refresh token을 전달하지 않고 Minecraft 실행용 단기 access token만 전달하도록 변경
- Microsoft/Xbox/Minecraft 인증 갱신 중 일시적인 네트워크 오류가 발생하면 서버에서 최대 3회 자동 재시도
- Microsoft refresh token이 실제로 무효화된 경우에만 계정 재연결을 요청하도록 오류 처리 개선
- v0.4.19 이하의 클라이언트 암호화 계정 vault를 Microsoft 인증 가능한 PC에서 자동으로 v0.4.20 서버 보관 방식으로 이전
- 서버용 계정과 직접 Microsoft 로그인 계정의 인증 흐름을 분리
- 개인정보처리방침에 서버 암호화 refresh token 저장/사용 구조 반영
- 정식 Release 태그를 정확히 `v0.4.20`으로 변경
