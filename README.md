# EasyCraft Launcher 0.4.5

Windows용 Minecraft Java Edition 런처입니다.

## 핵심 기능
- 게임 실행 중심으로 전면 개편한 EasyCraft UI
- 인스턴스별 Minecraft / 모드 / 세이브 / 설정 분리
- Vanilla / Fabric / Forge / NeoForge / Quilt
- Modrinth 인기 콘텐츠 즉시 표시, 검색, 설치, 의존성 확인, 업데이트
- Iris 설치 시 셰이더 탭 자동 표시
- Microsoft 로그인 / 로그아웃 / Minecraft 스킨 얼굴 표시
- 별도 Minecraft worker 프로세스로 실행 안정성 개선
- 준비 중/실행 중 빠른 강제 중지
- GitHub Releases 기반 EasyCraft 자동 업데이트
- 업데이트가 있을 때 해당 GitHub Release 업데이트 내역 바로 열기
- 업데이트 적용 중 별도의 작은 진행 창 표시

## 0.4.5 업데이트
`재시작하여 업데이트`를 누르면 작은 EasyCraft 업데이트 창이 별도로 열립니다. 메인 런처가 종료된 뒤에도 이 창은 남아 silent 설치와 재실행 상태를 안내하고, 새 버전의 EasyCraft가 실행되면 자동으로 닫힙니다.

## 빌드
GitHub Actions의 `Build Windows EXE`를 실행하거나 Windows에서 `BUILD_EXE.bat`을 실행하세요.

일반 main 빌드는 Artifact를 만들고 `v0.4.5` 태그 빌드는 GitHub Release에 자동 업데이트용 `latest.yml`, 설치 EXE, blockmap을 게시합니다.

## v0.4.5 UI

0.4.5는 기존 카드형 레이아웃을 버리고 플레이 화면 중심의 몰입형 UI로 다시 디자인했습니다. 홈에서는 선택한 인스턴스와 실행 버튼이 중앙에 크게 표시되고, 인스턴스 목록은 하단 프로필 바로 이동했습니다. 콘텐츠와 설정 화면도 카드 묶음 대신 하나의 연속된 화면 흐름으로 변경했습니다.
