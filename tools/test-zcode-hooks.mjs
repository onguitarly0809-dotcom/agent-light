#!/usr/bin/env node

/**
 * ZCode Hooks 测试脚本
 * 测试 ZCode hooks 配置是否正确工作
 */

import net from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOST = '127.0.0.1';
const PORT = 8765;
const TIMEOUT = 250; // 250ms 超时

// 测试命令
const TEST_COMMANDS = [
    'idle',
    'thinking', 
    'running',
    'error',
    'alarm'
];

function sendCommand(command) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let resolved = false;

        socket.setTimeout(TIMEOUT, () => {
            if (!resolved) {
                resolved = true;
                socket.destroy();
                resolve({ command, status: 'timeout', error: 'Connection timeout' });
            }
        });

        socket.on('connect', () => {
            socket.write(command + '\n');
            // 立即关闭，fire-and-forget 模式
            socket.end();
        });

        socket.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                resolve({ command, status: 'error', error: err.message });
            }
        });

        socket.on('close', () => {
            if (!resolved) {
                resolved = true;
                resolve({ command, status: 'success' });
            }
        });

        socket.connect(PORT, HOST);
    });
}

async function testZCodeHooks() {
    console.log('🔍 ZCode Hooks 测试脚本');
    console.log('========================\n');

    // 检查 ZCode 配置文件
    const configPath = resolve(process.env.USERPROFILE, '.zcode/cli/config.json');
    console.log(`📄 检查配置文件: ${configPath}`);
    
    try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        
        if (!config.hooks) {
            console.log('❌ 配置文件中没有找到 hooks 配置');
            return;
        }
        
        if (!config.hooks.enabled) {
            console.log('❌ Hooks 未启用 (hooks.enabled = false)');
            return;
        }
        
        console.log('✅ Hooks 配置存在且已启用');
        console.log(`📊 配置的事件数量: ${Object.keys(config.hooks.events || {}).length}`);
        
        const events = config.hooks.events || {};
        const expectedEvents = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop'];
        
        console.log('\n📋 事件配置检查:');
        expectedEvents.forEach(event => {
            if (events[event]) {
                console.log(`  ✅ ${event}: 已配置`);
            } else {
                console.log(`  ❌ ${event}: 未配置`);
            }
        });
        
    } catch (error) {
        console.log(`❌ 读取配置文件失败: ${error.message}`);
        return;
    }

    // 测试 TCP 连接
    console.log('\n🔗 测试 TCP 桥接连接...');
    console.log(`   主机: ${HOST}:${PORT}`);
    
    for (const cmd of TEST_COMMANDS) {
        const result = await sendCommand(cmd);
        if (result.status === 'success') {
            console.log(`  ✅ ${cmd}: 命令发送成功`);
        } else {
            console.log(`  ❌ ${cmd}: ${result.status} - ${result.error || '未知错误'}`);
        }
    }

    console.log('\n🎯 下一步操作:');
    console.log('   1. 启动 ZCode: zcode');
    console.log('   2. 提交一个问题测试 hooks');
    console.log('   3. 监控活动日志: tail -f agent-light-activity.log');
    console.log('   4. 查找 [zcode] 标记的记录');
    
    console.log('\n✨ 测试完成！');
}

// 运行测试
testZCodeHooks().catch(console.error);