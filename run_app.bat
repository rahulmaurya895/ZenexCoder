@echo off
:: Run ZenexCoder Electron app in development mode
cd /d "%~dp0zezenexcoderr"
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; npm run dev"
pause
