# Changelog
- GitHub Actions smoke test가 Windows CRLF 줄바꿈에서도 오탐 없이 시작 순서를 검사하도록 수정했습니다.

## v0.4.15

- 런처 시작 속도 최적화: 창을 먼저 표시하고 계정 갱신/로그 정리/네트워크 작업을 백그라운드 처리
- Minecraft 버전 목록 로딩을 비차단 방식으로 변경
- 업데이트 확인 전체 화면 제거 및 가운데 아래 비차단 업데이트 팝업 추가
- 최신 버전 확인 시 `최신버전입니다!` 표시
- 업데이트 확인 응답 시간 초과 시 `응답하지 못했습니다. 나중에 다시 시도하세요.` 표시
- 업데이트 확인 중에도 런처의 다른 기능 사용 가능
- 업데이트 다운로드 진행률 및 다운로드 속도 표시
- NSIS blockmap 기반 차등 업데이트 명시적 유지
- 배포 파일/언어 리소스/소스맵/테스트 문서 제외로 설치 파일 경량화
- Fabric 전용 EasyCraft HUD 런타임 추가: `EasyCraft으로 실행됨` 표시
- EasyCraft HUD를 모드 목록에 시스템 모드로 표시하며 삭제/끄기/선택/상세 보기 차단
- 같은 Minecraft/Fabric 버전에서는 HUD 런타임을 캐시해 재실행 속도 개선
- v0.4.13 계정 동기화, Weird Host + ngrok, Modrinth, 인스턴스, 로그, 자동 업데이트 기능 유지
- 정식 Release 태그를 정확히 `v0.4.15`로 제한
- 최신 Minecraft Fabric 호환성을 위해 EasyCraft HUD 런타임이 CustomHud 본판과 호환 포트 프로젝트를 순차 확인하도록 보강
- 시스템 HUD에 대한 직접 IPC 삭제/끄기 요청도 거부하도록 보호 강화
- 업데이트 토스트를 fixed 위치로 변경해 어떤 화면에서도 가운데 아래에 유지
- NSIS `differentialPackage`를 명시적으로 활성화해 차등 업데이트 구성을 강화
