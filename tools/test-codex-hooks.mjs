#!/usr/bin/env node
// 测试 Codex hooks 是否被触发
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTIVITY_LOG = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'agent-light-activity.log'
);

async function testCodexHooks() {
  console.log('🔍 测试 Codex hooks 是否被触发...\n');

  const fileStream = createReadStream(ACTIVITY_LOG, { encoding: 'utf8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let codexCount = 0;
  let lastCodexTime = null;
  let lastCodexCommand = null;

  for await (const line of rl) {
    if (line.startsWith('[codex]')) {
      codexCount++;
      const parts = line.split(' ');
      lastCodexTime = parts[1];
      lastCodexCommand = parts.slice(2).join(' ');
    }
  }

  console.log(`📊 统计结果:`);
  console.log(`   - Codex hooks 触发次数: ${codexCount}`);
  console.log(`   - 最后一次触发时间: ${lastCodexTime || '无'}`);
  console.log(`   - 最后一条命令: ${lastCodexCommand || '无'}`);
  console.log('');

  if (codexCount > 0) {
    console.log('✅ Codex hooks 正常工作！');
    console.log(`💡 提示: 运行以下命令查看实时日志:`);
    console.log(`   tail -f ${ACTIVITY_LOG}`);
  } else {
    console.log('❌ Codex hooks 未被触发！');
    console.log('');
    console.log('🔧 故障排查步骤:');
    console.log('1. 检查 ~/.codex/hooks.json 是否存在且格式正确');
    console.log('2. 检查 ~/.codex/config.toml 中是否包含 [hooks.state]');
    console.log('3. 确认桥服务正在运行 (端口 8765)');
    console.log('4. 尝试使用 CLI 版本测试: codex --dangerously-bypass-hook-trust "test"');
  }

  console.log('');
}

testCodexHooks().catch(console.error);
