@echo off
setlocal
REM AUIB QMS Print Agent - single-file installer
REM Downloads the PowerShell agent from the QMS server, installs it,
REM creates a scheduled task to auto-start at every logon, and starts it now.

set "SERVER=http://10.171.0.25:3070"
set "TARGET=C:\AUIB-PrintAgent"
set "PS1=%TARGET%\print-agent.ps1"
set "CFG=%TARGET%\config.txt"
set "LOGO=%TARGET%\auib-logo.png"
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

REM 2. Download the agent PowerShell script
echo [1/6] Downloading agent script...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(New-Object Net.WebClient).DownloadFile('%SERVER%/agent-script', '%PS1%')"
if not exist "%PS1%" (
  echo ERROR: could not download agent script from %SERVER%/agent-script
  pause
  exit /b 1
)
echo     OK - saved to %PS1%

REM 3. Download the AUIB logo for the thermal receipt
echo [2/6] Downloading AUIB logo...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "(New-Object Net.WebClient).DownloadFile('%SERVER%/auib-logo.png', '%LOGO%')"
if exist "%LOGO%" (echo     OK - saved to %LOGO%) else (echo     Skipped)

REM 4. Write config.txt with the printer name
echo [3/6] Writing config...
> "%CFG%" echo %PRINTER%
echo     OK - printer: %PRINTER%

REM 5. Remove any previous task + running agent
echo [4/6] Removing previous agent (if any)...
schtasks /End /TN "AUIB-PrintAgent" >nul 2>&1
schtasks /Delete /TN "AUIB-PrintAgent" /F >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq AUIB-PrintAgent*" >nul 2>&1

REM 6. Create scheduled task (auto-start at logon, highest privileges, hidden)
echo [5/6] Creating scheduled task 'AUIB-PrintAgent'...
schtasks /Create /TN "AUIB-PrintAgent" ^
  /TR "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%PS1%\"" ^
  /SC ONLOGON /RL HIGHEST /F >nul
if errorlevel 1 (
  echo ERROR: could not create scheduled task. Try running this file as Administrator.
  pause
  exit /b 1
)
echo     OK

REM 7. Start agent right now
echo [6/6] Starting agent...
schtasks /Run /TN "AUIB-PrintAgent" >nul 2>&1

REM 7. Wait for it to come online (first run includes one-time logo encoding)
echo.
echo Waiting for agent to come online (may take up to 30s on first run)...
set /a _tries=0
:wait_loop
set /a _tries+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:9100/health).StatusCode } catch { 0 }" > "%TEMP%\auib_check.txt" 2>nul
set /p _status=<"%TEMP%\auib_check.txt"
del "%TEMP%\auib_check.txt" >nul 2>&1
if "%_status%"=="200" goto ok
if %_tries% geq 30 goto fail
>nul ping -n 2 127.0.0.1
goto wait_loop

:ok
echo.
echo =====================================================
echo  SUCCESS - agent ONLINE at http://localhost:9100
echo  It will auto-start on every logon from now on.
echo.
echo  Test by opening http://10.171.0.25:3070/ticket on
echo  this PC and tapping a category. The ticket should
echo  print instantly with no dialog.
echo =====================================================
echo.
pause
exit /b 0

:fail
echo.
echo -----------------------------------------------------
echo  Agent installed but did not come online.
echo  Run it manually to see errors:
echo     powershell -ExecutionPolicy Bypass -File "%PS1%"
echo -----------------------------------------------------
echo.
pause
exit /b 1
