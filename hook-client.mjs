#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import net from 'node:net';

import { normalizeCommand } from './lib/commands.mjs';

const host = process.env.CLAUDE_LIGHT_HOST ?? '127.0.0.1';
const port = Number(process.env.CLAUDE_LIGHT_PORT ?? 8765);
const timeoutMs = Number(process.env.CLAUDE_LIGHT_TIMEOUT_MS ?? 250);
const state = process.argv[2] ?? 'idle';
// 来源归属（供监控区分"哪个 CLI 在驱动灯"）：
// - Claude hooks 不传第三参 → 默认 'claude'（现有配置零改动）
// - Codex hooks 显式传 `codex`（见 ~/.codex/hooks.json）
// 追加写 agent-light-activity.log，失败静默，不影响 TCP 发送与灯。
const source = process.argv[3] ?? 'claude';
const ACTIVITY_LOG = new URL('./agent-light-activity.log', import.meta.url);

let command;
try {
  command = normalizeCommand(state);
} catch (error) {
  console.error(error.message);
  process.exit(0);
}

try {
  appendFileSync(ACTIVITY_LOG, `[${source}] ${new Date().toLocaleTimeString()} ${command}\n`);
} catch {
  // 日志写失败不影响灯
}

const socket = net.createConnection({ host, port });
const finish = () => process.exit(0);

socket.setTimeout(timeoutMs, finish);
socket.on('connect', () => {
  socket.end(`${command}\n`);
});
socket.on('error', finish);
socket.on('close', finish);
