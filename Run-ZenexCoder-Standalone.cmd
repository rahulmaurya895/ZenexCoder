@echo off
setlocal
set "EXE=%~dp0zenexcoder\dist-test\win-unpacked\ZenexCoder.exe"
set "TEST_PROFILE=%TEMP%\ZenexCoder-Standalone-%RANDOM%-%RANDOM%"
if not exist "%EXE%" (
  echo Test exe not found: "%EXE%"
  pause
  exit /b 1
)

echo Closing old ZenexCoder processes...
taskkill /IM ZenexCoder.exe /F >nul 2>nul

echo Using fresh profile:
echo %TEST_PROFILE%
start "" "%EXE%" --safe-mode --multi-instance --user-data-dir="%TEST_PROFILE%"
pause
endlocal
