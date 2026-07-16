#!/usr/bin/env node
// Notification hook：区分"需要处理"与"空闲等你"。
// - 权限请求 / 需注意 → 发 alarm（红黄警灯）
// - 空闲等待输入（Claude 等你超过 ~60s）→ 不发灯，保持当前状态（绿灯）
// 判定：Notification 的 message 里含 "waiting for your input" 视为空闲等待，其余一律 alarm。
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
    const message = String(data?.message ?? '');
    // 空闲等待输入：不发灯
    if (/waiting for your input/i.test(message)) {
      return null;
    }
  } catch {
    // 解析失败：保守起见报警（可能是真需要处理）
  }
  return 'alarm';
}

function send(state) {
  if (state === null) {
    process.exit(0); // 空闲等待，保持当前灯态
  }
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
