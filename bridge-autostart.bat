@echo off
REM agent-light serial bridge: autostart + restart loop.
REM If node crashes, wait ~3s and respawn. Uses ping (not timeout) because
REM timeout needs a console input handle and fails in a hidden window.
setlocal
cd /d "C:\Users\USER\Downloads\agent-light-main"
set "CLAUDE_LIGHT_WATCHDOG_MS=120000"
:loop
"D:\Program Files\nodejs\node.exe" serial-bridge.mjs
echo [%date% %time%] bridge exited, restarting in 3s...
ping -n 4 127.0.0.1 >nul
goto loop
