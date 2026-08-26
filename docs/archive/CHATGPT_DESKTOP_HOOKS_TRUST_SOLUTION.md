# ChatGPT Desktop Hooks 信任问题最终解决方案

> **发现问题时间**: 2026-08-21 13:45  
> **问题状态**: ✅ 彻底解决  
> **解决方式**: 在 ChatGPT Desktop 设置中手动信任 hooks

## 🎯 问题描述

**症状**:
- ChatGPT Desktop 无法驱动红绿灯
- 配置文件正确 (config.toml + hooks.json)
- hook-client.mjs 手动执行正常
- 桥接服务运行正常
- 但在 ChatGPT Desktop 中发送消息不触发 hooks

**关键线索**:
- 11:40:29 的测试记录证明 hooks 曾经工作过
- 问题出现在电脑重启之后
- 配置文件没有任何变化

## 🔍 问题根源

**ChatGPT Desktop 的 hooks 信任安全机制**

ChatGPT Desktop 有一个内置的安全机制，要求用户明确信任 hooks 配置：
- 每次电脑重启后，hooks 信任状态会重置
- 需要在设置中重新手动信任 hooks 配置
- 这是为了防止恶意 hooks 脚本未经授权执行

## ✅ 最终解决方案

### 步骤 1: 打开 ChatGPT Desktop 设置
1. 在 ChatGPT Desktop 界面中找到设置按钮
2. 点击打开设置菜单

### 步骤 2: 找到"钩子"设置页面
1. 在设置菜单中寻找"钩子"或"Hooks"选项
2. 可能位于"开发者"、"高级"或"实验性功能"下

### 步骤 3: 信任所有 hooks 配置
1. 页面中显示 **7 条 hooks 配置**
2. 逐一点击每条配置旁边的"信任"按钮
3. 或寻找"全部信任"选项
4. 确认所有配置都显示为已信任状态

### 步骤 4: 测试功能
1. 在 ChatGPT Desktop 中发送测试消息
2. 观察红绿灯是否显示跑马灯效果 (绿→黄→红)
3. 检查活动日志是否有新的 `[codex]` 记录

## 📊 7 条 Hooks 配置详解

| # | 配置名称 | 触发时机 | 功能 | 命令 |
|---|----------|----------|------|------|
| 1 | SessionStart | ChatGPT Desktop 启动或新会话开始 | 初始化红绿灯为绿色 | `node .../hook-client.mjs idle codex` |
| 2 | UserPromptSubmit (codex-hud) | 用户提交消息 | codex-hud 功能 | `codex-hud hook` |
| 3 | UserPromptSubmit (红绿灯) | 用户提交消息 | 显示思考状态 (跑马灯) | `node .../hook-client.mjs thinking codex` |
| 4 | PreToolUse | 工具执行前 | 显示运行状态 (黄闪) | `node .../hook-client.mjs running codex` |
| 5 | PostToolUse | 工具执行后 | 处理结果，判断错误状态 | `node .../lib/post-tool-codex.mjs` |
| 6 | PermissionRequest | 需要用户权限确认 | 显示警报状态 (红黄交替) | `node .../hook-client.mjs alarm codex` |
| 7 | Stop | 会话结束或停止 | 重置红绿灯为绿色 | `node .../hook-client.mjs idle codex` |

## ⚠️ 重要提示

### 信任状态会重置
- **每次电脑重启后，需要重新信任这些 hooks**
- 这是 ChatGPT Desktop 的安全机制，不是bug
- 建议重启后首先检查钩子设置

### 信任的持久性
- 只要电脑不重启，信任状态会保持
- ChatGPT Desktop 更新可能需要重新信任
- 配置文件修改后可能需要重新信任

### 快速检查方法
```bash
# 在 ChatGPT Desktop 中发送消息后检查
tail -f agent-light-activity.log | findstr [codex]

# 如果看到新的 [codex] 记录，说明 hooks 正常工作
# 如果没有新记录，说明需要重新信任 hooks
```

## 🎯 验证成功的标志

### 红绿灯反应
- ✅ 发送消息时显示跑马灯效果 (绿→黄→红循环)
- ✅ 工具执行时显示黄灯闪烁 (500ms)
- ✅ 出错时显示红灯快闪
- ✅ 空闲时显示绿灯常亮

### 日志记录
- ✅ 活动日志中出现新的 `[codex]` 记录
- ✅ 桥接日志显示收到命令
- ✅ 时间戳与消息发送时间匹配

### 三个平台统一
| 平台 | 配置方式 | 信任要求 | 状态 |
|------|----------|----------|------|
| Claude Code | `~/.claude/settings.json` | 无需手动信任 | ✅ 正常 |
| ZCode | `~/.zcode/cli/config.json` | 无需手动信任 | ✅ 正常 |
| ChatGPT Desktop | `~/.codex/config.toml` + `hooks.json` | **需要手动信任** | ✅ 正常 |

## 🔧 故障排除

### 问题：重新信任后仍然不工作
**解决方案**：
1. 完全关闭 ChatGPT Desktop
2. 重新打开 ChatGPT Desktop
3. 再次检查钩子设置中的信任状态
4. 发送测试消息验证

### 问题：找不到"钩子"设置页面
**解决方案**：
1. 确认 ChatGPT Desktop 版本是否支持 hooks
2. 检查是否在"开发者"或"高级"设置下
3. 尝试搜索设置中的"hook"关键词

### 问题：信任后重启又失效
**说明**：
- 这是正常的安全机制
- 每次重启都需要重新信任
- 可以考虑创建启动提醒脚本

## 📚 相关文档

- **详细问题分析**: `CODEX_HOOKS_ISSUE_RESOLUTION.md`
- **修复总结**: `CODEX_DESKTOP_FIX_SUMMARY.md`
- **项目状态**: `PROJECT_STATUS.md`
- **ZCode 配置参考**: `ZCODE_HOOKS_SETUP.md`

## 🎉 总结

**ChatGPT Desktop 红绿灯问题的最终答案**：

不是配置问题，不是代码问题，而是 **ChatGPT Desktop 的 hooks 信任安全机制**。在设置中手动信任 7 条 hooks 配置后，功能立即恢复正常。

这个发现不仅解决了当前问题，也为以后遇到类似问题提供了明确的解决路径。

---

**文档创建时间**: 2026-08-21 13:45  
**问题解决时间**: 2026-08-21 13:45  
**验证状态**: ✅ 完全正常，三个平台统一