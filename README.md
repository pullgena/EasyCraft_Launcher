# EasyCraft Launcher 0.4.1

Windows용 Minecraft Java Edition 런처입니다.

## 핵심 기능
- 인스턴스별 Minecraft / 모드 / 세이브 / 설정 분리
- Vanilla / Fabric / Forge / NeoForge / Quilt
- Modrinth 런처 내 검색, 설치, 의존성 확인, 업데이트
- Iris 설치 시 셰이더 탭 자동 표시
- 설치된 Modrinth 콘텐츠 아이콘 표시
- Microsoft 로그인 / 로그아웃 / Minecraft 스킨 얼굴 표시
- 인스턴스별 RAM / 해상도 / Java / JVM 설정
- 빠른 재실행 캐시와 PID 기반 빠른 게임 종료
- GitHub Releases 기반 EasyCraft 업데이트

## 빌드
GitHub Actions의 `Build Windows EXE`를 실행하거나 Windows에서 `BUILD_EXE.bat`을 실행하세요.

일반 main 빌드는 Artifact를 만들고 `v0.4.1` 같은 태그 빌드는 GitHub Release에 자동 업데이트용 `latest.yml`, 설치 EXE, blockmap을 게시합니다.
