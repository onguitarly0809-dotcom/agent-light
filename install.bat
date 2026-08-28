@echo off
REM Agent Light one-click installer (ASCII-only for cmd parser safety).
REM All interactive Chinese UI lives in install.mjs, which switches the
REM console to UTF-8 by itself. Do NOT add non-ASCII text or chcp here:
REM chcp 65001 mid-file desyncs the batch parser on Chinese Windows.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js not found. Install Node.js 18+ from https://nodejs.org first,
    echo     then run this script again.
    pause
    exit /b 1
)

if not exist "node_modules\serialport" (
    echo [*] Installing dependencies ^(serialport^), takes 1-2 minutes...
    call npm install
    if errorlevel 1 (
        echo [X] npm install failed. Check your network and retry.
        pause
        exit /b 1
    )
)

node install.mjs
echo.
pause
