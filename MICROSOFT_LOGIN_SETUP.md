# EasyCraft Microsoft 로그인 설정 - Beta 8.1

## 사용자 화면에서는 Client ID를 입력하지 않습니다

Beta 8.1부터 EasyCraft 설정 화면의 **Microsoft Client ID 항목을 제거**했습니다.
학교 PC나 일반 사용자는 로그인 버튼만 누르면 됩니다.

```text
EasyCraft → 로그인 → 기본 브라우저 → Microsoft 로그인 → localhost → EasyCraft
```

## 개발자가 한 번만 해야 하는 일

Microsoft OAuth는 규격상 `client_id` 자체가 반드시 필요합니다. 따라서 사용자에게 입력시키지 않고 **빌드할 때 EasyCraft 안에 포함**합니다. Client ID는 비밀번호가 아니며 Client Secret은 넣지 않습니다.

### GitHub Actions로 빌드할 때

저장소에서:

`Settings → Secrets and variables → Actions → New repository secret`

이름:

```text
EASYCRAFT_MS_CLIENT_ID
```

값에는 Microsoft Entra의 `Application (client) ID`를 넣습니다.

그 뒤 Actions에서 빌드하면 자동으로 런처에 포함됩니다. 사용자 설정에는 표시되지 않습니다.

### 내 PC에서 직접 빌드할 때

`SET_MICROSOFT_CLIENT_ID.bat`을 한 번 실행하여 Application (client) ID를 입력한 뒤 `BUILD_EXE.bat`을 실행합니다.

## Microsoft Entra

앱 등록의 Authentication에서 `Mobile and desktop applications` 플랫폼에 `http://localhost` Redirect URI가 등록되어 있어야 합니다. Client Secret은 사용하지 않습니다.
