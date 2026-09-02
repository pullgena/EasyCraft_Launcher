# EasyCraft Launcher 0.4.4

Windows용 Minecraft Java Edition 런처입니다.

## 핵심 기능
- 인스턴스별 Minecraft / 모드 / 세이브 / 설정 분리
- Vanilla / Fabric / Forge / NeoForge / Quilt
- Modrinth 인기 콘텐츠 즉시 표시, 검색, 설치, 의존성 확인, 업데이트
- Iris 설치 시 셰이더 탭 자동 표시
- Microsoft 로그인 / 로그아웃 / Minecraft 스킨 얼굴 표시
- 별도 Minecraft worker 프로세스로 실행 안정성 개선
- 준비 중/실행 중 빠른 강제 중지
- GitHub Releases 기반 EasyCraft 자동 업데이트
- 업데이트가 있을 때 앱에서 해당 버전의 GitHub Release 업데이트 내역 바로 열기

## 0.4.4 업데이트 내역 보기
새 업데이트가 발견되면 첫 화면과 설정의 업데이트 영역에 `업데이트 내역 보기`가 나타납니다. 이 버튼은 기본 브라우저로 `pullgena/launch-2.0`의 해당 버전 GitHub Release 페이지를 열어, 설치 전에 변경사항을 확인할 수 있게 합니다.

## 빌드
GitHub Actions의 `Build Windows EXE`를 실행하거나 Windows에서 `BUILD_EXE.bat`을 실행하세요.

일반 main 빌드는 Artifact를 만들고 `v0.4.4` 태그 빌드는 GitHub Release에 자동 업데이트용 `latest.yml`, 설치 EXE, blockmap을 게시합니다.
