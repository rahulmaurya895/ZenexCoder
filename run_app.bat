@echo off
:: Run ZezenexCoderr Electron app in development mode
cd /d "%~dp0zenexcoder"
powershell -NoProfile -Command "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force; npm run dev"
pause
