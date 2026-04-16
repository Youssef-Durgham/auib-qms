@echo off
REM AUIB Print Agent - status checker
echo.
echo Checking agent health at http://localhost:9100/health ...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:9100/health; Write-Host ('  OK - ' + $r.Content) -ForegroundColor Green } catch { Write-Host '  FAILED - agent is not responding.' -ForegroundColor Red; Write-Host $_.Exception.Message }"
echo.
echo Recent log (C:\AUIB-PrintAgent\agent.log):
echo ----------------------------------------------
if exist C:\AUIB-PrintAgent\agent.log (
  powershell -NoProfile -Command "Get-Content C:\AUIB-PrintAgent\agent.log -Tail 10"
) else (
  echo (no log file yet)
)
echo ----------------------------------------------
echo.
echo To restart the agent, run:
echo   wscript.exe C:\AUIB-PrintAgent\agent-launch.vbs
echo.
pause
