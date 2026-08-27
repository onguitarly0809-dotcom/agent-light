@echo off
chcp 65001 >nul
REM Agent Light 一键安装：检查 Node → 装依赖 → 配 CLI hooks → 开机自启 → 启动桥自检
REM 便携：%~dp0 定位自身目录，项目文件夹放任何盘符都能装。
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [X] 未检测到 Node.js。
    echo     请先到 https://nodejs.org 安装 Node.js 18+（一路默认即可），
    echo     装完后重新双击本脚本。
    pause
    exit /b 1
)

if not exist "node_modules\serialport" (
    echo [*] 首次运行：安装依赖 serialport 中（约 1-2 分钟）...
    call npm install
    if errorlevel 1 (
        echo [X] npm install 失败：请检查网络后重试。
        pause
        exit /b 1
    )
)

node install.mjs
echo.
pause
