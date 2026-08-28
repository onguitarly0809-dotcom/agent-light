@echo off
echo Testing Codex hook with trust bypass...
cd /d "%~dp0.."
codex --dangerously-bypass-hook-trust exec -- "echo Hook test from Codex"
echo.
echo Checking activity log:
type agent-light-activity.log | findstr "codex"
echo.
echo Checking bridge log:
type bridge.log | findstr "codex"
