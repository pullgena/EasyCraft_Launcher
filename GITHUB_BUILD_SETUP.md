# EasyCraft Launcher v0.4.13 GitHub Release 빌드

## 정식 릴리즈 태그

정확히 아래 태그를 사용해야 빌드됩니다.

```text
v0.4.13
```

`v`와 `0`은 반드시 붙여 씁니다.

## 릴리즈 방법

1. 이 소스를 GitHub 저장소에 업로드합니다.
2. GitHub의 **Releases → Draft a new release**로 이동합니다.
3. 태그를 정확히 `v0.4.13`으로 만듭니다.
4. Release title과 업데이트 내역을 작성합니다.
5. **Publish release**를 누릅니다.
6. GitHub Actions의 `Release v0.4.13 Windows EXE + Auto Update`가 자동 실행됩니다.
7. 빌드가 성공하면 같은 v0.4.13 Release의 Assets에 아래 파일이 자동 등록됩니다.

```text
EasyCraft-Launcher-Setup-0.4.13.exe
EasyCraft-Launcher-Setup-0.4.13.exe.blockmap
latest.yml
Source code (zip)
Source code (tar.gz)
```

`Source code` 두 파일은 GitHub가 태그를 기준으로 자동 제공합니다.

## 자동 업데이트에서 필요한 파일

`latest.yml`, 설치 EXE, `.blockmap`은 삭제하지 마세요. `electron-updater`가 새 버전을 확인하고 다운로드하는 데 사용합니다.

Release는 **Draft가 아닌 Published 상태**여야 하며 일반 사용자의 자동 업데이트를 위해 저장소도 공개 접근 가능한 상태여야 합니다.

## 다음 버전

다음 정식 버전을 만들 때는 `package.json`의 version, GitHub workflow의 허용 태그, Release 태그를 같은 버전으로 맞춰야 합니다. 예를 들어 0.4.14라면 `v0.4.14`입니다.
