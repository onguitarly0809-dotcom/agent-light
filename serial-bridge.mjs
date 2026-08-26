#!/usr/bin/env node
import net from 'node:net';
import { SerialPort } from 'serialport';

import { normalizeCommand } from './lib/commands.mjs';

const options = parseArgs(process.argv.slice(2));
const baud = options.baud;

let serial;
try {
  serial = await openSerial(options.serial, baud);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');

  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      sendCommand(line);
    }
  });
});

console.log(`Claude light bridge connected to ${serial.path} at ${baud} baud`);
console.log(`Listening on 127.0.0.1:${options.listen}`);
// 兼容 CH340/CP2102 类板子开端口时触发 ESP32 复位：稍候再发初始命令。
// 原生 USB CDC 的板子无此问题，延迟只是多等一会。
setTimeout(() => sendCommand(options.initial), 1500);

// zombie 修复：串口断开（拔插/重枚举）时若只设 exitCode 不退出，进程会保持
// 假死（TCP 活着、串口死了），由 bridge-autostart.bat 托管的重启循环永远不触发。
// 这里改为直接退出，交给重启循环重连。shuttingDown 避免正常关闭流程被误杀。
let shuttingDown = false;

serial.on('error', (error) => {
  console.error(`Serial error: ${error.message}`);
  if (!shuttingDown) {
    console.error('Serial error is fatal (restart loop will reconnect); exiting.');
    process.exit(1);
  }
});

serial.on('close', (err) => {
  if (shuttingDown) return;
  const reason = err?.disconnected ? 'disconnected' : 'closed';
  console.error(`Serial port ${reason}; exiting for reconnect.`);
  process.exit(1);
});

server.listen(options.listen, '127.0.0.1');

// 兜底：重复桥导致 EADDRINUSE 时干净退出，让重启循环等端口释放后重连。
server.on('error', (error) => {
  console.error(`Server error: ${error.message}`);
  if (!shuttingDown) process.exit(1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function sendCommand(rawCommand) {
  let command;
  try {
    command = normalizeCommand(rawCommand);
  } catch (error) {
    console.error(error.message);
    return;
  }

  serial.write(`${command}\n`);
  console.log(`${new Date().toLocaleTimeString()} -> ${command}`);
  updateWatchdog(command);
}

// 看门狗：Esc 打断时没有 hook 触发，活动态（思考/运行/出错）若超过 N 秒没再收到
// 任何命令，就判定被打断，自动回 idle。alarm（需要确认）是粘住的，不回退；
// 手动直接命令（R:on 等）也不回退，保持原样。
let watchdogTimer = null;

// running 的实际令牌（随 DEFAULTS.running / CLAUDE_LIGHT_RUNNING 变化），用于看门狗分类。
const RUNNING_COMMAND = normalizeCommand('running');

function category(command) {
  if (command === 'alarm') return 'alarm';
  if (command === 'chase' || command === 'error' || command === RUNNING_COMMAND) return 'active';
  if (/^[GYR]:on$/.test(command) || /:off/.test(command)) return 'idle';
  return 'other';                                         // 手动测试命令
}

function updateWatchdog(command) {
  if (options.watchdog <= 0) return;
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  if (category(command) !== 'active') return;
  watchdogTimer = setTimeout(() => {
    console.log(`${new Date().toLocaleTimeString()} watchdog: no activity for ${options.watchdog}ms, returning to idle`);
    sendCommand('idle');
  }, options.watchdog);
}

function shutdown() {
  shuttingDown = true;
  if (watchdogTimer) clearTimeout(watchdogTimer);
  sendCommand('idle');
  server.close();
  serial.close(() => process.exit(0));
}

function parseArgs(args) {
  const parsed = {
    serial: process.env.CLAUDE_LIGHT_SERIAL ?? 'auto',
    baud: Number(process.env.CLAUDE_LIGHT_BAUD ?? 115200),
    listen: Number(process.env.CLAUDE_LIGHT_PORT ?? 8765),
    initial: process.env.CLAUDE_LIGHT_INITIAL ?? 'idle',
    watchdog: Number(process.env.CLAUDE_LIGHT_WATCHDOG_MS ?? 120000),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--serial') {
      parsed.serial = next;
      index += 1;
    } else if (arg === '--baud') {
      parsed.baud = Number(next);
      index += 1;
    } else if (arg === '--listen') {
      parsed.listen = Number(next);
      index += 1;
    } else if (arg === '--initial') {
      parsed.initial = next;
      index += 1;
    }
  }

  if (!Number.isInteger(parsed.baud) || parsed.baud <= 0) {
    throw new Error('Invalid baud rate');
  }

  if (!Number.isInteger(parsed.listen) || parsed.listen <= 0) {
    throw new Error('Invalid listen port');
  }

  return parsed;
}

// 自动检测可能的 ESP32-C3 串口：优先 Espressif VID (0x303a)，
// 其次按描述/厂商匹配常见 USB 串口芯片，最后回退到任意可用串口。
async function detectPort() {
  const ports = await SerialPort.list();
  if (ports.length === 0) {
    throw new Error('No serial port found. Use --serial COMx to specify one.');
  }

  const score = (port) => {
    const vid = (port.vendorId ?? '').toLowerCase();
    const desc = `${port.manufacturer ?? ''} ${port.friendlyName ?? ''}`.toLowerCase();
    if (vid === '303a') return 3;                 // Espressif 原生 USB CDC
    if (/esp32|esp-?c3|expressif|espressif/.test(desc)) return 3;
    if (/usb serial|jtag|cp210|ch340|ch910|prolific|ftdi/.test(desc)) return 2;
    return 1;
  };

  const ranked = ports
    .map((port) => ({ port, score: score(port) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best.score === 1) {
    console.error('Warning: no ESP32/USB-serial port clearly identified; guessing ' +
      `${best.port.path}. Use --serial COMx to override.`);
  }

  return best.port.path;
}

async function openSerial(requested, baudRate) {
  const path = requested === 'auto' ? await detectPort() : requested;

  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate, autoOpen: false });
    port.open((error) => {
      if (error) {
        reject(new Error(`Cannot open ${path}: ${error.message}`));
        return;
      }
      resolve(port);
    });
  });
}
