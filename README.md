# EasyCraft Launcher 0.4.0

Windows용 Minecraft Java Edition 런처입니다.

## 주요 기능

- 인스턴스별 Minecraft 버전 / Vanilla / Fabric / Forge / NeoForge / Quilt
- 인스턴스별 mods / saves / resourcepacks / shaderpacks 분리
- 한글 인스턴스 이름
- Microsoft 로그인 / 로그아웃
- Modrinth 프로그램 내 검색 / 설치 / 제거 / 업데이트
- 필수 의존 모드 설치 전 사용자 확인
- Iris가 실제로 설치된 경우에만 셰이더 UI 표시
- 인스턴스별 RAM / 해상도 / 전체화면 / Java / JVM 설정
- 준비 중 및 실행 중 Minecraft 중지
- 앱 시작 시 업데이트 확인 후 `업데이트` / `나중에` 선택
- GitHub Releases 기반 자동 업데이트

## Windows EXE 빌드

GitHub Actions의 `Build Windows EXE`를 실행하거나 Windows PC에서 `BUILD_EXE.bat`을 실행하세요.

일반 main 빌드는 Artifact만 생성합니다. `v0.4.0` 같은 태그 빌드는 GitHub Release에 다음 자동 업데이트 파일을 게시합니다.

- `EasyCraft-Launcher-Setup-0.4.0.exe`
- `EasyCraft-Launcher-Setup-0.4.0.exe.blockmap`
- `latest.yml`

## 업데이트 배포

`package.json`의 버전과 Git 태그를 동일하게 맞추세요.

- package.json: `0.4.0`
- GitHub tag: `v0.4.0`

Release는 Draft/Pre-release가 아닌 Published 상태로 배포하는 것을 권장합니다.
