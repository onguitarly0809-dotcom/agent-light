# Codex Hooks 问题诊断与解决方案

> 最后更新：2026-08-21 11:30

## 🎉 问题状态：已解决！

**ChatGPT Desktop 红绿灯支持已启用** - 通过在 config.toml 中添加 [hooks] enabled = true 配置

---

## 问题描述

**现象**：用户在 Codex 桌面应用中无法驱动红绿灯，而 Claude Code 的红绿灯功能正常工作。

**环境信息**：
- Codex 版本：0.147.0 → 0.148.0（已升级）
- 认证方式：API 认证（`experimental_bearer_token`）
- 操作系统：Windows 10 Pro
- Node.js：v24.18.0
- 桥服务：正常运行（端口 8765）

## 问题诊断过程

### 初始诊断（错误）

**错误结论**：认为 API 认证方式不支持 hooks 功能

**证据**：
1. Codex 日志显示：`"remote control requires ChatGPT authentication; API key auth is not supported"`
2. 多次测试 hooks 都没有被执行
3. 尝试了各种配置方式都不生效

### 关键突破

**测试发现**：使用 `--dangerously-bypass-hook-trust` 参数后，hooks 成功执行

**验证结果**：
```
hook: SessionStart
hook: SessionStart Completed
hook: UserPromptSubmit
hook: UserPromptSubmit
```

**日志证据**：
- `agent-light-activity.log` 出现大量 `[codex]` 记录（17:42-17:44）
- `bridge.log` 显示收到对应的命令（`chase`、`Y:blink:500`）


## 🔧 最新解决方案 (2026-08-21)

#
## 🎉 最终解决方案 (2026-08-21 13:45)

### 关键发现
**ChatGPT Desktop 设置中的 '钩子' 信任页面**

在 ChatGPT Desktop 的设置中找到了"钩子"(hooks)设置页面，里面有 **7 条 hooks 配置**需要用户手动信任。

### 解决步骤

1. **打开 ChatGPT Desktop 设置**
   - 点击 ChatGPT Desktop 界面中的设置按钮

2. **找到 '钩子' 设置页面**
   - 在设置菜单中找到"钩子"或"Hooks"选项

3. **信任所有 hooks 配置**
   - 页面中显示 7 条 hooks 配置
   - 逐一点击"信任"按钮，或选择"全部信任"
   - 确认所有配置都显示为已信任状态

4. **测试红绿灯功能**
   - 在 ChatGPT Desktop 中发送测试消息
   - 观察红绿灯是否正常显示跑马灯效果

### 技术分析

**为什么需要手动信任？**
- ChatGPT Desktop 有一个安全机制，需要用户明确信任 hooks 配置
- 电脑重启后，这个信任状态会重置，需要重新信任
- 这是为了防止恶意 hooks 脚本未经授权执行

**7 条 hooks 配置包括：**
1. SessionStart - 会话开始时的 hooks
2. UserPromptSubmit - 用户提交消息时的 hooks (包含2条：codex-hud 和红绿灯)
3. PreToolUse - 工具使用前的 hooks
4. PostToolUse - 工具使用后的 hooks
5. PermissionRequest - 权限请求时的 hooks
6. Stop - 会话停止时的 hooks

### 验证结果

✅ **信任后立即生效**
- 红绿灯功能恢复正常
- 发送消息时显示跑马灯效果 (绿→黄→红)
- 工具执行时显示正确的灯光状态

✅ **三个平台统一完成**
- Claude Code: ✅ 正常工作
- ZCode: ✅ 正常工作  
- ChatGPT Desktop: ✅ 正常工作 (需信任hooks)

---
## 根本原因
ChatGPT Desktop 需要在 config.toml 中明确启用 hooks 功能，否则不会执行 hooks.json 中配置的 hooks。

### 解决步骤

1. **在 config.toml 中添加 hooks 配置**：
   `	oml
   [hooks]
   enabled = true
   `

2. **重启 ChatGPT Desktop 应用**

3. **验证功能**：
   - 在 ChatGPT Desktop 中发送测试消息
   - 观察红绿灯是否显示跑马灯效果（思考状态）
   - 检查活动日志：	ail -f agent-light-activity.log | findstr [codex]

