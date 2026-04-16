@echo off
setlocal
REM AUIB QMS Print Agent - single-file installer
REM Downloads the PowerShell agent from the QMS server, installs it,
REM creates a scheduled task to auto-start at every logon, and starts it now.

set "SERVER=http://10.171.0.25:3070"
set "TARGET=C:\AUIB-PrintAgent"
set "PS1=%TARGET%\print-agent.ps1"
set "CFG=%TARGET%\config.txt"
set "PRINTER=TX 80 Thermal"

echo.
echo =====================================================
echo  AUIB QMS  -  Print Agent Installer
echo =====================================================
echo   Target folder : %TARGET%
echo   Printer name  : %PRINTER%
echo   QMS server    : %SERVER%
echo =====================================================
echo.

REM 1. Create folder
if not exist "%TARGET%" mkdir "%TARGET%"

REM 2. Clean up any previous logo files (logo feature was removed)
if exist "%TARGET%\auib-logo.png" del /f /q "%TARGET%\auib-logo.png" >nul 2>&1
if exist "%TARGET%\auib-logo.esc" del /f /q "%TARGET%\auib-logo.esc" >nul 2>&1

REM 3. Download the agent PowerShell script
echo [1/5] Downloading agent script...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(New-Object Net.WebClient).DownloadFile('%SERVER%/agent-script', '%PS1%')"
if not exist "%PS1%" (
  echo ERROR: could not download agent script from %SERVER%/agent-script
  pause
  exit /b 1
)
echo     OK - saved to %PS1%

REM 4. Write config.txt with the printer name
echo [2/5] Writing config...
> "%CFG%" echo %PRINTER%
echo     OK - printer: %PRINTER%

REM 5. Stop any previous agent
echo [3/5] Stopping any previous agent...
schtasks /End /TN "AUIB-PrintAgent" >nul 2>&1
schtasks /Delete /TN "AUIB-PrintAgent" /F >nul 2>&1
taskkill /F /IM powershell.exe >nul 2>&1
ping -n 2 127.0.0.1 >nul
echo     Done.

REM 6. Install silent launcher + register with Startup folder
echo [4/5] Installing auto-start (Startup folder)...
set "VBS=%TARGET%\agent-launch.vbs"
> "%VBS%" echo Set oShell = CreateObject("WScript.Shell")
>> "%VBS%" echo sScript = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""%PS1%"""
>> "%VBS%" echo oShell.Run sScript, 0, False

REM Copy to CURRENT user's Startup folder (runs at every logon, no elevation needed)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP%" mkdir "%STARTUP%" >nul 2>&1
copy /Y "%VBS%" "%STARTUP%\AUIB-PrintAgent.vbs" >nul
if errorlevel 1 (
  echo     WARNING: could not copy to Startup folder
) else (
  echo     OK - will auto-start on every logon
)

REM 7. Start agent right now via the VBS
echo [5/5] Starting agent now...
wscript.exe "%VBS%"

REM 8. Wait up to 90 seconds for agent to respond
echo.
echo Waiting for agent to come online (up to 90 seconds)...
set /a _tries=0
:wait_loop
set /a _tries+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:9100/health).StatusCode } catch { 0 }" > "%TEMP%\auib_check.txt" 2>nul
set /p _status=<"%TEMP%\auib_check.txt"
del "%TEMP%\auib_check.txt" >nul 2>&1
if "%_status%"=="200" goto ok
if %_tries% geq 45 goto done_anyway
>nul ping -n 2 127.0.0.1
goto wait_loop

:ok
echo.
echo =====================================================
echo  SUCCESS - agent ONLINE at http://localhost:9100
echo  Auto-start registered in Startup folder.
echo =====================================================
echo.
pause
exit /b 0

:done_anyway
echo.
echo =====================================================
echo  Files installed and auto-start registered.
echo  The agent may still be starting in the background.
echo.
echo  To verify later, run:
echo     auib-agent-check.bat
echo  or open:
echo     http://localhost:9100/health
echo =====================================================
echo.
pause
exit /b 0
