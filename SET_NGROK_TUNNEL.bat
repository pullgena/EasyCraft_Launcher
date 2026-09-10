@echo off
setlocal
cd /d "%~dp0"
echo EasyCraft v0.4.15 already includes the ngrok domain:
echo https://waffle-gangway-actress.ngrok-free.dev
echo.
echo No setup is required. Press any key to re-apply the bundled domain.
set "EASYCRAFT_ACCOUNT_SERVER_URL=https://waffle-gangway-actress.ngrok-free.dev"
node scripts\configure-account-server.js
pause
