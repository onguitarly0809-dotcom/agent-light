@echo off
echo ========================================
echo   ZCode Hooks 自动配置脚本
echo ========================================
echo.

set "ZCODE_CONFIG=%USERPROFILE%\.zcode\cli\config.json"
set "PROJECT_DIR=%~dp0"
set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

echo 配置信息：
echo   ZCode配置文件: %ZCODE_CONFIG%
echo   项目目录: %PROJECT_DIR%
echo.

if not exist "%ZCODE_CONFIG%" (
    echo [!] ZCode配置文件不存在，将创建新文件
    echo {"hooks": {"enabled": true, "events": {}}} > "%ZCODE_CONFIG%"
)

echo [*] 正在备份现有配置...
copy "%ZCODE_CONFIG%" "%ZCODE_CONFIG%.backup" >nul 2>&1

echo [*] 正在添加Agent Light hooks配置...
echo.

powershell -ExecutionPolicy Bypass -Command ^
"$config = Get-Content '%ZCODE_CONFIG%' -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue; ^
if (-not $config.hooks) { $config.hooks = @{} }; ^
$config.hooks.enabled = $true; ^
if (-not $config.hooks.events) { $config.hooks.events = @{} }; ^
$config.hooks.events.SessionStart = @(,@( @{ hooks = @( @{ type = 'command'; command = 'node %PROJECT_DIR:\=/%/hook-client.mjs idle zcode'; timeout = 5 } ) } )); ^
$config.hooks.events.UserPromptSubmit = @(,@( @{ hooks = @( @{ type = 'command'; command = 'node %PROJECT_DIR:\=/%/hook-client.mjs thinking zcode'; timeout = 5 } ) } )); ^
$config.hooks.events.PreToolUse = @(,@( @{ matcher = 'Bash|Read|Write|Edit|WebSearch|WebFetch|Agent|Skill|AskUserQuestion|EnterPlanMode|ExitPlanMode'; hooks = @( @{ type = 'command'; command = 'node %PROJECT_DIR:\=/%/hook-client.mjs running zcode'; timeout = 5 } ) } )); ^
$config.hooks.events.PostToolUse = @(,@( @{ hooks = @( @{ type = 'command'; command = 'node %PROJECT_DIR:\=/%/lib/post-tool.mjs'; timeout = 5 } ) } )); ^
$config.hooks.events.PermissionRequest = @(,@( @{ hooks = @( @{ type = 'command'; command = 'node %PROJECT_DIR:\=/%/hook-client.mjs alarm zcode'; timeout = 5 } ) } )); ^
$config.hooks.events.Stop = @(,@( @{ hooks = @( @{ type = 'command'; command = 'node %PROJECT_DIR:\=/%/hook-client.mjs idle zcode'; timeout = 5 } ) } )); ^
$config | ConvertTo-Json -Depth 10 | Set-Content '%ZCODE_CONFIG%'"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   ✓ 配置成功！
    echo ========================================
    echo.
    echo 已完成的配置：
    echo   [✓] ZCode hooks已启用
    echo   [✓] SessionStart → 空闲状态（绿色）
    echo   [✓] UserPromptSubmit → 思考状态（跑马灯）
    echo   [✓] PreToolUse → 运行状态（黄色闪烁）
    echo   [✓] PostToolUse → 完成/错误状态
    echo   [✓] PermissionRequest → 警报状态（红黄交替）
    echo   [✓] Stop → 空闲状态（绿色）
    echo.
    echo 下一步操作：
    echo   1. 确保红绿灯桥接正在运行：node control.mjs
    echo   2. 启动ZCode：scripts/zcode-desktop-hooks.bat
    echo   3. 监控活动日志：tail -f agent-light-activity.log
    echo.
    echo 备份文件： %ZCODE_CONFIG%.backup
    echo.
) else (
    echo.
    echo [!] 配置失败！请手动配置
    echo.
    echo 手动配置步骤：
    echo   1. 打开文件：%ZCODE_CONFIG%
    echo   2. 参考 configs/zcode-hooks-snippet.json 添加hooks配置
    echo.
)

pause