# ZCode Hooks 集成指南

> **Agent Light 项目** - 让 ZCode 通过红绿灯显示运行状态  
> 最后更新：2026-08-21

## 📋 概述

本指南将帮助您配置 ZCode，使其能够像 Claude Code 和 Codex 一样通过 Agent Light 红绿灯显示实时运行状态。

**核心优势**：
- ✅ **零代码修改** - 使用现有的 Agent Light 基础设施
- ✅ **多 CLI 支持** - Claude、Codex、ZCode 可同时工作
- ✅ **完全独立** - 不影响现有的 Claude Code 和 Codex 配置
- ✅ **简单配置** - 一键自动配置脚本

## 🚀 快速开始（推荐方式）

### 1. 自动配置（最简单）

双击运行 `根目录 install.bat` 脚本：

```batch
根目录 install.bat
```

该脚本会自动：
- 备份现有的 ZCode 配置
- 添加 Agent Light hooks 配置到 `~/.zcode/cli/config.json`
- 验证配置是否成功

### 2. 启动带 hooks 支持的 ZCode

配置完成后，使用专用启动脚本：

```batch
直接运行 zcode
```

或直接使用 ZCode 命令：

```bash
zcode
```

## 🎯 手动配置方式

如果自动配置脚本无法使用，可以手动配置：

### 步骤 1：找到 ZCode 配置文件

ZCode 配置文件位置：
- **用户级配置**：`C:\Users\你的用户名\.zcode\cli\config.json`
- **工作区级配置**：`项目根目录\.zcode\config.json`

推荐使用用户级配置，这样所有项目都能使用红绿灯功能。

### 步骤 2：编辑配置文件

打开 `~/.zcode/cli/config.json`，添加以下 hooks 配置：

```json
{
  "hooks": {
    "enabled": true,
    "events": {
      "SessionStart": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "node <项目根目录>/hook-client.mjs idle zcode",
              "timeout": 5
            }
          ]
        }
      ],
      "UserPromptSubmit": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "node <项目根目录>/hook-client.mjs thinking zcode",
              "timeout": 5
            }
          ]
        }
      ],
      "PreToolUse": [
        {
          "matcher": "Bash|Read|Write|Edit|WebSearch|WebFetch|Agent|Skill|AskUserQuestion|EnterPlanMode|ExitPlanMode",
          "hooks": [
            {
              "type": "command",
              "command": "node <项目根目录>/hook-client.mjs running zcode",
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
              "command": "node <项目根目录>/lib/post-tool.mjs",
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
              "command": "node <项目根目录>/hook-client.mjs alarm zcode",
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
              "command": "node <项目根目录>/hook-client.mjs idle zcode",
              "timeout": 5
            }
          ]
        }
      ]
    }
  }
}
```

**重要提示**：
- 请将 `<项目根目录>/` 替换为实际的项目路径
- 路径必须使用正斜杠 `/` 或双反斜杠 `\\`
- 保持 JSON 格式正确（逗号、引号等）

### 步骤 3：重启 ZCode

配置完成后，重启 ZCode 使 hooks 生效。

## 🔍 状态映射说明

| ZCode 事件 | 红绿灯状态 | 视觉效果 | 说明 |
|---|---|---|---|
| `SessionStart` | 空闲 | 🟢 绿灯常亮 | 会话开始时初始化 |
| `UserPromptSubmit` | 思考 | 🌈 跑马灯（绿→黄→红） | 提交问题后 AI 思考中 |
| `PreToolUse` | 运行 | 🟡 黄灯闪烁（500ms） | 执行工具命令时 |
| `PostToolUse` | 思考/错误 | 🌈 跑马灯 / 🔴 红灯快闪 | 工具执行完成，根据结果显示 |
| `PermissionRequest` | 警报 | 🚨 红黄交替警告 | 需要用户权限或注意 |
| `Stop` | 空闲 | 🟢 绿灯常亮 | 会话结束或停止时 |

## 🧪 验证安装

### 1. 检查红绿灯桥接状态

确保红绿灯桥接正在运行：

```bash
# 双击运行
Agent-Light控制台.bat

# 选择菜单 4 - 状态诊断
```

或手动检查：

```bash
# 检查 TCP 端口 8765 是否在监听
netstat -an | findstr 8765

# 检查桥接进程
tasklist | findstr node.exe
```

### 2. 监控活动日志

在新的终端窗口中运行：

```bash
# 进入项目目录
cd <项目根目录>

# 实时监控活动日志
tail -f agent-light-activity.log
```

### 3. 测试 ZCode Hooks

启动 ZCode 并执行一些操作，观察：

1. **启动 ZCode** - 应该看到 `[zcode]` 开头的日志记录，红绿灯显示绿色
2. **提交问题** - 红绿灯应该开始跑马灯效果
3. **执行工具** - 红绿灯应该显示黄色闪烁
4. **完成操作** - 红绿灯应该回到相应状态

**期望的日志输出**：

```
[zcode] 09:15:30 idle
[zcode] 09:15:35 chase
[zcode] 09:15:42 Y:blink:500
[zcode] 09:15:48 chase
[zcode] 09:16:05 idle
```

## 🔧 故障排除

### 问题 1：红绿灯没有反应

**可能原因**：
- 红绿灯桥接未运行
- Hooks 配置路径错误
- ZCode 未识别到 hooks 配置

**解决方法**：
1. 确认桥接正在运行：`Agent-Light控制台.bat` → 菜单 4
2. 检查配置文件路径是否正确
3. 重启 ZCode 使配置生效
4. 查看 `agent-light-activity.log` 是否有 `[zcode]` 记录

