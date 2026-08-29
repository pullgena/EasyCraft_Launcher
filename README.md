# EasyCraft Launcher 0.3.0

Windows용 Minecraft Java Edition 런처입니다.

## 0.3.0 주요 기능
- 인스턴스마다 독립 설정
  - Minecraft 버전 / Vanilla, Fabric, Forge, NeoForge, Quilt
  - 최소/최대 RAM
  - 창 해상도 / 전체화면
  - Java 실행 파일 경로(자동 선택 가능)
  - JVM 옵션 / 게임 옵션
  - 실행 전 Modrinth 콘텐츠 자동 업데이트
- Minecraft 실행 상태를 별도 카드 대신 우측 상단 오버레이로 표시
- 실제 Minecraft 프로세스가 시작되면 실행 버튼이 `■ 게임 종료`로 변경
- Windows에서 해당 인스턴스의 Java 프로세스만 찾아 종료
- Modrinth 프로그램 내부 검색 / 설치 / 삭제 / 업데이트
- 설치 기록뿐 아니라 실제 `mods`, `resourcepacks`, `shaderpacks` 파일 존재 여부 검증
- 설치 기록은 있는데 실제 파일이 사라진 경우 자동 복구
- 게임 실행 직전 관리 중인 Modrinth 파일 재검증
- 인스턴스별 loader 폴더 사용으로 모드 로더와 실제 게임 경로 일치
- 인스턴스 삭제 시 모드, 리소스팩, 셰이더, 세이브, 설정, 게임 파일, 로그 전체 삭제
- EasyCraft 자체 인앱 업데이트
  - GitHub Release 확인
  - 프로그램 안에서 업데이트 다운로드
  - `설치하고 재시작`으로 적용

## GitHub Actions로 EXE 빌드
1. 프로젝트 파일을 GitHub 저장소 루트에 업로드합니다.
2. `Actions > Build Windows EXE > Run workflow`를 실행합니다.
3. 일반 빌드는 `--publish never`로 실행되어 Artifacts에 EXE가 생성됩니다.
4. `EasyCraft-Launcher-Windows`를 다운로드합니다.

## 런처 자체 업데이트 배포 방법
인앱 업데이트가 작동하려면 새 버전을 GitHub Release로 배포해야 합니다.

예: 다음 버전이 0.3.1인 경우
1. `package.json`의 version을 `0.3.1`로 변경합니다.
2. 변경사항을 main에 Commit/Push합니다.
3. GitHub에서 태그 `v0.3.1`을 생성해 Push합니다.
4. GitHub Actions가 EXE, `latest.yml`, blockmap을 GitHub Release에 자동 게시합니다.
5. 기존 설치본에서 `설정 > EasyCraft 업데이트 > 업데이트 확인`을 누르면 새 버전을 받을 수 있습니다.

GitHub Actions 빌드 시 현재 저장소의 `owner/repo` 정보가 런처에 자동으로 기록되므로 사용자 이름을 소스에 직접 적을 필요가 없습니다.

## 로컬 실행
```bat
npm install
npm start
```

## 로컬 EXE 빌드
```bat
npm install
npm run dist:win -- --publish never
```

결과는 `dist/` 폴더에 생성됩니다.
