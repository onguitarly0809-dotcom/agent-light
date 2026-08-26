#!/usr/bin/env node
// Agent Light 桌面控制台：启动/停止桥、灯效测试、状态诊断、开机自启管理。
// 双击桌面 Agent-Light控制台.bat 拉起本脚本。详见 PROJECT_STATUS.md。

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';
import { execFileSync, spawn } from 'node:child_process';
import { SerialPort } from 'serialport';
import { normalizeCommand } from './lib/commands.mjs';

const REPO_DIR = import.meta.dirname;
const BRIDGE_LOG = path.join(REPO_DIR, 'bridge.log');
const BRIDGE_SCRIPT = path.join(REPO_DIR, 'serial-bridge.mjs');
const HOST = '127.0.0.1';
const PORT = 8765;
const STARTUP_DIR = path.join(
  process.env.APPDATA ?? '',
  'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
);
const STARTUP_VBS = path.join(STARTUP_DIR, 'agent-light-bridge.vbs');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// stdin 关闭（管道 EOF / 窗口关闭 / Ctrl+D）时返回 null，主循环据此干净退出。
const ask = async (p) => {
  try {
    return await rl.question(p);
  } catch {
    return null;
  }
};

// ---------- 通用工具 ----------

function ps(script) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// 桥进程 PID 列表（node.exe 运行 serial-bridge.mjs）
function bridgePids() {
  const out = ps(
    `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*serial-bridge.mjs*' } | Select-Object -ExpandProperty ProcessId`,
  );
  return out
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// 自启重启循环 cmd 进程 PID（cmd.exe 运行 bridge-autostart.bat）。
// 桥在自启循环托管下即使 node 暂死，循环也活着——start 需据此防重复、stop 需一并杀掉。
function autostartLoopPids() {
  const out = ps(
    `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*bridge-autostart.bat*' } | Select-Object -ExpandProperty ProcessId`,
  );
  return out
    .split(/\r?\n/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// 端口 8765 是否监听，返回 { listening, pid }
function portStatus() {
  let out;
  try {
    out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
  } catch {
    return { listening: false, pid: null };
  }
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/\S+:8765\s+\S+\s+LISTENING\s+(\d+)/);
    if (m) return { listening: true, pid: Number(m[1]) };
  }
  return { listening: false, pid: null };
}

// 列出串口，标记 ESP32（VID 303a）
async function listPorts() {
  try {
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer ?? '',
      vendorId: (p.vendorId ?? '').toLowerCase(),
      productId: (p.productId ?? '').toLowerCase(),
    }));
  } catch {
    return [];
  }
}

function esp32Port(ports) {
  return ports.find((p) => p.vendorId === '303a') ?? null;
}

// 读 bridge.log 末尾 n 行
function readLogTail(n = 15) {
  try {
    const data = fs.readFileSync(BRIDGE_LOG, 'utf8');
    return data.split(/\r?\n/).filter(Boolean).slice(-n).join('\n');
  } catch {
    return null;
  }
}

// 发一条命令到桥（与 hook-client.mjs 一致：fire-and-forget，超时即返回）
function sendCommand(rawCommand) {
  return new Promise((resolve) => {
    let command;
    try {
      command = normalizeCommand(rawCommand);
    } catch (e) {
      resolve({ ok: false, error: e.message });
      return;
    }
    const socket = net.createConnection({ host: HOST, port: PORT });
    const done = (result) => {
      try { socket.destroy(); } catch {}
      resolve(result);
    };
    socket.setTimeout(1000, () => done({ ok: false, error: '连接超时（桥未运行？）' }));
    socket.on('connect', () => {
      socket.end(`${command}\n`);
      done({ ok: true, command });
    });
    socket.on('error', (err) => done({ ok: false, error: err.message }));
  });
}

// ---------- 状态采集 ----------

