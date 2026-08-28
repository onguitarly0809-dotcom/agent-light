# Agent Light 项目迁移指南

本文档提供了将 Agent Light 项目迁移到新电脑的完整指南。

## 项目概述

**Agent Light** 是一个将 Arduino/ESP32-C3 交通灯模块转换为 Claude Code 实时状态指示灯的硬件+软件项目。项目的主要目的是通过物理或虚拟的交通灯，直观地显示 AI 编程助手的工作状态。

### 支持的两种实现方式

1. **硬件版本（推荐）**
   - 使用 ESP32-C3 SuperMini + 玩具红绿灯挂件
   - 通过 USB 串口连接电脑
   - 支持多种灯光效果和状态映射

2. **软件版本（无需硬件）**
   - 使用 Rust + eframe 构建桌面 GUI 虚拟交通灯
   - 透明背景、始终置顶的虚拟交通灯
   - 适合没有硬件的用户使用

### 状态灯光效果

| 状态 | 灯光效果 | 说明 |
|------|----------|------|
| Idle | 绿灯常亮 | 空闲待命 |
| Thinking | 跑马灯（绿→黄→红） | AI 思考分析中 |
| Running | 黄灯慢闪（500ms） | 执行工具命令中 |
| Error | 红灯快闪（渐入渐灭） | 工具执行出错 |
| Alarm | 红黄交替警灯 | 需要用户注意/确认 |

## 环境要求

### 操作系统
- **Windows 10+**（主要支持）
- **macOS** 10.15+
- **Linux**（Ubuntu 18.04+）

### 必需软件

#### 基础软件
- **Node.js**（任意版本，推荐最新稳定版）
  - 下载地址：https://nodejs.org/

#### 硬件版本额外需要
- **Arduino IDE** 2.x
  - 下载地址：https://www.arduino.cc/en/software
- **ESP32 Board Package**（Espressif 官方版本）
  - 在 Arduino IDE 的 Boards Manager 中安装

#### 软件版本额外需要
- **Rust** 工具链
  - 安装命令：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - 或访问：https://rustup.rs/

#### 可选软件
- **Python 3.8+**（用于 BLE 版本）
- **Git**（用于版本控制）

### 硬件要求（硬件版本）

| 组件 | 规格 | 数量 |
|------|------|------|
| 主控板 | ESP32-C3 SuperMini 开发板 | 1 块 |
| 显示模块 | 玩具红绿灯挂件（公共正极） | 1 个 |
| 限流电阻 | 220Ω 1/4W 电阻 | 3 只 |
| 连接线 | 细导线/飞线（30AWG 推荐） | 若干 |
| 电源 | USB-C 数据线（必须支持数据传输） | 1 条 |
| 工具 | 电烙铁、焊锡丝、镊子、剪线钳 | 1 套 |

## 项目文件结构说明

### 核心文件列表

```
agent-light-main/
├── package.json                      # Node.js 项目配置和依赖
├── package-lock.json                 # Node.js 依赖锁定文件
├── Cargo.toml                        # Rust 项目配置
├── Cargo.lock                        # Rust 依赖锁定文件
├── .gitignore                        # Git 忽略规则
├── README.md                         # 英文项目说明
├── README.zh-CN.md                   # 中文项目说明
├── PROJECT_STATUS.md                 # 项目状态和技术文档
├── MIGRATION_GUIDE.md                # 本迁移指南
│
├── serial-bridge.mjs                 # 串口桥接服务（TCP 服务器）
├── hook-client.mjs                   # Hook 客户端
├── control.mjs                       # 桌面控制台
│
├── lib/                              # JavaScript 库文件
│   ├── commands.mjs                  # 命令解析和校验
│   ├── notification.mjs              # 通知处理
│   ├── post-tool.mjs                 # 工具执行后处理
│   └── post-tool-hermes.mjs          # Hermes 版本工具后处理
│
├── firmware/                         # 固件文件
│   ├── agent-light.ino               # Arduino Uno 原版固件
│   └── esp32c3-agent-light/          # ESP32-C3 固件
│       └── esp32c3-agent-light.ino   # ESP32-C3 主固件
│
├── src/                              # Rust 源代码
│   └── main.rs                       # 虚拟交通灯主程序
│
├── test/                             # 测试文件
│   ├── commands.test.mjs             # 命令测试
│   └── .keep                         # 目录保留文件
│
├── cursor_agent_status_light-main/   # Cursor IDE 版本（BLE）
│   ├── README.md                     # Cursor 版本说明
│   ├── ESP32_C3_*.ino                # BLE 版本固件
│   ├── cursor-light-bundle/          # Cursor Hooks 包
│   ├── 步骤一--CursorLight_购买清单.pdf
│   ├── 步骤二--ESP32蓝牙固件烧录.pdf
│   └── 步骤三--CursorLight_安装与使用指南.pdf
│
└── scripts/                          # 系统脚本
    ├── bridge-autostart.bat          # 开机自启动脚本
    ├── stop-bridge.bat               # 停止桥接服务脚本
    └── start-bridge-hidden.vbs       # 隐藏窗口启动脚本
```

