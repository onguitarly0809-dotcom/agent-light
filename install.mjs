#!/usr/bin/env node
// Agent Light 一键安装器：CLI hooks 配置 + 开机自启 + 启动桥 + 自检。
// 用法：双击 install.bat（推荐），或手动 node install.mjs [--dry-run]。
// --dry-run：只打印将要做的事，不写任何文件、不启动任何进程。
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const PORT = Number(process.env.CLAUDE_LIGHT_PORT ?? 8765);
const HOME = os.homedir();

// 回调式 readline：stdin 提前关闭（EOF/管道断开）时把挂起的问题结算为 null，
// 避免 Promise 永不结算导致进程在半途静默退出。
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pendingAsks = new Set();
rl.on('close', () => {
  for (const resolve of pendingAsks) resolve(null);
  pendingAsks.clear();
});
const ask = (prompt) => new Promise((resolve) => {
  pendingAsks.add(resolve);
  rl.question(prompt, (answer) => {
    pendingAsks.delete(resolve);
    resolve(typeof answer === 'string' ? answer.trim() : null);
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg) => console.log(DRY ? `[dry-run] ${msg}` : msg);

// hook 命令里的项目路径：统一正斜杠；含空格时才加引号（与已验证配置保持一致）。
// 不含空格时不加引号，保持与现有三家工作配置完全相同的命令形态。
function cmdPath(rel) {
  const s = path.join(REPO, rel).split(path.sep).join('/');
  return s.includes(' ') ? `"${s}"` : s;
}
const hookClient = cmdPath('hook-client.mjs');
const postToolClaude = cmdPath('lib/post-tool.mjs');
const postToolCodex = cmdPath('lib/post-tool-codex.mjs');
const notificationHook = cmdPath('lib/notification.mjs');

const ZCODE_TOOLS =
  'Bash|Read|Write|Edit|WebSearch|WebFetch|Agent|Skill|AskUserQuestion|EnterPlanMode|ExitPlanMode';

const entry = (command) => ({ type: 'command', command, timeout: 5 });
const group = (command, matcher) =>
  matcher ? { matcher, hooks: [entry(command)] } : { hooks: [entry(command)] };

// 事件 → 命令。三家差异：
//   Claude：无 SessionStart/PermissionRequest，权限请求走 Notification hook；
//   Codex / ZCode：六事件，PostToolUse 各用各的判定脚本；
//   Claude 的 hook 不传 source 参数（默认 claude），其余显式传。
function eventsFor(source) {
  const src = source === 'claude' ? '' : ` ${source}`;
  const events = {
    UserPromptSubmit: [group(`node ${hookClient} thinking${src}`)],
    PreToolUse: [
      source === 'claude' ? group(`node ${hookClient} running`, '*')
      : source === 'zcode' ? group(`node ${hookClient} running${src}`, ZCODE_TOOLS)
      : group(`node ${hookClient} running${src}`),
    ],
    PostToolUse: [
      source === 'codex' ? group(`node ${postToolCodex}`)
      : group(`node ${postToolClaude}`, source === 'claude' ? '*' : undefined),
    ],
    Stop: [group(`node ${hookClient} idle${src}`)],
  };
  if (source === 'claude') {
    events.Notification = [group(`node ${notificationHook}`)];
  } else {
    events.SessionStart = [group(`node ${hookClient} idle${src}`)];
    events.PermissionRequest = [group(`node ${hookClient} alarm${src}`)];
  }
  return events;
}

// 把本项目的事件组合并进已有 hooks 映射（追加到各事件数组末尾，不动别人已有的 hook）。
// 幂等：某事件下已存在本项目的 hook-client/post-tool 命令则跳过该事件。
function mergeEvents(existing, additions) {
  const hooks = existing ?? {};
  let added = 0;
  let skipped = 0;
  for (const [event, groups] of Object.entries(additions)) {
    const arr = Array.isArray(hooks[event]) ? hooks[event] : [];
    const ours = JSON.stringify(arr).match(/hook-client\.mjs|lib\/post-tool|lib\/notification/);
    if (ours) { skipped += 1; continue; }
    arr.push(...structuredClone(groups));
    hooks[event] = arr;
    added += 1;
  }
  return { hooks, added, skipped };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function backupIf(file) {
  if (!fs.existsSync(file)) return null;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const bak = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, bak);
  return bak;
}

// ---------- 三个 CLI 的配置 ----------

function configureClaude() {
  const file = path.join(HOME, '.claude', 'settings.json');
  const cfg = readJson(file) ?? {};
  const { hooks, added, skipped } = mergeEvents(cfg.hooks, eventsFor('claude'));
  cfg.hooks = hooks;
  say(`Claude Code：${file}（新增 ${added} 个事件，跳过已存在 ${skipped} 个）`);
  if (!DRY) { const bak = backupIf(file); if (bak) console.log(`  备份：${bak}`); writeJson(file, cfg); }
}

function configureZcode() {
  const file = path.join(HOME, '.zcode', 'cli', 'config.json');
  const cfg = readJson(file) ?? {};
  cfg.hooks ??= {};
  cfg.hooks.enabled = true;
  const { hooks, added, skipped } = mergeEvents(cfg.hooks.events, eventsFor('zcode'));
  cfg.hooks.events = hooks;
  say(`ZCode：${file}（新增 ${added} 个事件，跳过已存在 ${skipped} 个）`);
  if (!DRY) { const bak = backupIf(file); if (bak) console.log(`  备份：${bak}`); writeJson(file, cfg); }
}

function configureCodex() {
  const file = path.join(HOME, '.codex', 'hooks.json');
  const cfg = readJson(file) ?? {};
  const { hooks, added, skipped } = mergeEvents(cfg.hooks, eventsFor('codex'));
  cfg.hooks = hooks;
  say(`Codex：${file}（新增 ${added} 个事件，跳过已存在 ${skipped} 个）`);
  if (!DRY) { const bak = backupIf(file); if (bak) console.log(`  备份：${bak}`); writeJson(file, cfg); }

  // config.toml 里还需 [hooks] enabled = true（缺失则补，已有则不动）
  const toml = path.join(HOME, '.codex', 'config.toml');
  let text = '';
  try { text = fs.readFileSync(toml, 'utf8'); } catch { /* 文件不存在，新建 */ }
  if (/^\[hooks\]/m.test(text)) {
    if (!/^\s*enabled\s*=\s*true/m.test(text)) {
      say(`Codex：${toml} 已有 [hooks] 段但未启用，请在 [hooks] 段内手动加一行：enabled = true`);
    }
  } else if (text.trim()) {
    say(`Codex：${toml} 追加 [hooks] enabled = true`);
    if (!DRY) { backupIf(toml); fs.appendFileSync(toml, '\n[hooks]\nenabled = true\n', 'utf8'); }
  } else {
    say(`Codex：${toml} 不存在，新建并启用 hooks`);
    if (!DRY) { fs.mkdirSync(path.dirname(toml), { recursive: true }); fs.writeFileSync(toml, '[hooks]\nenabled = true\n', 'utf8'); }
  }
}

// ---------- 开机自启 / 桥 ----------

function setupAutostart() {
  const startupDir = path.join(
    process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
  );
  const vbsFile = path.join(startupDir, 'agent-light-bridge.vbs');
  const bat = path.join(REPO, 'bridge-autostart.bat');
  // VBS 字符串里反斜杠不需转义（只有引号要加倍），保持单反斜杠路径。
  // 注释保持纯 ASCII：中文 Windows 的 VBScript 按 ANSI(GBK) 读文件，
  // UTF-8 中文注释可能吞掉换行导致解析失败。
  const content = [
    `' agent-light bridge autostart (generated by install.mjs): hidden restart loop`,
    `Set WshShell = CreateObject("WScript.Shell")`,
    `WshShell.CurrentDirectory = "${REPO}"`,
    `WshShell.Run "cmd /c ""${bat}""", 0, False`,
    ``,
  ].join('\r\n');
  say(`开机自启：写入 ${vbsFile}`);
  if (!DRY) {
    try {
      fs.mkdirSync(startupDir, { recursive: true });
      fs.writeFileSync(vbsFile, content, 'utf8');
    } catch (e) {
      console.log(`  ✖ 写入失败：${e.message}`);
    }
  }
}

function portListening() {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port: PORT });
    const done = (ok) => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(800, () => done(false));
    s.on('connect', () => done(true));
    s.on('error', () => done(false));
  });
}

