# EasyCraft Launcher v0.4.14

EasyCraft Launcher **0.4.14 정식 버전** 소스입니다.

## 핵심 변경

- 런처 창을 먼저 띄우고 네트워크 작업을 백그라운드로 처리해 시작 체감 속도를 개선했습니다.
- 업데이트 확인을 화면 가운데 아래의 비차단 팝업으로 변경했습니다.
- 업데이트 확인 중에도 인스턴스/설정/Modrinth 등 다른 기능을 계속 사용할 수 있습니다.
- 최신 버전이면 `최신버전입니다!`, 확인 시간이 초과되면 `응답하지 못했습니다. 나중에 다시 시도하세요.`를 표시합니다.
- NSIS `.blockmap` 기반 차등 업데이트를 유지하고 다운로드 진행률/속도를 표시합니다.
- Fabric 인스턴스에는 EasyCraft HUD 런타임을 자동 준비해 게임 HUD에 `EasyCraft으로 실행됨`을 표시합니다.
- EasyCraft HUD는 런처의 모드 목록에는 보이지만 삭제/끄기/선택/상세 열기 등 상호작용은 할 수 없습니다.
- 동일한 Fabric/Minecraft 버전의 HUD 런타임은 다시 네트워크 조회하지 않고 재사용합니다.
- 배포 파일에서 불필요한 문서/테스트/소스맵/언어 리소스를 줄여 설치 파일 용량을 최적화했습니다.
- v0.4.13의 EasyCraft 계정, Weird Host + ngrok 동기화, Microsoft/Minecraft 계정 연결, Modrinth, 인스턴스, 로그, 자동 업데이트 기능을 유지합니다.

## 계정 서버

런처에는 다음 EasyCraft Account Server 주소가 기본 포함되어 있습니다.

```text
https://waffle-gangway-actress.ngrok-free.dev
```

서버의 `/health`가 정상 응답하는 동안 계정 동기화를 사용할 수 있습니다.

## 정식 Release 빌드

GitHub Release 태그는 정확히 다음 값이어야 합니다.

```text
v0.4.14
```

Release를 Publish하면 Windows 빌드 Workflow가 실행되고 다음 자동 업데이트 파일을 같은 Release Assets에 업로드합니다.

```text
EasyCraft-Launcher-Setup-0.4.14.exe
EasyCraft-Launcher-Setup-0.4.14.exe.blockmap
latest.yml
```
