@echo off
REM agent-light serial bridge: autostart + restart loop.
REM If node crashes, wait ~3s and respawn. Uses ping (not timeout) because
REM timeout needs a console input handle and fails in a hidden window.
REM Output appended to bridge.log so boot-time serial failures are diagnosable.
setlocal
cd /d "E:\agent-light-main"
set "CLAUDE_LIGHT_WATCHDOG_MS=120000"
:loop
 "D:\Program Files\nodejs\node.exe" serial-bridge.mjs --serial COM3 >> bridge.log 2>&1
echo [%date% %time%] bridge exited, restarting in 3s... >> bridge.log
ping -n 4 127.0.0.1 >nul
goto loop