### 配置文件说明

- **package.json**: 定义了 Node.js 依赖、脚本命令和项目元数据
- **Cargo.toml**: 定义了 Rust 项目依赖和配置
- **.gitignore**: 指定 Git 版本控制需要忽略的文件
- **claude-settings-snippet.json**: Claude Code Hooks 配置片段

### 固件文件说明

- **agent-light.ino**: 适用于 Arduino Uno 的基础版本
- **esp32c3-agent-light.ino**: 适用于 ESP32-C3 的增强版本，推荐使用

## 详细迁移步骤

### 步骤 1：获取项目文件

#### 方式 1：从备份恢复

如果你有项目备份：

```bash
# Windows PowerShell
Copy-Item -Recurse -Force "C:\path\to\backup\agent-light-main" "$env:USERPROFILE\projects\"

# macOS/Linux
cp -r /path/to/backup/agent-light-main ~/projects/
cd ~/projects/agent-light-main
```

#### 方式 2：从版本控制克隆

如果项目托管在 Git 仓库：

```bash
git clone <repository-url> ~/projects/agent-light-main
cd ~/projects/agent-light-main
```

#### 方式 3：直接复制文件

如果是直接复制文件：

```bash
# 将项目文件夹复制到目标位置
# 推荐位置：
# Windows: C:\Users\YourName\projects\agent-light-main
# macOS/Linux: ~/projects/agent-light-main
```

### 步骤 2：安装依赖

#### 安装 Node.js 依赖

```bash
cd ~/projects/agent-light-main  # 或 cd C:\Users\YourName\projects\agent-light-main

# 安装依赖
npm install

# 验证安装
npm list --depth=0
```

#### 安装 Rust 依赖（软件版本）

```bash
# 如果还没有安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 编译项目
cargo build --release

# 运行测试
cargo run
```

#### 安装 Python BLE 依赖（Cursor 版本）

```bash
# macOS
python3 -m pip install --user bleak

# Windows
py -3 -m pip install --user bleak

# Linux
python3 -m pip install --user bleak
```

### 步骤 3：硬件设置（硬件版本）

#### 3.1 ESP32-C3 接线

```
ESP32 3.3V  -> 灯板正极 (+)
ESP32 IO2   -> 220Ω -> 绿灯控制点
ESP32 IO3   -> 220Ω -> 黄灯控制点
ESP32 IO4   -> 220Ω -> 红灯控制点
```

**公共正极逻辑：**
- GPIO LOW = 灯亮
- GPIO HIGH = 灯灭

#### 3.2 使用 Arduino IDE 烧录固件

1. **安装 Arduino IDE**
   - 下载：https://www.arduino.cc/en/software
   - 安装并启动

2. **安装 ESP32 开发板包**
   - 打开 Arduino IDE
   - 进入 Tools > Board > Boards Manager
   - 搜索 "esp32"
   - 安装 "esp32 by Espressif Systems"

3. **选择开发板和端口**
   ```
   Board: ESP32C3 Dev Module
   Port: 选择对应的 USB 串口
   ```

4. **配置开发板设置**
   - USB CDC On Boot: Enabled
   - Upload Speed: 921600
   - Flash Size: 4MB

5. **烧录固件**
   - 打开 `firmware/esp32c3-agent-light/esp32c3-agent-light.ino`
   - 点击 Upload 按钮
   - 等待上传完成

#### 3.3 验证串口连接

