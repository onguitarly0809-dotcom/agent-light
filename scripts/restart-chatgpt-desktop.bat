@echo off
echo ========================================
echo   ChatGPT Desktop 完全重启脚本
echo ========================================
echo.
echo 正在关闭所有 ChatGPT 进程...
taskkill /F /IM ChatGPT.exe 2>nul
taskkill /F /IM codex.exe 2>nul
taskkill /F /IM codex-command-runner*.exe 2>nul
echo.
echo 等待进程完全结束...
timeout /t 3 /nobreak
echo.
echo 检查是否还有残留进程...
tasklist | findstr /I "ChatGPT codex"
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ⚠️  仍有残留进程，请手动关闭 ChatGPT Desktop
) else (
    echo ✅ 所有 ChatGPT 进程已关闭
)
echo.
echo ========================================
echo   请手动重新启动 ChatGPT Desktop
echo ========================================
echo.
echo 启动后请发送测试消息验证红绿灯功能
echo.
pause