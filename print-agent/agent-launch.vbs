' AUIB Print Agent - silent launcher
' Starts print-agent.ps1 hidden. Called from Windows Startup folder.
Set oShell = CreateObject("WScript.Shell")
sScript = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\AUIB-PrintAgent\print-agent.ps1"""
oShell.Run sScript, 0, False
