# 0.3.0

- 인스턴스별 RAM/해상도/전체화면/Java/JVM/게임 옵션 설정 추가
- 인스턴스별 실행 전 Modrinth 자동 업데이트 옵션 추가
- 기존 전역 메모리 설정을 인스턴스별 설정으로 마이그레이션
- 실행 상태 카드를 제거하고 우측 상단 실행 오버레이로 변경
- 실제 Java 프로세스 시작 시 `■ 게임 종료` 버튼 표시
- 실행 중인 해당 인스턴스 Java 프로세스 종료 기능 추가
- Modrinth 설치 여부를 registry가 아니라 실제 파일 존재 여부와 함께 검사
- registry에만 있고 실제 파일이 없는 Modrinth 콘텐츠 자동 재다운로드/복구
- 게임 시작 전 관리 중인 콘텐츠 실제 파일 재검증
- 모드 로더 경로를 각 인스턴스 `game/loader`로 고정
- 게임 실행 시 각 인스턴스의 `game/mods`가 실제 Minecraft mods 폴더가 되도록 경로 통일
- EasyCraft 자체 GitHub Release 인앱 업데이트 기능 추가
- 업데이트 확인/다운로드/설치 후 재시작 UI 추가
- GitHub tag(`v버전`) 빌드 시 EXE + latest.yml 자동 Release 게시
- 일반 Actions 빌드는 기존처럼 Artifact만 생성하고 자동 게시하지 않음
