# EasyCraft Launcher 0.3.3

Windows용 Minecraft Java Edition 런처입니다.

## 핵심 기능

- Minecraft 인스턴스별 독립 mods / saves / resourcepacks / shaderpacks
- 한글을 포함한 Unicode 인스턴스 이름
- Vanilla / Fabric / Forge / NeoForge / Quilt
- Modrinth 프로그램 내 검색 및 설치
- 필수 모드 의존성 설치 전 사용자 확인
- Iris 설치 시에만 셰이더 UI 표시
- 인스턴스별 RAM / 해상도 / Java / JVM 설정
- 빠른 재실행 최적화
- 준비 중/실행 중 Minecraft 중지
- GitHub Releases 기반 EasyCraft 자동 업데이트

## Windows EXE 빌드

GitHub Actions에서 `Build Windows EXE` 워크플로를 실행하거나 `BUILD_EXE.bat`을 실행하세요.

일반 main 빌드는 Artifact만 만들고, `v0.3.3` 같은 태그 빌드는 GitHub Release에 자동 업데이트용 `latest.yml`, 설치 EXE, blockmap을 게시합니다.

## 자동 업데이트

`package.json` 버전과 Git 태그를 맞추세요.

- package.json: `0.3.3`
- GitHub tag: `v0.3.3`

저장소는 일반 사용자 자동 업데이트를 위해 Public 저장소로 사용하는 것을 권장합니다.
