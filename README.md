# EasyCraft Launcher 0.2.0

Windows용 Minecraft Java Edition 런처입니다.

## 주요 기능
- 인스턴스별 완전 분리된 Minecraft 폴더
- Vanilla / Fabric / Forge / NeoForge / Quilt
- Microsoft 계정 로그인
- Modrinth에서 프로그램 내부 검색
- 현재 Minecraft 버전 + 모드 로더 호환 필터
- 모드 / 리소스팩 / 셰이더 원클릭 설치
- 필수 Modrinth 의존성 자동 설치
- 설치된 Modrinth 콘텐츠 업데이트 확인 / 개별 업데이트 / 모두 업데이트
- Modrinth 프로젝트 삭제 시 실제 파일 삭제 + 더 이상 필요 없는 자동 의존성 정리
- 인스턴스 삭제 시 mods, resourcepacks, shaderpacks, saves, 설정, 게임 파일, 로그 전체 삭제
- 직접 JAR/ZIP 추가도 고급 기능으로 지원
- 실행 로그 저장: 각 인스턴스의 launcher-logs 폴더

## GitHub Actions로 EXE 빌드
1. 이 프로젝트의 파일을 GitHub 저장소 루트에 업로드합니다.
2. Actions > Build Windows EXE > Run workflow를 실행합니다.
3. 성공 후 Artifacts의 EasyCraft-Launcher-Windows를 다운로드합니다.
4. ZIP 안의 `EasyCraft-Launcher-Setup-0.2.0.exe`를 실행합니다.

워크플로는 `--publish never`를 사용하므로 GH_TOKEN 없이 EXE만 빌드합니다.

## 로컬 실행
Node.js 설치 후:

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
