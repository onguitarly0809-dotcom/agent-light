#!/usr/bin/env node
// PostToolUse hook：读 stdin 的工具结果 JSON，工具出错发 error，否则发 thinking。
// 出错判定（保守、低误报）：tool_response.is_error === true。
import net from 'node:net';

import { normalizeCommand } from './commands.mjs';

const host = process.env.CLAUDE_LIGHT_HOST ?? '127.0.0.1';
const port = Number(process.env.CLAUDE_LIGHT_PORT ?? 8765);

// 兜底：stdin 异常或没数据也要及时退出，不拖慢 Claude Code
const guard = setTimeout(() => process.exit(0), 300);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  clearTimeout(guard);
  send(decide(raw));
});

function decide(text) {
  try {
    const data = JSON.parse(text);
    const response = data?.tool_response;
    if (response && response.is_error === true) {
      return 'error';
    }
  } catch {
    // 解析失败按正常处理
  }
  return 'thinking';
}

function send(state) {
  let command;
  try {
    command = normalizeCommand(state);
  } catch {
    process.exit(0);
  }

  const socket = net.createConnection({ host, port });
  const finish = () => process.exit(0);
  socket.setTimeout(250, finish);
  socket.on('connect', () => socket.end(`${command}\n`));
  socket.on('error', finish);
  socket.on('close', finish);
}