async function gatherStatus() {
  const pids = bridgePids();
  const loop = autostartLoopPids();
  const port = portStatus();
  const ports = await listPorts();
  const esp = esp32Port(ports);
  return {
    bridgeRunning: pids.length > 0,
    bridgePids: pids,
    autostartLoop: loop.length > 0,
    autostartLoopPids: loop,
    autostartEnabled: fs.existsSync(STARTUP_VBS),
    portListening: port.listening,
    portPid: port.pid,
    ports,
    esp,
  };
}

function fmtStatus(s) {
  const bridge = s.bridgeRunning
    ? `运行中 (PID ${s.bridgePids.join(',')})`
    : '未运行';
  const port = s.portListening ? '监听中' : '未监听';
  const hw = s.esp
    ? `${s.esp.path} — ESP32 (VID 303a)`
    : s.ports.length > 0
      ? `${s.ports.map((p) => p.path).join(', ')}（未识别为 ESP32）`
      : '未检测到串口';
  const autostart = s.autostartEnabled
    ? (s.autostartLoop ? '已开启（循环运行中）' : '已开启（循环未运行）')
    : '已关闭';
  return { bridge, port, hw, autostart };
}

// ---------- 菜单动作 ----------

async function startBridge() {
  if (portStatus().listening) {
    console.log('桥已在运行，无需重复启动。');
    return;
  }
  const bpids = bridgePids();
  if (bpids.length > 0) {
    console.log(`⚠ 已有桥进程在运行（PID ${bpids.join(',')}）但端口未监听，正在启动或串口异常。请先菜单 2 停止再试。`);
    return;
  }
  if (autostartLoopPids().length > 0) {
    console.log('⚠ 开机自启重启循环（bridge-autostart.bat）正在运行，桥由它托管。');
    console.log('  如需手动接管：先菜单 2 停止（会停掉自启循环），再按 1 启动。');
    return;
  }
  const ports = await listPorts();
  const esp = esp32Port(ports);
  if (!esp) {
    console.log('⚠ 未检测到 ESP32（VID 303a）串口。请确认硬件已插好并被识别后再启动。');
    if (ports.length > 0) {
      console.log('  当前串口：' + ports.map((p) => p.path).join(', '));
    }
    const cont = await ask('仍要尝试启动？(y/N) ');
    if (cont.trim().toLowerCase() !== 'y') return;
  }

  console.log('正在启动桥...');
  const logFd = fs.openSync(BRIDGE_LOG, 'w');
  const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
    cwd: REPO_DIR,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, CLAUDE_LIGHT_WATCHDOG_MS: '120000' },
  });
  child.unref();
  try { fs.closeSync(logFd); } catch {}

  // 等桥打开串口 + 起 TCP server
  await sleep(2500);

  const port = portStatus();
  const log = readLogTail(8) ?? '';
  if (port.listening) {
    console.log(`✔ 桥已启动，端口 ${PORT} 监听中。`);
    if (esp) console.log(`  串口：${esp.path}`);
    if (log) console.log('  日志：' + log.split(/\r?\n/).pop());
    console.log('  灯应亮绿灯（idle）。');
  } else {
    console.log(`✖ 启动失败：端口 ${PORT} 未监听。`);
    console.log('  bridge.log 末尾：');
    console.log(log ? '  ' + log.replace(/\r?\n/g, '\n  ') : '  （无日志）');
    console.log('  可能原因：硬件未就绪 / 串口被占（Arduino IDE 串口监视器、其它程序）/');
    console.log('  建议：等几秒重试，或运行菜单 4 状态诊断。');
  }
}

async function stopBridge() {
  const before = bridgePids();
  const loopBefore = autostartLoopPids();
  if (before.length === 0 && loopBefore.length === 0) {
    console.log('桥未在运行。');
    return;
  }
  ps(
    `$t = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*serial-bridge.mjs*') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*bridge-autostart.bat*') }); foreach ($p in $t) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Output ('killed=' + $t.Count)`,
  );
  await sleep(800);
  const after = bridgePids();
  const loopAfter = autostartLoopPids();
  const parts = [];
  if (after.length > 0) parts.push(`桥进程残留 PID ${after.join(',')}`);
  if (loopAfter.length > 0) parts.push(`自启循环残留 PID ${loopAfter.join(',')}`);
  if (parts.length === 0) {
    const killed = [];
    if (before.length) killed.push(`桥 PID ${before.join(',')}`);
    if (loopBefore.length) killed.push('自启循环');
    console.log(`✔ 已停止（${killed.join('、')}）。`);
  } else {
    console.log(`⚠ 仍有进程残留：${parts.join('；')}，可能需要手动结束。`);
  }
}