### 技术背景
- **ZCode 成功经验**：ZCode 的配置文件中有 "hooks": {"enabled": true} 结构
- **Codex 配置差异**：Codex 原本只有 hooks.json，缺少 config.toml 中的启用开关
- **配置文件分离**：hooks.json 定义具体行为，config.toml 控制功能开关
## 根本原因

**真实原因**：Codex hooks 信任机制问题

**详细解释**：
1. Codex 的 hooks 需要被用户明确信任才能执行
2. 首次添加或修改 hooks 配置后，hooks 处于"需要审核"状态
3. 未被信任的 hooks 会被自动跳过，不会执行
4. 桌面应用默认不会绕过信任检查

**API 认证与 hooks 的关系**：
- ✅ **API 认证不影响 hooks 使用**
- ✅ hooks 在 API 认证下完全正常工作
- ❌ 只是缺少信任机制授权

## 解决方案

### 方案 1：使用带参数的启动脚本（推荐，立即生效）

**文件位置**：`<项目根目录>\codex-desktop-hooks.bat`

**内容**：
```batch
@echo off
echo Starting Codex with hooks enabled (bypassing trust check)...
codex --dangerously-bypass-hook-trust %*
```

**使用方法**：
1. 双击 `codex-desktop-hooks.bat` 启动 Codex
2. 或创建桌面快捷方式方便使用
3. hooks 会立即工作，无需额外配置

**优点**：
- 最简单直接
- 立即生效
- 无需交互式操作

**缺点**：
- 每次启动都需要通过这个脚本
- 跳过了安全审查机制

### 方案 2：在 Codex 桌面应用中手动信任 hooks

**操作步骤**：
1. 打开 Codex 桌面应用
2. 找到命令输入框（通常在底部或侧边）
3. 输入命令：`/hooks`
4. 按回车执行
5. Codex 会显示所有配置的 hooks
6. 选择 "Trust all" 或逐个信任 hooks
7. 完成后 hooks 就会正常工作

**优点**：
- 一次性设置，后续无需参数
- 符合安全最佳实践
- 不会绕过审查机制

**缺点**：
- 需要交互式操作
- 可能需要多次尝试找到正确的命令位置

### 方案 3：使用 CLI 版本 Codex

**命令**：
```bash
codex --dangerously-bypass-hook-trust --model glm-4.6
```

**或使用项目配置的启动脚本**：
```bash
cd "<项目根目录>"
codex exec --dangerously-bypass-hook-trust --model glm-4.6
```

**优点**：
- 完全控制启动参数
- 适合自动化场景

**缺点**：
- 需要使用命令行界面
- 不如桌面应用方便

## 验证方法

### 1. 检查 hooks 是否触发

**实时监控日志**：
```bash
tail -f "<项目根目录>\agent-light-activity.log"
```

**预期结果**：
- 发送消息后应该看到 `[codex]` 开头的记录
- 例如：`[codex] 17:42:32 Y:blink:500`

### 2. 检查桥是否收到命令

**查看桥日志**：
```bash
tail -f "<项目根目录>\bridge.log"
```

**预期结果**：
- 应该看到命令到达桥：`17:42:32 -> Y:blink:500`
- 格式：`HH:MM:SS -> 命令`

### 3. 目视验证红绿灯

**测试步骤**：
1. 发送一条测试消息
2. 观察红绿灯变化：
   - 提交消息 → 跑马灯（绿→黄→红）
   - 工具运行中 → 黄灯慢闪
   - 工具出错 → 红灯快闪
   - 空闲状态 → 绿灯常亮

## 相关文件配置

### hooks.json 配置

**位置**：`%USERPROFILE%\.codex\hooks.json`

**当前配置**：
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "codex-hud hook",
            "timeout": 10,
            "statusMessage": "codex-hud"
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <项目根目录>/hook-client.mjs thinking codex",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <项目根目录>/hook-client.mjs idle codex",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <项目根目录>/hook-client.mjs running codex",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <项目根目录>/lib/post-tool-codex.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <项目根目录>/hook-client.mjs alarm codex",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node <项目根目录>/hook-client.mjs idle codex",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### config.toml 认证配置

