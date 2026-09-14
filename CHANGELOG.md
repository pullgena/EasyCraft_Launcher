# EasyCraft Launcher Changelog

## v0.4.21
- EasyCraft 계정의 Microsoft 연결 토큰 상태를 설정 화면에서 확인할 수 있도록 추가
- 설정에 Microsoft 토큰의 **예상 남은 기간(일)** 및 마지막 저장/갱신 시각 표시
- EasyCraft Account Server가 refresh token을 최초 저장하거나 자동 교체할 때 서버 콘솔에 안전한 토큰 이벤트 로그 출력
- 보안을 위해 서버 콘솔에는 refresh token 원문 대신 SHA-256 기반 12자리 fingerprint만 표시
- Microsoft 기본 refresh token 수명 90일을 기준으로 예상 일수를 계산하며 실제 토큰은 Microsoft에 의해 더 일찍 취소될 수 있음을 명시
- Account Server v0.4.21 `token-status-v1` capability 확인 추가
- 정식 Release 태그를 `v0.4.21`로 변경
