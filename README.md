# EasyCraft Launcher v0.4.7

Windows용 Minecraft Java 런처입니다. 인스턴스별 Minecraft 버전, 모드 로더와 로더 버전, RAM, Java, 콘텐츠를 따로 관리할 수 있습니다.

## v0.4.7

### 인스턴스 폴더 열기 수정
인스턴스의 `폴더 열기` 버튼을 눌러도 Windows 탐색기가 열리지 않던 문제를 수정했습니다.

- 해당 인스턴스가 실제로 존재하는지 먼저 확인합니다.
- 인스턴스의 게임 폴더가 아직 생성되지 않았다면 자동으로 생성합니다.
- Electron 기본 폴더 열기가 실패하는 Windows 환경에서는 `explorer.exe`를 사용해 다시 엽니다.
- 실패 시 아무 반응 없이 끝나지 않고 사용자에게 오류를 표시합니다.

## 빌드
GitHub Actions의 `Build Windows EXE` 워크플로를 실행하거나 Windows에서 `BUILD_EXE.bat`을 사용할 수 있습니다.

Release 태그는 `v0.4.7`으로 만들고, 자동 업데이트를 위해 Release의 `EasyCraft-Launcher-Setup-0.4.7.exe`, `latest.yml`, `.blockmap` 파일을 유지하세요.