```bash
# 启动桥接服务
npm run bridge

# 测试连接
npm run light -- idle
npm run light -- thinking
npm run light -- running
```

### 步骤 4：配置 Claude Code Hooks

#### 4.1 找到 Claude Code 配置目录

```bash
# Windows
%USERPROFILE%\.claude\

# macOS/Linux
~/.claude/
```

#### 4.2 合并配置文件

1. 打开 `claude-settings-snippet.json`
2. 打开目标机器的 `~/.claude/settings.json`
3. 将 snippet 中的配置合并到 settings.json
4. **重要**：修改所有路径指向新机器上的实际项目位置

#### 4.3 配置示例

```json
{
  "hooks": {
    "UserPromptSubmit": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\projects\\agent-light-main\\hook-client.mjs",
        "thinking"
      ]
    },
    "PreToolUse": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\projects\\agent-light-main\\hook-client.mjs",
        "running"
      ]
    },
    "PostToolUse": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\projects\\agent-light-main\\hook-client.mjs",
        "thinking"
      ]
    },
    "Stop": {
      "command": "node",
      "args": [
        "C:\\Users\\YourName\\projects\\agent-light-main\\hook-client.mjs",
        "idle"
      ]
    }
  }
}
```

#### 4.4 重启 Claude Code

配置完成后，重启 Claude Code 使配置生效。

### 步骤 5：测试验证

#### 5.1 启动桥接服务

```bash
# 方式 1：使用 npm 脚本
npm run bridge

# 方式 2：直接运行
node serial-bridge.mjs

# 方式 3：使用桌面控制台
npm run control
```

#### 5.2 测试灯效

```bash
# 测试基本状态
npm run light -- idle       # 绿灯常亮
npm run light -- thinking   # 跑马灯
npm run light -- running    # 黄灯闪烁
npm run light -- error      # 红灯快闪

# 测试自定义命令
npm run light -- Y:blink:700  # 黄灯 700ms 闪烁
npm run light -- R:on         # 红灯常亮
npm run light -- G:off        # 绿灯关闭
```

#### 5.3 验证 Hook 触发

1. 在 Claude Code 中开始一个对话
2. 观察交通灯是否显示 "thinking" 状态（跑马灯）
3. 让 Claude 执行工具命令
4. 观察是否切换到 "running" 状态（黄灯闪烁）
5. 工具执行完成后，观察是否回到 "thinking" 状态
6. 停止对话，观察是否回到 "idle" 状态（绿灯常亮）

## 常见问题解决

### 问题 1：找不到串口

**症状：** 启动桥接服务时提示找不到串口

**解决方案：**
1. 检查 USB 线是否支持数据传输（不是仅充电线）
2. 尝试更换 USB 端口
3. Windows：在设备管理器中查看是否有 COM 端口
4. macOS：在终端运行 `ls /dev/cu.*` 查看可用串口
5. 确保 ESP32-C3 已正确供电

**手动指定串口：**
```bash
npm run bridge -- --serial COM3  # Windows
npm run bridge -- --serial /dev/cu.usbmodem832101  # macOS
```

### 问题 2：依赖安装失败

**症状：** `npm install` 报错

**解决方案：**
```bash
# 清除 npm 缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install

# 如果仍有问题，尝试使用淘宝镜像
npm install --registry=https://registry.npmmirror.com
```

### 问题 3：权限问题（macOS 蓝牙）

**症状：** 提示 "Bluetooth device is turned off"

**解决方案：**
1. 打开系统设置 > 隐私与安全性 > 蓝牙
2. 给 Terminal、iTerm 或 Cursor 应用授权
3. 重启终端应用

### 问题 4：固件上传失败

**症状：** Arduino IDE 上传固件时卡在 "Connecting..."

**解决方案：**
```
1. 关闭串口监视器
2. 按住 ESP32-C3 上的 BOOT 按钮
3. 点击 Upload
4. 看到 "Writing..." 后松开 BOOT 按钮
```

### 问题 5：灯光效果不正常

**症状：** 灯光颜色不对或没有反应

**解决方案：**
1. 检查接线是否正确（IO2=绿，IO3=黄，IO4=红）
2. 确认使用的是公共正极灯板
3. 检查 220Ω 电阻是否正确连接
4. 重新烧录固件
5. 使用串口监视器查看调试信息（115200 波特率）