async function startBridge() {
  if (await portListening()) {
    say(`桥已在运行（端口 ${PORT} 监听中），跳过启动。`);
    return true;
  }
  const logFd = fs.openSync(path.join(REPO, 'bridge.log'), 'a');
  const child = spawn(process.execPath, [path.join(REPO, 'serial-bridge.mjs')], {
    cwd: REPO,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, CLAUDE_LIGHT_WATCHDOG_MS: '120000' },
  });
  child.unref();
  try { fs.closeSync(logFd); } catch {}
  console.log('正在启动桥（自动探测 ESP32 串口）...');
  for (let i = 0; i < 20; i += 1) {
    await sleep(500);
    if (await portListening()) {
      console.log(`✔ 桥已启动，端口 ${PORT} 监听中。`);
      return true;
    }
  }
  console.log(`✖ 桥启动失败：端口 ${PORT} 未监听。请确认红绿灯已插好，然后运行 node control.mjs 做状态诊断。`);
  return false;
}

function sendIdle() {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: '127.0.0.1', port: PORT });
    const done = (ok) => { try { s.destroy(); } catch {} resolve(ok); };
    s.setTimeout(1500, () => done(false));
    s.on('connect', () => { s.end('idle\n'); });
    s.on('close', () => done(true));
    s.on('error', () => done(false));
  });
}

