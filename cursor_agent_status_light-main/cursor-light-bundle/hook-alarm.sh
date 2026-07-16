#!/bin/bash
# 已弃用：MCP 即使用户无感也会触发 beforeMCPExecution，易误亮 alarm
# 请使用 hook-alarm-shell.sh（仅终端且非 sandbox 自动执行时）
DIR="$(cd "$(dirname "$0")" && pwd)"
cat >/dev/null
exit 0
