# Weird Host / ngrok — EasyCraft v0.4.16

런처에는 다음 계정 서버 도메인이 이미 포함되어 있습니다.

```text
https://waffle-gangway-actress.ngrok-free.dev
```

따라서 일반 빌드에서는 `SET_NGROK_TUNNEL.bat` 실행이 필요하지 않습니다.
Weird Host의 Account Server와 ngrok 터널이 실행 중인지 `/health` 엔드포인트로 확인하면 됩니다.
