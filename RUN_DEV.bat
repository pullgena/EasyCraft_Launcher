@echo off
setlocal
cd /d "%~dp0"
call npm install
if errorlevel 1 pause & exit /b 1
call npm start
