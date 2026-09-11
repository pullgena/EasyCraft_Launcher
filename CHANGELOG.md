# EasyCraft Launcher 변경 기록

## v0.4.19

- EasyCraft HUD 시스템 모드의 자물쇠 아이콘에 마우스를 올리면 `시스템 잠금` 안내가 표시되도록 개선
- Modrinth에서 모드를 설치한 뒤 검색/추가 영역 전체가 다시 그려지며 깜빡이던 문제 수정
- 설치 상태 변경 시 해당 `설치` 버튼만 갱신하도록 렌더링 최적화
- 설치된 콘텐츠 목록을 빈 화면을 거치지 않고 한 번에 교체하도록 개선
- Fabric 전용 EasyCraft HUD가 실제 게임에 표시되지 않던 문제 수정
- CustomHud의 최신 설정 구조(`config/custom-hud/profiles` + `config.json`)에 맞춰 HUD 프로필을 생성/활성화하도록 수정
- 사용자가 이미 CustomHud 프로필을 사용 중인 경우 해당 활성 프로필을 유지하면서 EasyCraft HUD 문구를 추가하도록 개선
- 정식 Release 태그를 정확히 `v0.4.19`로 변경
