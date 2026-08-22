@echo off
setlocal
set "APP_DIR=%~dp0nexcode\dist\win-unpacked"
set "EXE=%APP_DIR%\NexCode.exe"
set "TEST_PROFILE=%TEMP%\NexCode-TestProfile-%RANDOM%-%RANDOM%"
if not exist "%EXE%" (
  echo NexCode test build not found: "%EXE%"
  pause
  exit /b 1
)

echo Closing visible old NexCode processes...
taskkill /IM NexCode.exe /F >nul 2>nul

echo Using fresh test profile:
echo %TEST_PROFILE%

echo Starting NexCode in safe test mode...
start "NexCode Test" "%EXE%" --safe-mode --multi-instance --user-data-dir="%TEST_PROFILE%"

echo If window does not appear within 10 seconds, note this profile path and tell me.
pause
endlocal
