#!/usr/bin/env node
// PostToolUse hook（Codex 版）：读 stdin 的工具结果 JSON，工具出错发 error，否则发 thinking。
// Codex 与 Claude Code 的 stdin 结构不同：
//   - Claude Code: tool_response.is_error === true
//   - Codex:       tool_response 可能是空串，也可能是含 is_error / exit_code 的对象
// 判定（保守、低误报）：is_error===true 或数字 exit_code!==0 → error；其余一律 thinking。
// 与 post-tool.mjs（Claude 版）分开，避免改动已工作的 Claude 链路。
import net from 'node:net';

import { normalizeCommand } from './commands.mjs';

const host = process.env.CLAUDE_LIGHT_HOST ?? '127.0.0.1';
const port = Number(process.env.CLAUDE_LIGHT_PORT ?? 8765);

// 兜底：stdin 异常或没数据也要及时退出，不拖慢 Codex
const guard = setTimeout(() => process.exit(0), 300);

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('error', () => process.exit(0));
process.stdin.on('end', () => {
  clearTimeout(guard);
  send(decide(raw));
});

// 归一化：tool_response 可能是对象，也可能是个 JSON 字符串（旧版 Codex 偶见空串）。
function isErrorResponse(resp) {
  if (typeof resp === 'string') {
    if (resp.trim() === '') return false; // 空串无从判断，按正常处理
    try { resp = JSON.parse(resp); } catch { return false; }
  }
  if (!resp || typeof resp !== 'object') return false;
  if (resp.is_error === true) return true;
  if (typeof resp.exit_code === 'number' && resp.exit_code !== 0) return true;
  return false;
}

function decide(text) {
  try {
    const data = JSON.parse(text);
    if (isErrorResponse(data?.tool_response)) return 'error';
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