### 问题 6：Claude Code Hook 不触发

**症状：** Claude Code 工作时灯光没有变化

**解决方案：**
1. 检查 `~/.claude/settings.json` 配置是否正确
2. 确认路径指向正确的项目位置
3. 重启 Claude Code
4. 检查桥接服务是否正在运行
5. 查看桥接服务日志是否有错误信息

## 平台特定说明

### Windows 特定配置

#### 路径表示
- 使用反斜杠：`C:\Users\YourName\projects\agent-light-main`
- 或使用正斜杠：`C:/Users/YourName/projects/agent-light-main`

#### 权限问题
- 某些操作可能需要管理员权限
- 串口访问可能需要管理员权限

#### 开机自启动
```bash
# 使用提供的脚本
.\bridge-autostart.bat

# 或手动创建任务计划程序任务
```

#### 防火墙设置
- 确保防火墙允许 Node.js 和串口通信
- 可能需要添加防火墙例外

### macOS 特定配置

#### 路径表示
- 使用波浪号：`~/projects/agent-light-main`
- 或使用完整路径：`/Users/YourName/projects/agent-light-main`

#### 权限问题
```bash
# 给脚本添加执行权限
chmod +x *.sh

# 如果需要 sudo 权限
sudo npm install  # 不推荐，尽量避免
```

#### 蓝牙权限
- 系统设置 > 隐私与安全性 > 蓝牙
- 授权终端应用访问蓝牙

#### 开机自启动
```bash
# 使用 launchd
# 创建 ~/Library/LaunchAgents/com.agentlight.bridge.plist
```

### Linux 特定配置

#### 串口权限
```bash
# 将用户添加到 dialout 组
sudo usermod -a -G dialout $USER

# 重新登录后生效
```

#### 路径表示
- 使用波浪号：`~/projects/agent-light-main`
- 或使用完整路径：`/home/yourname/projects/agent-light-main`

#### 开机自启动
```bash
# 使用 systemd
# 创建 /etc/systemd/system/agent-light-bridge.service
sudo systemctl enable agent-light-bridge.service
sudo systemctl start agent-light-bridge.service
```

## 卸载和清理

### 完全移除项目

#### Windows

```powershell
# 1. 停止桥接服务
.\stop-bridge.bat

# 2. 删除项目目录
Remove-Item -Recurse -Force "$env:USERPROFILE\projects\agent-light-main"

# 3. 删除 Claude Code 配置
notepad "$env:USERPROFILE\.claude\settings.json"
# 手动删除 agent-light 相关的 hook 配置

# 4. 删除自启动（如果设置了）
# 从任务计划程序中删除相应任务
```

#### macOS/Linux

```bash
# 1. 停止桥接服务
pkill -f serial-bridge.mjs

# 2. 删除项目目录
rm -rf ~/projects/agent-light-main

# 3. 删除 Claude Code 配置
nano ~/.claude/settings.json
# 手动删除 agent-light 相关的 hook 配置

# 4. 删除自启动（如果设置了）
launchctl unload ~/Library/LaunchAgents/com.agentlight.bridge.plist
rm ~/Library/LaunchAgents/com.agentlight.bridge.plist
```

### 清理配置文件

#### Claude Code 配置
```bash
# Windows
notepad "%USERPROFILE%\.claude\settings.json"

# macOS/Linux
nano ~/.claude/settings.json
```

删除以下内容：
- 所有 `command` 包含 `agent-light-main` 的 hook 配置
- 相关的权限设置

#### 系统级清理
```bash
# 清理 npm 缓存（可选）
npm cache clean --force

# 清理 Rust 缓存（可选）
cargo clean

# 清理临时文件
rm -rf /tmp/claude-traffic-light  # Linux/macOS
```

## 高级配置

### 自定义灯光模式

通过环境变量自定义灯光效果：

```bash
# Windows
set CLAUDE_LIGHT_THINKING=Y:on
set CLAUDE_LIGHT_RUNNING=R:blink:100
set CLAUDE_LIGHT_THINKING_MS=700
set CLAUDE_LIGHT_RUNNING_MS=100

# macOS/Linux
export CLAUDE_LIGHT_THINKING=Y:on
export CLAUDE_LIGHT_RUNNING=R:blink:100
export CLAUDE_LIGHT_THINKING_MS=700
export CLAUDE_LIGHT_RUNNING_MS=100
```

