@echo off
:: Run NexCode Electron app in development mode
cd /d "%~dp0nexcode"
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; npm run dev"
pause
