# EasyCraft Launcher v0.4.16

EasyCraft Launcher **v0.4.16 정식 버전** 소스입니다.

## v0.4.16 핵심 변경

- EasyCraft 전용 계정 없이 Microsoft/Minecraft 계정만 인증해 시작할 수 있는 `EasyCraft 계정 없이 시작` 모드 추가
- 직접 Microsoft 로그인과 EasyCraft 계정 동기화 로그인을 분리하여 각 방식에 맞게 토큰을 갱신
- 시작 시 선이 그려지며 생성형 매듭 모양이 완성되고 `ChatGPT로 생성됨` 문구가 표시되는 인트로 추가
- 인트로가 재생되는 동안에도 런처 초기화/업데이트 확인/로컬 정보 로딩이 뒤에서 계속 진행
- 이용약관, 개인정보처리방침, 제3자 서비스 및 오픈소스 고지를 런처 설정에서 확인 가능
- 로그인 화면에서도 이용약관/개인정보처리방침 바로 확인 가능
- 로그인 상태 및 오류 안내 개선

## 로그인 방식

### EasyCraft 계정
EasyCraft 계정으로 로그인한 뒤 연결한 Minecraft 계정을 계정 서버를 통해 암호화된 보관함 형태로 동기화합니다.

### EasyCraft 계정 없이 시작
Microsoft/Minecraft 계정만 직접 인증합니다. 이 방식의 인증정보는 EasyCraft 계정 서버에 업로드하지 않고 현재 PC의 EasyCraft 사용자 데이터에 저장됩니다.

## 계정 서버

EasyCraft 계정 동기화 기능에는 다음 서버 주소가 기본 포함되어 있습니다.

```text
https://waffle-gangway-actress.ngrok-free.dev
```

직접 Microsoft 로그인 모드는 이 계정 서버를 사용하지 않습니다.

## 정식 Release 빌드

GitHub Release 태그는 정확히 다음 값이어야 합니다.

```text
v0.4.16
```

Release를 Publish하면 다음 자동 업데이트 파일을 같은 Release Assets에 업로드합니다.

```text
EasyCraft-Launcher-Setup-0.4.16.exe
EasyCraft-Launcher-Setup-0.4.16.exe.blockmap
latest.yml
```
