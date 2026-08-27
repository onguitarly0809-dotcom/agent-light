@echo off
REM agent-light serial bridge: autostart + restart loop.
REM If node crashes, wait ~3s and respawn. Uses ping (not timeout) because
REM timeout needs a console input handle and fails in a hidden window.
REM Output appended to bridge.log so boot-time serial failures are diagnosable.
REM Portable: %~dp0 locates this script's folder (any drive/path works),
REM node is resolved from PATH, serial port auto-detected (ESP32 VID 303a first).
setlocal
cd /d "%~dp0"
set "CLAUDE_LIGHT_WATCHDOG_MS=120000"
:loop
node serial-bridge.mjs >> bridge.log 2>&1
echo [%date% %time%] bridge exited, restarting in 3s... >> bridge.log
ping -n 4 127.0.0.1 >nul
goto loop
