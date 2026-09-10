# EasyCraft Launcher v0.4.15 GitHub Release 빌드

정식 버전은 **Release 태그가 정확히 `v0.4.15`일 때만** Windows 빌드가 실행됩니다. `v`와 `0`은 붙여서 입력하세요.

## 방법

1. 이 소스를 GitHub 저장소에 업로드합니다.
2. 변경 내용을 기본 브랜치에 커밋합니다.
3. GitHub의 **Releases → Draft a new release**로 이동합니다.
4. 태그를 정확히 `v0.4.15`로 생성합니다.
5. `RELEASE_NOTES.md` 내용을 Release 설명에 붙여넣습니다.
6. Release를 Publish합니다.
7. `Release v0.4.15 Windows EXE + Auto Update` Workflow가 자동으로 실행됩니다.
8. 성공하면 같은 Release Assets에 다음 파일이 등록됩니다.

```text
EasyCraft-Launcher-Setup-0.4.15.exe
EasyCraft-Launcher-Setup-0.4.15.exe.blockmap
latest.yml
```

`latest.yml`과 `.blockmap`은 기존 설치본의 자동/차등 업데이트에 필요하므로 삭제하지 마세요.

EasyCraft Account Server URL은 현재 소스에 기본 포함되어 있어 별도 GitHub Secret 없이도 빌드할 수 있습니다.
