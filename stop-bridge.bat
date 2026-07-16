@echo off
REM Stop the agent-light bridge: kill the node bridge and the restart-loop cmd.
REM Run this before reflashing firmware to free COM3.
REM Filter by process name (node.exe / cmd.exe) so this script does not match
REM its own powershell.exe command line.
powershell -NoProfile -Command "$t = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*serial-bridge.mjs*') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*bridge-autostart.bat*') }); foreach ($p in $t) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host ('stopped ' + $t.Count + ' process(es)')"
