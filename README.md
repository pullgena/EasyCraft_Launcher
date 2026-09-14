# EasyCraft Launcher v0.4.20

EasyCraft Launcher **v0.4.20 정식 버전** 소스입니다.

## v0.4.20 핵심 변경

- EasyCraft 계정에 연결한 Microsoft/Minecraft 인증을 서버에서 자동 갱신하는 방식 추가
- Microsoft 로그인이 가능한 PC에서 한 번 연결하면 서버에 refresh token을 AES-256-GCM으로 암호화 저장
- 다른 PC에는 refresh token을 내려주지 않고 현재 Minecraft 실행에 필요한 단기 access token만 전달
- 일시적인 Microsoft 인증 서버 오류는 서버가 최대 3회 자동 재시도
- 실제 refresh token이 폐기/만료된 경우에만 재연결 상태 표시
- v0.4.19의 기존 클라이언트 암호화 vault를 v0.4.20 방식으로 자동 마이그레이션
- EasyCraft 계정 세션 기본 수명을 서버에서 30일로 연장

## 서버도 v0.4.20으로 업데이트 필요

Launcher v0.4.20은 `/health`의 `server-microsoft-refresh-v1` capability를 확인합니다.
따라서 Weird Host의 EasyCraft Account Server도 v0.4.20으로 먼저 업데이트해야 합니다.

## 정식 Release

정식 Windows 빌드는 아래 태그에서만 실행됩니다.

```text
v0.4.20
```

Release Assets:

```text
EasyCraft-Launcher-Setup-0.4.20.exe
EasyCraft-Launcher-Setup-0.4.20.exe.blockmap
latest.yml
```
- 시스템 HUD 자물쇠에 `시스템 잠금` hover 안내 추가
- 모드 설치 시 콘텐츠 검색/추가 영역 깜빡임 수정
- 모드 설치 상태를 필요한 버튼만 부분 갱신하도록 최적화
- Fabric EasyCraft HUD 적용 문제 수정
- CustomHud `profiles` 폴더 및 `config.json` 활성 프로필 처리 보강