async function lightTest() {
  const items = [
    ['1', 'idle', '绿灯常亮'],
    ['2', 'thinking', '跑马灯（思考）'],
    ['3', 'running', '红灯闪（执行）'],
    ['4', 'error', '红快闪（出错）'],
    ['5', 'alarm', '红黄警灯（需确认）'],
    ['6', 'G:off', '灭灯'],
  ];
  while (true) {
    console.log('\n--- 灯效测试 ---');
    for (const [k, cmd, desc] of items) console.log(` ${k}) ${desc.padEnd(16)} (${cmd})`);
    console.log(' 7) 自定义命令（如 Y:blink:700 / R:on / chase）');
    console.log(' 0) 返回');
    const c = (await ask('选择: ')).trim();
    if (c === '0') return;
    let raw;
    if (c === '7') {
      raw = (await ask('输入命令: ')).trim();
      if (!raw) continue;
    } else {
      const hit = items.find(([k]) => k === c);
      if (!hit) { console.log('无效选项'); continue; }
      raw = hit[1];
    }
    if (!portStatus().listening) {
      console.log('✖ 桥未运行，请先回主菜单按 1 启动。');
      continue;
    }
    const r = await sendCommand(raw);
    if (r.ok) console.log(`✔ 已发送：${r.command}`);
    else console.log(`✖ 发送失败：${r.error}`);
  }
}

async function diagnose() {
  console.log('\n=== 状态诊断 ===');
  const s = await gatherStatus();

  // 1. 串口
  console.log('\n[1] 串口设备：');
  if (s.ports.length === 0) {
    console.log('  ✖ 未检测到任何串口。→ 检查 USB 连线/驱动，确认 ESP32 已插入。');
  } else {
    for (const p of s.ports) {
      const tag = p.vendorId === '303a' ? '  ✔ ESP32' : '     ';
      console.log(`${tag} ${p.path}  vid=${p.vendorId || '?'}  mfr=${p.manufacturer || '?'}`);
    }
    if (!s.esp) console.log('  ⚠ 未识别到 ESP32(VID 303a)，桥可能选错口。可用 --serial 指定。');
  }

  // 2. 桥进程
  console.log('\n[2] 桥进程：');
  if (s.bridgeRunning) console.log(`  ✔ 运行中 (PID ${s.bridgePids.join(',')})`);
  else if (s.autostartLoop) console.log(`  — 未运行，但自启重启循环运行中（PID ${s.autostartLoopPids.join(',')}），桥崩溃会自动重起。`);
  else console.log('  ✖ 未运行。→ 主菜单按 1 启动桥。');

  // 3. 端口
  console.log('\n[3] TCP 端口 8765：');
  if (s.portListening) console.log(`  ✔ 监听中 (PID ${s.portPid})`);
  else console.log('  ✖ 未监听。→ 桥未启动或启动失败，看 [5] 日志。');

  // 4. 发测试命令
  console.log('\n[4] 发送测试命令 idle：');
  if (!s.portListening) {
    console.log('  — 跳过（端口未监听）');
  } else {
    const r = await sendCommand('idle');
    if (r.ok) console.log(`  ✔ 命令已送达（${r.command}），灯应亮绿灯。`);
    else console.log(`  ✖ 送达失败：${r.error}`);
  }

  // 5. 日志
  console.log('\n[5] bridge.log 末尾：');
  const log = readLogTail(15);
  if (log) console.log('  ' + log.replace(/\r?\n/g, '\n  '));
  else console.log('  （无日志——桥从未在本机启动过，或日志被锁）');

  // 汇总
  console.log('\n--- 结论 ---');
  if (s.esp && s.bridgeRunning && s.portListening) {
    console.log('  全链路正常 ✔');
  } else {
    const broken = [];
    if (!s.esp) broken.push('硬件未就绪');
    if (!s.bridgeRunning) broken.push('桥未运行');
    else if (!s.portListening) broken.push('桥启动失败（看日志）');
    console.log('  异常环节：' + broken.join(' → '));
  }
}

