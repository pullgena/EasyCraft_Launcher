# EasyCraft Launcher v0.4.6

Windows용 Minecraft Java 런처입니다. 인스턴스별 Minecraft 버전, 모드 로더와 로더 버전, RAM, Java, 콘텐츠를 따로 관리할 수 있습니다.

## v0.4.6

### 모드 로더 버전 선택
인스턴스를 만들거나 수정할 때 Fabric / Forge / NeoForge / Quilt를 선택하면 `모드 로더 버전` 항목이 나타납니다. Vanilla에서는 이 항목이 숨겨집니다.

`최신 자동`을 선택하거나 호환되는 특정 로더 버전을 직접 고를 수 있습니다.

- Fabric: Fabric Meta API의 해당 Minecraft 버전 호환 로더 목록
- Forge: Forge Maven 메타데이터의 해당 Minecraft 버전 빌드
- NeoForge: NeoForged Maven의 해당 Minecraft 버전 계열 빌드
- Quilt: Quilt Meta API의 해당 Minecraft 버전 호환 로더 목록

### Minecraft / 로더 자동 업데이트
인스턴스 설정에서 다음 옵션을 개별적으로 켤 수 있습니다.

- `Minecraft 버전 자동 업데이트`: 게임 실행 전에 Mojang 최신 정식 릴리스를 확인합니다.
- `모드 로더 자동 업데이트`: 현재 Minecraft 버전과 호환되는 최신 로더를 확인합니다.

Minecraft 버전을 자동으로 올리면 기존 모드의 호환성이 달라질 수 있으므로 Minecraft 자동 업데이트는 기본적으로 꺼져 있습니다. 모드 로더 자동 업데이트는 기본적으로 켜져 있습니다.

### 플레이어 얼굴 표시 수정
Minecraft 스킨 원본 전체 이미지를 CSS로 축소해서 표시하지 않고, 스킨 파일의 얼굴 영역만 잘라 프로필 이미지로 사용합니다. 이로써 계정 프로필에 스킨 전개도가 표시되던 문제가 해결됩니다.

## 빌드
GitHub Actions의 `Build Windows EXE` 워크플로를 실행하거나 Windows에서 `BUILD_EXE.bat`을 사용할 수 있습니다.

Release 태그는 `v0.4.6`으로 만들고, 자동 업데이트를 위해 Release의 `EasyCraft-Launcher-Setup-0.4.6.exe`, `latest.yml`, `.blockmap` 파일을 유지하세요.