// ---------- 主流程 ----------

async function main() {
  console.log('==========================================');
  console.log('   Agent Light 一键安装');
  console.log('==========================================');
  console.log(`项目路径：${REPO}`);
  if (DRY) console.log('（dry-run 演练模式：不写文件、不启动进程）\n');

  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 18) {
    console.log(`✔ Node.js v${process.versions.node}`);
  } else {
    console.log(`⚠ Node.js v${process.versions.node} 偏旧（建议 18+，serialport 需要 16+），继续但可能出问题。`);
  }
  if (!fs.existsSync(path.join(REPO, 'node_modules', 'serialport'))) {
    console.log('⚠ 未检测到 node_modules/serialport，请先运行 install.bat 或 npm install。');
  }
  console.log('');

  const choice = await ask(
    '要接入哪些 AI CLI？\n' +
    '  1) Claude Code\n' +
    '  2) Codex / ChatGPT Desktop\n' +
    '  3) ZCode\n' +
    '  4) 全部\n' +
    '  0) 跳过（只配自启和桥）\n' +
    '选择: ',
  );
  const targets =
    choice === '1' ? ['claude']
    : choice === '2' ? ['codex']
    : choice === '3' ? ['zcode']
    : choice === '4' ? ['claude', 'codex', 'zcode']
    : [];
  for (const t of targets) {
    try {
      if (t === 'claude') configureClaude();
      else if (t === 'codex') configureCodex();
      else configureZcode();
    } catch (e) {
      console.log(`  ✖ ${t} 配置失败：${e.message}`);
    }
  }
  if (targets.length > 0) console.log('');

  const auto = await ask('配置开机自启？（重启后桥自动运行）(Y/n) ');
  if (auto === null || auto.toLowerCase() !== 'n') setupAutostart();
  console.log('');

  if (!DRY) {
    const ok = await startBridge();
    if (ok) {
      const lit = await sendIdle();
      if (lit) console.log('✔ 测试命令 idle 已发送，红绿灯应亮绿色。');
      else console.log('✖ 测试命令发送失败，请运行 node control.mjs 做状态诊断。');
    }
  } else {
    say(`启动桥（若端口 ${PORT} 未监听）并发送测试命令 idle`);
  }

  console.log('\n------------------------------------------');
  console.log('安装完成。后续：');
  if (targets.includes('codex')) {
    console.log('  • ChatGPT Desktop 用户：hooks 信任每次重启应用后会重置，');
    console.log('    需在 设置 → 钩子 页面重新信任（Desktop 机制，无法绕过）。');
  }
  console.log('  • 桥控制台 / 诊断：node control.mjs');
  console.log('  • 手动停桥：stop-bridge.bat（重新烧固件前先停桥）');
  console.log('------------------------------------------');
}

main()
  .catch((e) => { console.error('安装器异常：', e); process.exitCode = 1; })
  .finally(() => { rl.close(); });