async function autostartManage() {
  while (true) {
    const exists = fs.existsSync(STARTUP_VBS);
    console.log('\n--- 开机自启管理 ---');
    console.log(`  当前：${exists ? '已开启（启动文件夹有 VBS）' : '已关闭'}`);
    console.log('  1) 关闭开机自启（删除 VBS）');
    console.log('  2) 开启开机自启（推荐：桥带重启循环，硬件未就绪会自动重试）');
    console.log('  0) 返回');
    const c = (await ask('选择: ')).trim();
    if (c === '0') return;
    if (c === '1') {
      try {
        fs.rmSync(STARTUP_VBS, { force: true });
        console.log('✔ 已关闭开机自启。');
      } catch (e) {
        console.log(`✖ 删除失败：${e.message}`);
      }
    } else if (c === '2') {
      try {
        fs.mkdirSync(STARTUP_DIR, { recursive: true });
        const vbs = autostartVbsContent();
        fs.writeFileSync(STARTUP_VBS, vbs, 'utf8');
        console.log('✔ 已开启开机自启（重启生效）。');
        console.log('  注意：硬件未就绪或中途拔插时桥会自动重连；如需手动停止用菜单 2。');
      } catch (e) {
        console.log(`✖ 创建失败：${e.message}`);
      }
    } else {
      console.log('无效选项');
    }
  }
}

function autostartVbsContent() {
  // VBS 字符串里的反斜杠不需转义（只有引号要加倍），保持单反斜杠路径。
  const repo = REPO_DIR;
  const bat = path.join(REPO_DIR, 'bridge-autostart.bat');
  return [
    `' agent-light 桥开机自启（由 control.mjs 生成）：隐藏窗口跑 bridge-autostart.bat（重启循环）`,
    `Set WshShell = CreateObject("WScript.Shell")`,
    `WshShell.CurrentDirectory = "${repo}"`,
    `WshShell.Run "cmd /c ""${bat}""", 0, False`,
    ``,
  ].join('\r\n');
}

// ---------- 主循环 ----------

async function main() {
  while (true) {
    const s = await gatherStatus();
    const f = fmtStatus(s);
    console.clear();
    console.log('=========== Agent Light 控制台 ===========');
    console.log(`桥:   ${f.bridge}`);
    console.log(`端口: ${HOST}:${PORT} ${f.port}`);
    console.log(`硬件: ${f.hw}`);
    console.log(`自启: ${f.autostart}`);
    console.log('------------------------------------------');
    console.log(' 1) 启动桥          2) 停止桥');
    console.log(' 3) 灯效测试        4) 状态诊断');
    console.log(' 5) 开机自启管理    0) 退出');
    console.log('------------------------------------------');
    const cRaw = await ask('选择: ');
    if (cRaw === null) break;
    const c = cRaw.trim();
    try {
      if (c === '1') await startBridge();
      else if (c === '2') await stopBridge();
      else if (c === '3') await lightTest();
      else if (c === '4') await diagnose();
      else if (c === '5') await autostartManage();
      else if (c === '0') break;
      else { console.log('无效选项'); }
    } catch (e) {
      console.log(`出错：${e.message}`);
    }
    if (c !== '0') await ask('\n按回车返回菜单...');
  }
  rl.close();
  console.log('再见。');
}

export { startBridge, stopBridge, lightTest, diagnose, autostartManage, sendCommand, gatherStatus, autostartVbsContent };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('控制台异常：', e);
    process.exit(1);
  });
}
