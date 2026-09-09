@echo off
setlocal
cd /d "%~dp0"
echo.
echo EasyCraft Microsoft Login - Developer Setup
echo ---------------------------------------------
echo This value is embedded into the launcher build.
echo End users will NOT see a Client ID setting in EasyCraft.
echo.
set /p ECID=Application (client) ID: 
if "%ECID%"=="" goto :error
powershell -NoProfile -Command "$id='%ECID%'.Trim(); if($id -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'){exit 2}; @{clientId=$id} | ConvertTo-Json | Set-Content -Encoding UTF8 'src\microsoft-auth.json'"
if errorlevel 1 goto :error
echo.
echo Saved. You can now build EasyCraft.
pause
exit /b 0
:error
echo.
echo Invalid Client ID. Nothing was changed.
pause
exit /b 1
