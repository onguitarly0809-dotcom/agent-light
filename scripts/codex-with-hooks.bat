@echo off
REM Codex 启动脚本，自动绕过 hooks 信任检查
codex --dangerously-bypass-hook-trust %*