**关键设置**：
```toml
model_provider = "ZAI"
model = "glm-4.6"
preferred_auth_method = "apikey"
forced_login_method = "api"

[model_providers.ZAI]
name = "ZAI"
base_url = "https://open.bigmodel.cn/api/v1"
env_key = "BIGMODEL_API_KEY"
```

> **安全提示**：此处原有明文 API key 已移除（曾意外写入本文档）。
> 推荐做法：key 只存放在 Windows 用户级环境变量中（系统设置 → 环境变量，
> 或 `setx BIGMODEL_API_KEY "<你的key>"`），config.toml 里用 `env_key` 引用，
> 与当前 volcengine provider 使用 `ARK_API_KEY` 的方式一致。
> 该旧 key 建议到 BigModel 控制台吊销重发。

**注意**：`preferred_auth_method` 和 `forced_login_method` 设置确保使用 API 认证，这不会影响 hooks 功能。

## 重要发现

### 之前 Hooks 工作的历史证据

从 `agent-light-activity.log` 可以看到，hooks 之前确实工作过：
- `[codex] 15:59:55 G:on`
- `[codex] 16:00:58 G:on`
- `[codex] 16:01:02 chase`
- ...（大量历史记录）

这说明：
1. 配置本身是正确的
2. 脚本功能正常
3. 硬件和桥服务无问题
4. 只是信任状态丢失

### 信任状态丢失的原因

可能原因：
1. 使用 `cc switch` 配置更改了某些设置
2. Codex 版本升级（0.147.0 → 0.148.0）
3. 配置文件被重写或更新
4. 安全软件或系统清理

## 故障排除

### 如果 hooks 仍然不工作

1. **检查桥服务状态**：
   ```bash
   netstat -ano | findstr :8765
   # 应该看到 LISTENING 状态
   ```

2. **检查桥进程**：
   ```bash
   tasklist | findstr node
   # 应该看到 node.exe 进程
   ```

3. **手动测试 hook 客户端**：
   ```bash
   node "<项目根目录>/hook-client.mjs" chase codex
   # 应该在 agent-light-activity.log 中看到 [codex] 记录
   ```

4. **检查 hooks 配置**：
   ```bash
   cat "%USERPROFILE%\.codex\hooks.json"
   # 确认配置格式正确
   ```

5. **验证 Codex 版本**：
   ```bash
   codex --version
   # 应该是 0.148.0 或更高
   ```

### 常见错误信息

**"Invalid light command: xxx"**：
- 说明 hooks 已触发，但命令格式不正确
- 检查 `lib/commands.mjs` 中的命令格式定义

**"Hooks need review" 警告**：
- 说明 hooks 需要被信任
- 按方案 2 手动信任或使用方案 1 绕过

**桥日志显示 "Serial error"**：
- 说明串口连接问题
- 检查 ESP32 硬件连接和 COM 端口

## 总结

### 核心结论

1. **API 认证完全支持 hooks** - 之前的错误诊断已被纠正
2. **问题根源是信任机制** - hooks 需要被信任才能执行
3. **有多种解决方案** - 推荐使用带参数的启动脚本

### 推荐操作流程

**立即使用**：
```bash
cd "<项目根目录>"
./codex-desktop-hooks.bat
```

**长期设置**：
1. 在 Codex 桌面应用中运行 `/hooks` 命令
2. 信任所有 hooks
3. 以后正常启动 Codex 即可

### 维护建议

1. **定期检查**：使用 `tail -f agent-light-activity.log` 监控 hooks 活动状态
2. **备份配置**：定期备份 `hooks.json` 和 `config.toml`
3. **版本兼容性**：Codex 版本升级后重新验证 hooks 功能
4. **安全考虑**：如果选择绕过信任检查，确保 hooks 脚本来源可信

## 相关资源

- Codex Hooks 官方文档：https://learn.chatgpt.com/docs/hooks
- Agent Light 项目文档：`PROJECT_STATUS.md`
- 桥服务状态：桌面 `Agent-Light控制台.bat` → 菜单 4

---

**问题状态**：✅ 已解决  
**最后验证时间**：2026-08-20 17:50  
**验证结果**：hooks 在 `--dangerously-bypass-hook-trust` 参数下正常工作
