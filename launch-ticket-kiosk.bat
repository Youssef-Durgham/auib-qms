@echo off
setlocal
REM AUIB QMS - Ticket Kiosk launcher (Google Chrome)
REM Silent printing to Windows default printer.

set "URL=http://10.171.0.25:3070/ticket?kiosk=1"
set "PROFILE=%LOCALAPPDATA%\AUIB-QMS-Kiosk"

echo [1/4] Killing any running Chrome...
taskkill /F /IM chrome.exe >nul 2>&1

echo [2/4] Locating Chrome...
set "CHROME="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined CHROME (
  echo.
  echo ERROR: Google Chrome not found on this PC.
  echo Install it from https://www.google.com/chrome/ then re-run this file.
  echo.
  pause
  exit /b 1
)

echo     Chrome: "%CHROME%"
echo     URL:    %URL%
echo     Profile: %PROFILE%
echo.

echo [3/4] Clearing any stale Singleton lock files...
if exist "%PROFILE%\SingletonLock" del /f /q "%PROFILE%\SingletonLock" >nul 2>&1
if exist "%PROFILE%\SingletonCookie" del /f /q "%PROFILE%\SingletonCookie" >nul 2>&1
if exist "%PROFILE%\SingletonSocket" del /f /q "%PROFILE%\SingletonSocket" >nul 2>&1

echo [4/4] Launching Chrome in kiosk printing mode...
"%CHROME%" --kiosk --kiosk-printing --no-first-run --no-default-browser-check --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%PROFILE%" "%URL%"

if errorlevel 1 (
  echo.
  echo Chrome exited with an error. Code: %errorlevel%
  pause
)
endlocal
