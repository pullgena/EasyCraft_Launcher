# EasyCraft 인증 사이트 배포 (Beta 7)

Beta 7는 **웹사이트에서 Microsoft 로그인 → 사이트가 일회용 `EC-XXXX-XXXX-XXXX` 코드 발급 → EasyCraft Launcher에 코드 입력** 방식입니다.

먼저 학교 PC의 브라우저에서 사이트 로그인을 시험하고, 학교에서 Microsoft 로그인이 막히면 같은 사이트를 휴대폰에서 열어 코드를 발급받으면 됩니다.

## 1. Microsoft Entra 앱 등록

1. Microsoft Entra 관리 센터 → **App registrations → New registration**.
2. 이름 예: `EasyCraft Auth`.
3. 개인 Microsoft 계정을 포함하는 계정 유형을 선택합니다.
4. **Application (client) ID**를 메모합니다.
5. **Certificates & secrets → New client secret**을 만들고 생성 직후 보이는 **Value**를 메모합니다.
6. Worker 배포 후 주소가 `https://easycraft-auth.<계정>.workers.dev`라면 **Authentication → Web → Redirect URI**에 아래를 등록합니다.

```text
https://easycraft-auth.<계정>.workers.dev/oauth/callback
```

## 2. Cloudflare Worker 배포

`auth-site` 폴더에서:

```bash
npm install
npx wrangler login
npm run deploy
```

첫 배포 후 Worker 주소를 확인합니다. 그 주소의 `/oauth/callback`을 위 Microsoft Entra Redirect URI에 등록하세요.

그다음 비밀 값을 등록합니다.

```bash
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put STATE_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

- `MS_CLIENT_ID`: Microsoft Application (client) ID
- `MS_CLIENT_SECRET`: client secret의 Value
- `STATE_SECRET`: 서로 추측하기 어려운 32자 이상의 임의 문자열
- `TOKEN_ENCRYPTION_KEY`: STATE_SECRET과 다른 32자 이상의 임의 문자열

비밀 값을 넣은 뒤 다시:

```bash
npm run deploy
```

## 3. EasyCraft 설정

EasyCraft → **설정 → EasyCraft 인증 사이트**에 Worker 주소를 저장합니다.

```text
https://easycraft-auth.<계정>.workers.dev
```

## 4. 로그인 테스트

1. EasyCraft → 로그인 → **EasyCraft 코드 로그인 · BETA 7**.
2. **인증 사이트 열기**.
3. 먼저 학교 PC에서 Microsoft 로그인을 시도합니다.
4. 성공하면 사이트가 `EC-XXXX-XXXX-XXXX` 코드를 표시합니다.
5. 그 코드를 EasyCraft에 입력합니다.
6. 학교 PC에서 Microsoft 로그인이 막히면 휴대폰에서 인증 사이트를 열어 Microsoft 로그인 후 코드를 발급받고, 학교 PC EasyCraft에 입력합니다.

코드는 **5분 동안 한 번만** 사용할 수 있습니다.

## 중요: Minecraft/Xbox 앱 등록 제한

Microsoft 로그인 자체가 성공해도 새 Entra 앱이 Xbox/Minecraft Services에서 허용되지 않으면 Minecraft 계정 확인 단계에서 실패할 수 있습니다. 이 경우는 학교 네트워크가 아니라 Microsoft의 서드파티 Minecraft 앱 등록 권한 문제입니다. Beta 7 결과를 보고 다른 인증 방식을 이어서 시험할 수 있습니다.
