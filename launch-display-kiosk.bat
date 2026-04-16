@echo off
REM AUIB QMS — Display TV launcher (Google Chrome)
REM Kiosk mode with autoplay enabled so voice announcements work without any
REM "click to activate" prompt.

set URL=http://10.171.0.25:3070/display
set PROFILE=%LOCALAPPDATA%\AUIB-QMS-Display

taskkill /F /IM chrome.exe >nul 2>&1

set CHROME=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set CHROME="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined CHROME (
  echo Google Chrome is not installed on this PC.
  echo Download it from https://www.google.com/chrome/ and install, then re-run this file.
  pause
  exit /b 1
)

start "" %CHROME% ^
  --kiosk ^
  --autoplay-policy=no-user-gesture-required ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --user-data-dir="%PROFILE%" ^
  %URL%
