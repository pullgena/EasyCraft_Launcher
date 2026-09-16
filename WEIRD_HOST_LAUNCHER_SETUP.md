# EasyCraft v0.4.23 Weird Host 연결

Launcher v0.4.23는 Account Server v0.4.22의 `web-microsoft-auth-v1` 기능을 사용합니다.
따라서 Weird Host 서버도 v0.4.23로 업데이트해야 합니다.

기본 Account Server 주소는 기존 ngrok 도메인을 그대로 사용합니다.
GitHub Actions에서 다른 주소를 사용하려면 `EASYCRAFT_ACCOUNT_SERVER_URL` Secret을 설정할 수 있습니다.

서버 업데이트 후 `/health`의 `capabilities`에서 아래 항목을 확인하세요.

- `server-microsoft-refresh-v1`
- `token-status-v1`
- `web-microsoft-auth-v1`
- `one-time-web-ticket-v1`
