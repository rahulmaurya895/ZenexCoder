@echo off
setlocal
set "EXE=%~dp0nexcode\dist-test\win-unpacked\NexCode.exe"
set "TEST_PROFILE=%TEMP%\NexCode-Standalone-%RANDOM%-%RANDOM%"
if not exist "%EXE%" (
  echo Test exe not found: "%EXE%"
  pause
  exit /b 1
)

echo Closing old NexCode processes...
taskkill /IM NexCode.exe /F >nul 2>nul

echo Using fresh profile:
echo %TEST_PROFILE%
start "" "%EXE%" --safe-mode --multi-instance --user-data-dir="%TEST_PROFILE%"
pause
endlocal