### 问题 2：配置后没有 `[zcode]` 日志

**可能原因**：
- Hooks 未启用
- 配置文件格式错误
- 路径使用了错误的斜杠

**解决方法**：
1. 确认配置中有 `"hooks": {"enabled": true}`
2. 验证 JSON 格式是否正确（可使用在线 JSON 验证工具）
3. 确保路径使用正斜杠 `/` 或双反斜杠 `\\`
4. 检查 ZCode 是否有权限访问配置文件

### 问题 3：只有部分状态显示

**可能原因**：
- 某些 hooks 配置缺失
- 工具匹配器不匹配当前使用的工具

**解决方法**：
1. 确认所有 6 个核心事件都已配置
2. 检查 `PreToolUse` 的 `matcher` 是否包含你使用的工具
3. 查看 `bridge.log` 了解哪些命令成功发送

### 问题 4：路径问题

**Windows 路径格式**：
- ❌ 错误：`<项目根目录>\hook-client.mjs`
- ✅ 正确：`<项目根目录>/hook-client.mjs`
- ✅ 正确：`C:\\Users\\USER\\Downloads\\agent-light-main\\hook-client.mjs`

### 问题 5：与其他 CLI 冲突

**现象**：Claude、Codex、ZCode 同时使用时灯光混乱

**说明**：这是正常现象，多个 CLI 同时驱动同一盏灯时，后到者的命令会覆盖前面的命令。

**解决方法**：
- 这是设计行为，无法完全避免
- 可以通过 `agent-light-activity.log` 追踪是哪个 CLI 在驱动
- 如需隔离，可以考虑使用多个红绿灯设备

## 📊 监控和诊断

### 实时监控命令

```bash
# 监控哪个 CLI 在驱动灯
tail -f agent-light-activity.log

# 监控桥接收到的所有命令
tail -f bridge.log

# 检查 ZCode hooks 活动特定记录
tail -f agent-light-activity.log | findstr [zcode]
```

### 桌面控制台诊断

使用 `Agent-Light控制台.bat`：

- **菜单 1** - 启动桥接
- **菜单 2** - 停止桥接  
- **菜单 3** - 灯效测试
- **菜单 4** - 状态诊断（推荐）
- **菜单 5** - 开机自启管理

## 🎨 高级配置

### 自定义工具匹配器

如果只想为特定工具启用红绿灯，修改 `PreToolUse` 的 `matcher`：

```json
"PreToolUse": [
  {
    "matcher": "Bash|Read",  // 只为 Bash 和 Read 工具显示运行状态
    "hooks": [...]
  }
]
```

### 调整超时时间

如果 hooks 执行超时，可以增加 `timeout` 值：

```json
{
  "type": "command",
  "command": "node ...",
  "timeout": 10  // 增加到 10 秒
}
```

### 工作区级配置

如果只想为特定项目启用 ZCode hooks，在项目根目录创建 `.zcode/config.json`：

```json
{
  "hooks": {
    "enabled": true,
    "events": { ... }
  }
}
```

## 🤝 与其他 CLI 共存

Agent Light 设计支持多 CLI 同时使用：

| CLI | 配置文件 | 来源标识 | 兼容性 |
|---|---|---|---|
| Claude Code | `~/.claude/settings.json` | `[claude]` | ✅ 完全兼容 |
| Codex | `~/.codex/hooks.json` | `[codex]` | ✅ 完全兼容 |
| ZCode | `~/.zcode/cli/config.json` | `[zcode]` | ✅ 完全兼容 |

**重要原则**：
- 三套配置完全独立，互不影响
- 可以同时启用多个 CLI
- 通过 `agent-light-activity.log` 区分来源
- 最后到达的命令决定灯光状态

## 📚 相关文档

- **项目总览**：`README.md`（含架构、命令、配置、排障）
- **Claude Code 配置**：`configs/claude-settings-snippet.json`
- **Codex 配置**：`configs/codex-hooks-snippet.json`（Desktop 信任问题见 README 排障表）
- **故障排除**：`Agent-Light控制台.bat` → 菜单 4

## 🎉 成功标志

配置成功后，您应该能够：

1. ✅ 启动 ZCode 时红绿灯显示绿色（空闲状态）
2. ✅ 提交问题时红绿灯开始跑马灯（思考状态）
3. ✅ 执行工具时红绿灯显示黄色闪烁（运行状态）
4. ✅ 看到 `[zcode]` 标识的活动日志
5. ✅ 与 Claude Code 和 Codex 和平共存

## 💡 提示和最佳实践

1. **首次配置**：推荐使用自动配置脚本 `根目录 install.bat`
2. **路径管理**：将项目放在固定位置，避免频繁修改路径
3. **定期检查**：使用 `tail -f agent-light-activity.log` 监控运行状态
4. **问题诊断**：优先使用桌面控制台的菜单 4 进行状态诊断
5. **配置备份**：重要配置修改前先备份原始文件

## 🆘 获取帮助

如果遇到问题：

1. 查看 `agent-light-activity.log` 和 `bridge.log`
2. 运行 `Agent-Light控制台.bat` → 菜单 4 状态诊断
3. 检查 ZCode 配置文件格式是否正确
4. 确认红绿灯桥接正在运行
5. 参考本文档的故障排除部分

---

**恭喜！** 您现在可以使用 ZCode 通过红绿灯实时查看 AI 运行状态了！🎊