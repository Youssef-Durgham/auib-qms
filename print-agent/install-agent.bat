@echo off
setlocal
REM AUIB QMS Print Agent - installer
REM Copies print-agent.ps1 to C:\AUIB-PrintAgent, creates a scheduled task to
REM auto-start the agent on every user logon, and starts it immediately.

set "TARGET=C:\AUIB-PrintAgent"
set "PS1=%TARGET%\print-agent.ps1"
set "CFG=%TARGET%\config.txt"
set "PRINTER=TX 80 Thermal"

echo.
echo ============================================
echo  AUIB QMS - Print Agent Installer
echo ============================================
echo.

REM 1. Create target folder
if not exist "%TARGET%" mkdir "%TARGET%"

REM 2. Copy agent script (same folder as this .bat)
copy /Y "%~dp0print-agent.ps1" "%PS1%" >nul
if not exist "%PS1%" (
  echo ERROR: could not copy print-agent.ps1 to %TARGET%
  echo Make sure print-agent.ps1 is in the same folder as this installer.
  pause
  exit /b 1
)

REM 3. Write config.txt with the printer name
> "%CFG%" echo %PRINTER%
echo Printer configured: %PRINTER%
echo   (to change later, edit %CFG% and restart the agent)
echo.

REM 4. Stop any previous running agent
taskkill /F /FI "WINDOWTITLE eq AUIB-PrintAgent*" >nul 2>&1
schtasks /End /TN "AUIB-PrintAgent" >nul 2>&1
schtasks /Delete /TN "AUIB-PrintAgent" /F >nul 2>&1

REM 5. Create scheduled task: runs at logon, highest privileges, hidden
schtasks /Create /TN "AUIB-PrintAgent" ^
  /TR "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File \"%PS1%\"" ^
  /SC ONLOGON /RL HIGHEST /F >nul
if errorlevel 1 (
  echo ERROR: failed to create scheduled task.
  pause
  exit /b 1
)
echo Scheduled task 'AUIB-PrintAgent' created - runs on every logon.

REM 6. Start the agent right now
schtasks /Run /TN "AUIB-PrintAgent" >nul 2>&1

echo.
echo Waiting for agent to come online...
set /a _tries=0
:wait_loop
set /a _tries+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 http://localhost:9100/health).StatusCode } catch { 0 }" > "%TEMP%\auib_agent_check.txt" 2>nul
set /p _status=<"%TEMP%\auib_agent_check.txt"
del "%TEMP%\auib_agent_check.txt" >nul 2>&1
if "%_status%"=="200" goto ok
if %_tries% geq 10 goto fail
timeout /t 1 /nobreak >nul
goto wait_loop

:ok
echo.
echo =====================================================
echo  Print Agent is ONLINE on http://localhost:9100
echo  It will auto-start on every logon from now on.
echo =====================================================
echo.
pause
exit /b 0

:fail
echo.
echo ---------------------------------------------------------
echo  Agent installed but did not come online in 10 seconds.
echo  Run it manually to see any error:
echo     powershell -ExecutionPolicy Bypass -File "%PS1%"
echo ---------------------------------------------------------
echo.
pause
exit /b 1
