@echo off
setlocal
set "APP_DIR=%~dp0zenexcoder\dist\win-unpacked"
set "EXE=%APP_DIR%\ZenexCoder.exe"
set "TEST_PROFILE=%TEMP%\ZenexCoder-TestProfile-%RANDOM%-%RANDOM%"
if not exist "%EXE%" (
  echo ZenexCoder test build not found: "%EXE%"
  pause
  exit /b 1
)

echo Closing visible old ZenexCoder processes...
taskkill /IM ZenexCoder.exe /F >nul 2>nul

echo Using fresh test profile:
echo %TEST_PROFILE%

echo Starting ZenexCoder in safe test mode...
start "ZenexCoder Test" "%EXE%" --safe-mode --multi-instance --user-data-dir="%TEST_PROFILE%"

echo If window does not appear within 10 seconds, note this profile path and tell me.
pause
endlocal
