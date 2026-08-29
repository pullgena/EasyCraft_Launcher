# EasyCraft Launcher 0.3.2

Windows용 Minecraft Java 런처입니다. 인스턴스별 설정, Modrinth 검색/설치/업데이트, Microsoft 로그인, 자동 업데이트를 지원합니다.

## 이번 버전에서 중요한 점

### 자동 업데이트
자동 업데이트 대상은 `pullgena/launch-2.0`입니다. 일반 사용자 PC에서 인증 토큰 없이 업데이트하려면 이 GitHub 저장소가 **Public**이어야 하며, `v0.3.2` 같은 Release가 **Published** 상태여야 합니다. Release Assets에는 `latest.yml`, `.exe`, `.blockmap`이 있어야 합니다.

### 앱 데이터 삭제
EasyCraft를 Windows의 '설치된 앱'에서 실제 제거하면 `%APPDATA%` 아래 EasyCraft 전용 폴더를 정리합니다. 자동 업데이트 과정에서는 데이터를 지우지 않습니다.

`C:\Users\<사용자>\AppData\Roaming` 자체는 Windows 및 다른 앱의 데이터가 있으므로 삭제하지 않습니다.

## GitHub Actions 빌드
1. 파일 교체 후 main에 Commit/Push
2. Actions의 일반 빌드 성공 확인
3. GitHub Release에서 `v0.3.2` 태그를 생성하고 Publish
4. 태그 Actions 성공 확인
5. Release Assets에 `EasyCraft-Launcher-Setup-0.3.2.exe`, `latest.yml`, `.blockmap`이 있는지 확인
