# EasyCraft Launcher 0.4.3

Windows용 Minecraft Java Edition 런처입니다.

## 핵심 기능
- 인스턴스별 Minecraft / 모드 / 세이브 / 설정 분리
- Vanilla / Fabric / Forge / NeoForge / Quilt
- Modrinth 콘텐츠 화면을 열면 호환되는 인기 모드/리소스팩을 검색 없이 바로 표시
- Modrinth 검색, 설치, 필수 의존성 확인, 업데이트
- Iris 설치 시 셰이더 탭 자동 표시
- 설치된 Modrinth 콘텐츠 아이콘 표시
- Microsoft 로그인 / 로그아웃 / Minecraft 스킨 얼굴 표시
- 인스턴스별 RAM / 해상도 / Java / JVM 설정
- 별도 Minecraft worker 프로세스로 UI 멈춤 최소화
- 준비 중/실행 중 빠른 강제 중지
- GitHub Releases 기반 EasyCraft 자동 업데이트

## 0.4.3 실행 구조
Minecraft 다운로드와 로더 설치는 Electron UI 프로세스와 분리된 worker에서 실행합니다. 따라서 대용량 파일 확인, Java 준비, Fabric/Forge 패치가 진행되어도 EasyCraft 화면이 최대한 계속 반응하도록 구성했습니다.

`minecraft-java-core`의 `loader.path`는 게임 경로에 다시 합쳐지는 상대 경로이므로 EasyCraft는 `loader/fabric`, `loader/forge` 같은 상대 경로를 전달합니다. 이전 버전의 절대 loader 경로 때문에 모드 로더 설치 후 실제 실행으로 넘어가지 못할 수 있던 부분을 수정했습니다.

## 빌드
GitHub Actions의 `Build Windows EXE`를 실행하거나 Windows에서 `BUILD_EXE.bat`을 실행하세요.

일반 main 빌드는 Artifact를 만들고 `v0.4.3` 태그 빌드는 GitHub Release에 자동 업데이트용 `latest.yml`, 설치 EXE, blockmap을 게시합니다.