### 桥接服务参数

| 参数 | 环境变量 | 默认值 | 说明 |
|------|----------|--------|------|
| --serial | CLAUDE_LIGHT_SERIAL | auto | 串口设备 |
| --baud | CLAUDE_LIGHT_BAUD | 115200 | 波特率 |
| --listen | CLAUDE_LIGHT_PORT | 8765 | TCP 监听端口 |
| --initial | CLAUDE_LIGHT_INITIAL | idle | 初始状态 |

### 使用桌面控制台

```bash
# 启动桌面控制台
npm run control

# 控制台功能：
# 1. 启动/停止桥接服务
# 2. 测试所有灯效
# 3. 诊断串口连接
# 4. 查看运行日志
# 5. 管理开机自启动
```

## 故障排除日志

### 启用调试日志

```bash
# 启动桥接服务时启用调试
DEBUG=* npm run bridge

# 查看详细日志
npm run bridge 2>&1 | tee bridge-debug.log
```

### 常见日志信息

| 日志信息 | 含义 | 解决方案 |
|----------|------|----------|
| "Serial port not found" | 找不到串口 | 检查 USB 连接和驱动 |
| "Permission denied" | 权限不足 | 使用 sudo 或添加用户到组 |
| "Device disconnected" | 设备断开 | 检查 USB 线和供电 |
| "Invalid command" | 命令格式错误 | 检查命令格式 |
| "Timeout" | 超时 | 检查串口通信和波特率 |

## 技术支持

### 文档资源
- 项目 README：`README.md` / `README.zh-CN.md`
- 项目状态：`PROJECT_STATUS.md`
- Cursor 版本：`cursor_agent_status_light-main/README.md`

### 在线资源
- Arduino IDE 官网：https://www.arduino.cc/en/software
- ESP32 文档：https://docs.espressif.com/projects/arduino-esp32/
- Node.js 文档：https://nodejs.org/docs/
- Rust 文档：https://doc.rust-lang.org/

### 社区支持
- GitHub Issues：[项目仓库地址]/issues

## 附录

### A. 完整命令参考

```bash
# 项目管理
npm install              # 安装依赖
npm update               # 更新依赖
npm run bridge           # 启动桥接服务
npm run control          # 启动控制台
npm run light -- <状态>  # 控制灯光

# 灯光状态
idle / green             # 空闲（绿灯常亮）
thinking / yellow        # 思考（跑马灯）
running / red / busy     # 执行（黄灯闪烁）
error                    # 错误（红灯快闪）

# 自定义命令
G:on / G:off / G:blink:ms    # 绿灯控制
Y:on / Y:off / Y:blink:ms    # 黄灯控制
R:on / R:off / R:blink:ms    # 红灯控制

# Rust 项目
cargo build               # 编译项目
cargo run                 # 运行项目
cargo test                # 运行测试
cargo build --release     # 发布版本编译
```

### B. 硬件购买指南

#### 推荐购买渠道
- 淘宝/天猫：搜索 "ESP32-C3 SuperMini"、"红绿灯挂件"
- 京东：搜索 "ESP32-C3 开发板"、"交通信号灯模型"
- 1688：批量采购

#### 预算估算
- ESP32-C3 SuperMini：¥15-25
- 红绿灯挂件：¥10-20
- 电阻和连线：¥5-10
- USB-C 数据线：¥5-15
- **总计：¥35-70**

### C. 版本兼容性

| 组件 | 最低版本 | 推荐版本 | 测试状态 |
|------|----------|----------|----------|
| Node.js | 14.x | 18.x+ | ✅ 完全测试 |
| Arduino IDE | 2.0 | 2.2+ | ✅ 完全测试 |
| ESP32 Core | 2.0.0 | 3.0.0+ | ✅ 完全测试 |
| Rust | 1.60 | 1.70+ | ✅ 完全测试 |
| Python | 3.8 | 3.10+ | ✅ 完全测试 |

---

**文档版本：** 1.0
**最后更新：** 2026-07-16
**适用于：** Agent Light v1.x 系列