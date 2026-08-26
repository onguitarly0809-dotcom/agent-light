@echo off
echo ========================================
echo   ZCode Hook 活动实时监控
echo ========================================
echo.
echo 正在监控 ZCode 活动日志...
echo 按 Ctrl+C 停止监控
echo.
echo ========================================
echo.

cd /d "%~dp0"
tail -f agent-light-activity.log | findstr /C:"[zcode]"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 监控结束或未找到 ZCode 活动
    echo.
    echo 可能的原因：
    echo   1. ZCode 尚未启动
    echo   2. ZCode 尚未触发任何 hook 事件
    echo   3. 配置文件路径不正确
    echo.
    echo 请检查：
    echo   - 运行 node tools/test-zcode-hooks.mjs 验证配置
    echo   - 启动 ZCode 并提交一个测试问题
    echo   - 确认红绿灯桥接正在运行
    echo.
)

pause