# EasyCraft Microsoft 코드 로그인 (Beta 4) 설정

이 기능은 `https://microsoft.com/link`에 짧은 코드를 입력하는 Microsoft Device Code Flow를 사용합니다.

## 필요한 것

1. Microsoft Entra에서 EasyCraft용 앱 등록을 만듭니다.
2. 지원 계정 유형은 개인 Microsoft 계정을 포함하도록 설정합니다.
3. 앱을 Public client/모바일·데스크톱 앱으로 사용할 수 있도록 설정합니다.
4. 생성된 **Application (client) ID**를 EasyCraft의 `설정 → Microsoft Client ID`에 붙여넣습니다.

> 중요: Minecraft Java 인증은 Microsoft OAuth 이후 Xbox Live/XSTS/Minecraft Services 인증을 사용합니다. 새로 만든 앱 등록은 `XboxLive.signin`/Minecraft Services 사용 승인이 필요할 수 있습니다. 승인되지 않은 Client ID라면 Microsoft 로그인까지 성공해도 Minecraft 계정 변환 단계에서 거절될 수 있습니다.

## 사용

EasyCraft → 로그인 → `Microsoft 코드로 로그인 · BETA 4` → 표시된 코드를 휴대폰의 `https://microsoft.com/link`에 입력 → 승인 완료. EasyCraft가 자동으로 확인합니다.
