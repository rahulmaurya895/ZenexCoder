@echo off
setlocal
set "ELECTRON=%~dp0zenexcoder\node_modules\.bin\electron.cmd"
set "APP=%~dp0zenexcoder\out\main\main.js"
set "TEST_PROFILE=%TEMP%\ZenexCoder-DirectProfile-%RANDOM%-%RANDOM%"
if not exist "%ELECTRON%" (
  echo Electron launcher not found: "%ELECTRON%"
  pause
  exit /b 1
)
if not exist "%APP%" (
  echo Built app not found: "%APP%"
  pause
  exit /b 1
)

echo Closing visible old ZenexCoder processes...
taskkill /IM ZenexCoder.exe /F >nul 2>nul

echo Using fresh test profile:
echo %TEST_PROFILE%

echo Starting ZenexCoder direct from build...
call "%ELECTRON%" "%APP%" --safe-mode --multi-instance --user-data-dir="%TEST_PROFILE%"

echo If window does not appear within 10 seconds, note this profile path and tell me.
pause
endlocal
