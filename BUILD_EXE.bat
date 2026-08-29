@echo off
setlocal
cd /d "%~dp0"
echo [1/2] Installing dependencies...
call npm install
if errorlevel 1 goto :error
echo [2/2] Building Windows installer...
call npm run dist:win -- --publish never
if errorlevel 1 goto :error
echo.
echo Build complete. Check the dist folder.
pause
exit /b 0
:error
echo.
echo Build failed.
pause
exit /b 1
