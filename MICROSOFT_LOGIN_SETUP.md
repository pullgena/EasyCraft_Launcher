# EasyCraft Beta 8 Microsoft 로그인 설정

Beta 8은 별도 인증 사이트, Python 서버, Cloudflare Worker, Client Secret을 사용하지 않습니다.

## 1. Microsoft Entra 앱 등록

1. Microsoft Entra 관리 센터의 **App registrations**에서 EasyCraft용 앱을 엽니다. 기존 Beta 7 인증 사이트용 앱을 재사용해도 됩니다.
2. Minecraft 개인 Microsoft 계정 로그인을 위해 앱의 지원 계정 유형이 **개인 Microsoft 계정을 포함**하도록 설정되어 있어야 합니다.
3. **Authentication → Add a platform → Mobile and desktop applications**를 선택합니다.
4. 시스템 브라우저용 Redirect URI로 정확히 `http://localhost`를 추가합니다.
5. 필요한 경우 **Allow public client flows / Enable the following mobile and desktop flows**를 켭니다.
6. Overview에서 **Application (client) ID**를 복사합니다.

## 2. EasyCraft 설정

EasyCraft를 실행한 뒤:

`설정 → Microsoft Client ID → Application (client) ID 붙여넣기 → 저장`

Client Secret은 입력하지 않습니다. 데스크톱 앱은 공개 클라이언트이므로 비밀 값을 프로그램 안에 넣지 않습니다.

## 3. 로그인

`EasyCraft → 로그인`을 누릅니다.

1. EasyCraft가 같은 PC의 `localhost`에 임시 수신 포트를 엽니다.
2. 기본 브라우저에서 Microsoft 공식 로그인 페이지가 열립니다.
3. Microsoft 로그인을 완료합니다.
4. 브라우저가 `http://localhost:<임시포트>`로 이동합니다.
5. EasyCraft가 Authorization Code를 받고 PKCE 검증 후 토큰을 교환합니다.
6. Xbox/Minecraft 계정을 확인하고 로그인합니다.
7. 임시 localhost 서버는 즉시 종료됩니다.

## 학교 PC에서 확인할 것

- Microsoft 로그인 페이지가 브라우저에서 열리는지
- 보안 프로그램이 EasyCraft의 localhost 수신을 막지 않는지
- Microsoft 로그인 후 브라우저에 `Microsoft 로그인 완료` 화면이 뜨는지

브라우저 로그인은 완료됐는데 EasyCraft가 받지 못하면 localhost 차단 또는 보안 프로그램 문제일 가능성이 큽니다.

## 중요

Microsoft 로그인 자체와 Minecraft Services의 제3자 Client ID 허용 여부는 서로 다른 단계입니다. Microsoft 로그인 및 localhost 복귀가 성공해도 Xbox/Minecraft Services 정책에 따라 마지막 Minecraft 계정 확인 단계가 거절될 수 있습니다.
