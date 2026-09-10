# EasyCraft Launcher v0.4.13

EasyCraft Launcher 0.4.13 정식 버전 소스입니다.

## 계정 서버

런처에는 다음 EasyCraft Account Server 주소가 기본 포함되어 있습니다.
- 사용자 설정 화면에서 **Microsoft Client ID 항목 제거**
- 사용자는 Client ID를 입력할 필요 없음
- 개발자가 빌드 시 `EASYCRAFT_MS_CLIENT_ID`를 한 번 주입
- Client Secret은 런처에 저장하거나 포함하지 않음
- 기존 인증 사이트/EC 코드 방식은 사용하지 않음
- Beta 6 시작 화면 무한 대기 수정과 Beta 7 로그인 버튼 수정 유지

```text
https://waffle-gangway-actress.ngrok-free.dev
```

Weird Host의 EasyCraft Account Server와 ngrok 터널이 실행 중이어야 계정 동기화 기능을 사용할 수 있습니다.

## 로컬 Windows 빌드

```text
BUILD_EXE.bat
```

또는:

```bash
npm install
npm run test:smoke
npm run dist:win -- --publish never
```

## GitHub 정식 Release 빌드

GitHub Release를 게시할 때 태그를 **정확히** 아래처럼 사용합니다.

```text
v0.4.13
```

Release가 `published` 상태가 되면 `.github/workflows/build-windows.yml`이 실행되고 Windows installer와 `latest.yml`을 Release에 업로드합니다.
다른 태그에는 정식 v0.4.13 빌드가 실행되지 않습니다.
