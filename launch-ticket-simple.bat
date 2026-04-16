@echo off
setlocal
REM AUIB QMS - Kiosk launcher (Google Chrome, fullscreen)
REM Opens the ticket page in Chrome kiosk mode. Printing is handled by the
REM local print agent on port 9100, so no --kiosk-printing flag is needed.

set "URL=http://10.171.0.25:3070/ticket"
set "PROFILE=%LOCALAPPDATA%\AUIB-QMS-Kiosk2"

taskkill /F /IM chrome.exe >nul 2>&1

set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined CHROME (
  echo Google Chrome is not installed. Install it from https://www.google.com/chrome/
  pause
  exit /b 1
)

if exist "%PROFILE%\SingletonLock"   del /f /q "%PROFILE%\SingletonLock"   >nul 2>&1
if exist "%PROFILE%\SingletonCookie" del /f /q "%PROFILE%\SingletonCookie" >nul 2>&1
if exist "%PROFILE%\SingletonSocket" del /f /q "%PROFILE%\SingletonSocket" >nul 2>&1

"%CHROME%" --kiosk --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%PROFILE%" "%URL%"
endlocal
