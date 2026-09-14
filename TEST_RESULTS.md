# EasyCraft v0.4.20 Test Results

- `npm run test:smoke`: PASS
- `node --check src/main.js`: PASS
- `node --check src/renderer.js`: PASS
- `node --check src/preload.js`: PASS
- `node --check src/minecraft-worker.js`: PASS
- build helper JS syntax checks: PASS
- Launcher version/tag invariants (`0.4.20` / `v0.4.20`): PASS
- Account Server capability requirement (`server-microsoft-refresh-v1`): PASS
- Launcher strips `refresh_token` from server-delivered local account cache: PASS
- Server AES-256-GCM token vault encrypt/decrypt self-test: PASS
- Server cached Minecraft session response does not return refresh token: PASS
- Server `/health` local HTTP test: PASS
- Python syntax compile: PASS

Actual Microsoft/Xbox/Minecraft token renewal requires a real Microsoft/Minecraft account and the deployed Weird Host/ngrok server, so that external end-to-end login cannot be completed in this build environment.
