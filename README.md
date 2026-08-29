# EasyCraft Launcher 0.3.1

Windows Minecraft Java 런처입니다. 인스턴스별 설정, Modrinth 인앱 설치/업데이트, 실행 상태 오버레이, 런처 자동 업데이트를 포함합니다.

## 0.3.1 자동 업데이트

설치형 `.exe`로 실행하면 시작 약 2.5초 후 GitHub Release를 자동으로 확인합니다. 새 버전이 있으면 별도 버튼 없이 자동 다운로드하고, 오른쪽 위에 진행률을 표시합니다. 다운로드가 끝나면 **재시작하여 업데이트** 버튼이 나타납니다. 버튼을 누르면 NSIS 업데이트를 설치하고 EasyCraft가 다시 실행됩니다. 정상 종료하는 경우에도 다운로드된 업데이트가 적용될 수 있습니다.

자동 업데이트가 작동하려면 GitHub Release에 같은 빌드에서 생성된 다음 파일이 있어야 합니다.

- `EasyCraft-Launcher-Setup-x.y.z.exe`
- `latest.yml`
- `EasyCraft-Launcher-Setup-x.y.z.exe.blockmap`

가장 간단한 배포 방식은 공개 GitHub 저장소를 사용하는 것입니다.

## GitHub 빌드

1. 이 프로젝트 파일을 저장소 루트에 올립니다 (`package.json`이 저장소 첫 화면에 보여야 함).
2. main 브랜치에 push하면 일반 테스트 빌드가 실행됩니다.
3. 새 버전을 배포할 때 `package.json`의 버전과 같은 태그를 `v` 접두사로 만듭니다. 0.3.1은 `v0.3.1`입니다.
4. 태그 push가 감지되면 GitHub Actions가 `--publish always`로 Windows NSIS 설치본과 업데이트 메타데이터를 GitHub Release에 게시합니다.

## 로컬 개발

`RUN_DEV.bat` 또는 `npm start`를 사용합니다. 개발 모드에서는 실제 자동 업데이트 검사를 하지 않습니다.
