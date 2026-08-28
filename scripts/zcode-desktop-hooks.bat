@echo off
echo ========================================
echo   ZCode + 红绿灯 Hooks 启动脚本
echo ========================================
echo.
echo 功能特性：
echo   [OK] 红绿灯视觉反馈已启用
echo   [OK] 思考状态：跑马灯效果（绿→黄→红）
echo   [OK] 运行状态：黄色闪烁（500ms）
echo   [OK] 错误状态：红色渐变闪烁
echo   [OK] 警报状态：红黄交替警告
echo   [OK] 空闲状态：绿色常亮
echo.
echo 配置要求：
echo   [1] ZCode hooks配置已添加到 ~/.zcode/cli/config.json
echo   [2] 红绿灯桥接服务正在运行（端口 8765）
echo   [3] hook-client.mjs 路径正确配置
echo.
echo 使用说明：
echo   首次使用前，请运行配置脚本：
echo     setup-zcode-hooks.bat
echo.
echo ========================================
echo.
echo 正在启动 ZCode...
echo.

zcode %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 启动失败！错误代码：%ERRORLEVEL%
    echo.
    echo 故障排除建议：
    echo   1. 检查 ZCode 是否正确安装
    echo   2. 验证 hooks 配置：~/.zcode/cli/config.json
    echo   3. 确保红绿灯桥接服务正在运行：node control.mjs
    echo   4. 检查活动日志：tail -f agent-light-activity.log
    echo.
    pause
)