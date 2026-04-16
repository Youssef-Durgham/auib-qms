@echo off
REM AUIB Print Agent - DIAGNOSTIC runner
REM Kills everything, runs the agent visibly, shows every error.

cls
echo ======================================================
echo   AUIB Print Agent - Diagnostic Mode
echo ======================================================
echo.

echo [Step 1/4] Killing any running PowerShell processes
taskkill /F /IM powershell.exe >nul 2>&1
schtasks /End /TN "AUIB-PrintAgent" >nul 2>&1
ping -n 2 127.0.0.1 >nul
echo     Done.
echo.

echo [Step 2/4] Checking port 9100...
netstat -an | findstr ":9100 " >nul
if errorlevel 1 (
  echo     Port 9100 is FREE - good.
) else (
  echo     WARNING: port 9100 is still held by another process:
  netstat -anob 2>nul | findstr /C:":9100 " /A:0F
)
echo.

echo [Step 3/4] Verifying agent file exists...
set "PS1=C:\AUIB-PrintAgent\print-agent.ps1"
if not exist "%PS1%" (
  echo     ERROR: %PS1% not found. Run auib-agent-install.bat first.
  pause
  exit /b 1
)
echo     OK - %PS1%
echo.

echo [Step 4/4] Launching agent in foreground
echo ------------------------------------------------------
echo  If the agent crashes, the RED error text is what
echo  you need to send back to me.
echo  Leave this window open.
echo ------------------------------------------------------
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"

echo.
echo ======================================================
echo  Agent exited. This should NOT happen if things work.
echo  Send a screenshot of the text above.
echo ======================================================
pause
