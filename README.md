# EasyCraft Launcher v0.4.17

EasyCraft Launcher **v0.4.17 정식 버전** 소스입니다.

## v0.4.17 핵심 변경

- 사용자가 제공한 ChatGPT 로고 형태를 그대로 사용하는 시작 인트로
- 선이 그려지면서 로고가 서서히 완성되는 애니메이션
- 로고 완성 후 `안녕하세요!` 표시 후 자동 페이드아웃
- 인트로 동안 런처 초기화는 백그라운드에서 계속 진행


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
v0.4.17
```

Release를 Publish하면 다음 자동 업데이트 파일을 같은 Release Assets에 업로드합니다.

```text
EasyCraft-Launcher-Setup-0.4.17.exe
EasyCraft-Launcher-Setup-0.4.17.exe.blockmap
latest.yml
```
