@echo off
echo ========================================
echo   Codex Desktop 活动监控
echo ========================================
echo.
echo 正在监控 Codex Desktop hooks 活动...
echo 按 Ctrl+C 停止监控
echo.
echo ========================================
echo.

cd /d "%~dp0.."
tail -f agent-light-activity.log | findstr /C:"[codex]"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 监控结束或出错
    echo.
    pause
)
