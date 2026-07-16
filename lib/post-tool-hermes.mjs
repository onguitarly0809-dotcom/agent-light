#!/usr/bin/env node
// Hermes post_tool_call hook：读 stdin 的工具结果 JSON，工具出错发 error，否则发 thinking。
// Hermes 的 post_tool_call payload 结构（与 Claude Code 不同）：
//   { hook_event_name, tool_name, tool_input, session_id, cwd,
//     extra: { status: "ok"|"error"|"blocked", error_message, duration_ms, ... } }
// 判定：extra.status === "error" → error 灯；否则 → thinking 灯。
import net from 'node:net';

import { normalizeCommand } from './commands.mjs';

const host = process.env.CLAUDE_LIGHT_HOST ?? '127.0.0.1';
const port = Number(process.env.CLAUDE_LIGHT_PORT ?? 8765);

// 兜底：stdin 异常或没数据也要及时退出，不拖慢 Hermes
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
    const status = data?.extra?.status ?? '';
    if (status === 'error') {
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
