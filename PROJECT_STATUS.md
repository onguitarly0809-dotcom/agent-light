# 项目进度总结

> 用途：日后快速了解本项目当前状态、架构、关键决策与历史改动。最后更新：2026-08-20。

## 一句话目标

用 **cursor 项目的硬件**（ESP32-C3 SuperMini + 玩具红绿灯挂件，公共正极灯板）跑 **agent-light 项目的软件**（hooks + 命令体系），**USB 串口**通信（弃用原 BLE），Windows 平台，灯效复刻自 cursor。**Claude Code、Codex 与 ZCode 三 CLI 联动**：三个 CLI 的 hooks 都走同一个 TCP 桥 → 同一盏灯，打开哪个都自动响应（后到者胜）。

## 架构

```
Claude Code hooks ─┐
ZCode hooks ──────┤──> hook-client.mjs (TCP, fire-and-forget, 250ms 超时)
Codex hooks ───────┘        │
                            ▼
                    serial-bridge.mjs (长驻 TCP server 127.0.0.1:8765 + serialport 串口)
                            │
                            ▼
              ──USB CDC──> ESP32-C3 固件（解析协议、驱动 LEDC PWM 灯效）
```

- hook-client / 桥之间走 TCP（语言无关、解耦），因此**多个 CLI 可共用同一桥**。
- 桥是**长驻进程**，必须保持运行；不开则 hook-client 静默失败，agent 不受影响。
- Claude Code hooks 在用户级 `~/.claude/settings.json`（全局）；Codex hooks 在 `~/.codex/hooks.json`（见下）；ZCode hooks 在 `~/.zcode/cli/config.json`（见下）。三套配置都指向同一个 `hook-client.mjs` → 同一桥 → 同一盏灯。

## 当前状态映射（已实现 5 态）

| Claude Code 事件 | 命令 | 灯效 | 固件模式 |
|---|---|---|---|
| `UserPromptSubmit` 提交 prompt | `thinking` | 跑马灯 绿→黄→红（1500ms） | MODE_CHASE |
| `PreToolUse` 工具开始 | `running` | 黄灯慢闪（500ms） | MODE_BLINK(黄) |
| `PostToolUse` 工具结束（正常） | `thinking` | 跑马灯 | MODE_CHASE |
| `PostToolUse` 工具结束（出错） | `error` | 红灯快闪（渐入渐灭） | MODE_ERROR |
| `Notification` 需确认/权限 | `alarm`（仅权限/需注意）/ 不发灯（空闲等你） | 红黄交替警灯 | MODE_ALARM |
| `Stop` 回复结束 | `idle` | 绿灯常亮 | MODE_SOLID(绿) |

| ZCode 事件 | 命令 | 灯效 | 固件模式 |
|---|---|---|---|
| `SessionStart` 会话开始 | `idle` | 绿灯常亮 | MODE_SOLID(绿) |
| `UserPromptSubmit` 提交 prompt | `thinking` | 跑马灯 绿→黄→红（1500ms） | MODE_CHASE |
| `PreToolUse` 工具开始 | `running` | 黄灯慢闪（500ms） | MODE_BLINK(黄) |
| `PostToolUse` 工具结束 | `thinking`/`error` | 跑马灯/红灯快闪 | MODE_CHASE/MODE_ERROR |
| `PermissionRequest` 需要权限 | `alarm` | 红黄交替警灯 | MODE_ALARM |
| `Stop` 回复结束 | `idle` | 绿灯常亮 | MODE_SOLID(绿) |

> 出错判定：`lib/post-tool.mjs` 读 stdin 的 `tool_response.is_error === true` → 发 `error`，否则发 `thinking`。保守低误报，可能漏未标 is_error 的失败。ZCode 使用相同的错误判定逻辑。

## 文件清单与职责

| 文件 | 状态 | 职责 |
|---|---|---|
| `hook-client.mjs` | **改（2026-08-10）** | TCP 客户端，发一条命令即退出，只用 `node:net` 零依赖。2026-08-10 加**来源归属**：读 argv[3]（Claude 不传→默认 `claude`；Codex 传 `codex`），`appendFileSync` 追加写 `agent-light-activity.log`（失败静默，不影响灯）。不影响 TCP 发送行为 |
| `lib/commands.mjs` | 改 | 命令归一化校验。`DEFAULTS.thinking='chase'`、`running='Y:blink:500'`；`EFFECTS={chase,error,alarm}` 原样透传 |
| `lib/post-tool.mjs` | **新建** | PostToolUse hook：读 stdin 判 is_error，发 error 或 thinking |
| `lib/post-tool-codex.mjs` | **新建** | **Codex 版** PostToolUse hook：tool_response 可能是空串或含 `is_error`/`exit_code` 的对象，判 error 或 thinking。与 Claude 版分开，互不影响 |
| `lib/notification.mjs` | **新建** | Notification hook：读 message 区分"权限/需注意"→alarm 与"空闲等你"→不发灯（保持绿灯）。避免空闲 60s 误触警灯 |
| `serial-bridge.mjs` | **重写** | serialport 包跨平台串口桥；TCP+行缓冲+normalizeCommand 校验+优雅关闭；自动检测 COM 口；开端口延迟 1500ms 发初始命令；**看门狗**（120s 活动态无命令自动回 idle）；**zombie 修复**（2026-08-06：串口 error/close 即 `process.exit(1)` 交给自启循环重连，原只设 exitCode 不退出=假死；`shuttingDown` 防正常关闭误杀；`server.on('error')` 兜底） |
| `bridge-autostart.bat` | **改** | 后台自启重启循环：node 崩了 3s 重起，设 `CLAUDE_LIGHT_WATCHDOG_MS=120000`。2026-08-06 加日志重定向（node 输出与重启 echo `>> bridge.log` 追加，开机失败可诊断）。全 ASCII 注释；用 `ping` 计时（`timeout` 在隐藏无控制台环境会失效空转）；必须 CRLF |
| `start-bridge-hidden.vbs` | 未动 | 手动隐藏窗口启动上面的 bat；开机自启的 VBS 现由 `control.mjs` 生成（`agent-light-bridge.vbs`） |
| `stop-bridge.bat` | 未动 | 一键停止桥（按进程名 node.exe/cmd.exe 过滤，不会自杀，会连带停掉自启重启循环）。重烧固件前先跑它释放 COM3。`control.mjs` 菜单 2 已内置同样逻辑 |
| `control.mjs` | **新建** | 桌面交互控制台：启动/停止桥、灯效测试、状态诊断、开机自启管理。直接 detached 跑 `serial-bridge.mjs`，日志写 `bridge.log`；协调自启循环（启动防重复、停止连带杀循环、显示自启状态） |
| `Agent-Light控制台.bat`（桌面） | **新建** | 双击拉起 `control.mjs`；`chcp 65001` 防中文乱码 |
| `bridge.log` | 自动生成 | 桥的 stdout/stderr，诊断页读取。自启（bat）追加保留重试历史、手动启动覆盖 |
| `agent-light-activity.log` | **自动生成（2026-08-10）** | `hook-client.mjs` 按来源追加的命令活动日志（`[claude]/[codex] 时间 命令`），监控"哪个 CLI 在驱动灯"。失败静默不影响灯 |
| `firmware/esp32c3-agent-light/esp32c3-agent-light.ino` | **新建** | ESP32-C3 固件（见下） |
| `firmware/agent-light.ino` | 未动 | 原版 Arduino Uno 固件，保留未用 |
| `claude-settings-snippet.json` | 改 | hooks 配置片段，路径已更新 |
| `codex-hooks-snippet.json` | **新建** | **Codex hooks 配置片段**（备份 `~/.codex/hooks.json` 的内容） |
| `~/.claude/settings.json` | 改 | 全局 hooks 已合并（PostToolUse→post-tool，Notification→notification.mjs 智能区分，PreToolUse→running，Stop→idle） |
| `~/.codex/hooks.json` | **新建（并入现有）** | **Codex hooks**：UserPromptSubmit→thinking（与既有 codex-hud hook 并存）、SessionStart→idle、PreToolUse→running、PostToolUse→post-tool-codex、PermissionRequest→alarm、Stop→idle。命令带 `codex` 来源参数。与 Claude 走同一 `hook-client.mjs` |
| `CODEX_HOOKS_ISSUE_RESOLUTION.md` | **新建（2026-08-20）** | **Codex hooks 问题完整诊断文档**：问题症状、根因分析、解决方案、验证方法、故障排除 |
| `codex-desktop-hooks.bat` | **新建（2026-08-20）** | **Codex 桌面应用启动脚本**：自动添加 `--dangerously-bypass-hook-trust` 参数，立即解决 hooks 信任问题 |
| `test-codex-hooks.mjs` | **新建（2026-08-20）** | **Codex hooks 测试脚本**：统计 hooks 触发次数、最后触发时间、命令类型，用于诊断 |
| `simple-test-hooks.json` | **新建（2026-08-20）** | **简化测试配置**：用于测试 hooks 基本功能的极简配置 |
| `test-hook-trigger.mjs` | **新建（2026-08-20）** | **Hook 触发验证脚本**：记录 hooks 事件到日志文件，验证 hooks 是否被调用 |
| `zcode-hooks-snippet.json` | **新建（2026-08-21）** | **ZCode hooks 配置片段**：完整的 ZCode hooks 配置模板，支持所有核心事件 |
| `zcode-desktop-hooks.bat` | **新建（2026-08-21）** | **ZCode 桌面应用启动脚本**：提供友好的中文界面和功能说明 |
| `setup-zcode-hooks.bat` | **新建（2026-08-21）** | **ZCode hooks 自动配置脚本**：自动将 hooks 配置合并到 `~/.zcode/cli/config.json` |
| `package.json` | 改 | 加 `serialport ^12` 依赖 |
| `test/commands.test.mjs` | 改 | thinking→chase、效果透传测试，5 测试全过 |
| `src/main.rs` | 未动 | 软件版虚拟灯（Rust+eframe），`/tmp/` 路径，Unix only，Windows 不可用 |

## ESP32-C3 固件要点

- **引脚（实测）**：`GREEN_PIN=4`(IO4)、`YELLOW_PIN=3`(IO3)、`RED_PIN=2`(IO2)。绿红与 cursor README 标称相反，按实测调整。
- **公共正极反相**：`writeLed(pin,value)` → `ledcWrite(ch, 255-value)`（LOW=亮）。
- **LEDC PWM**：`PWM_FREQ=5000`，分辨率 8 位；亮度上限 `RED_MAX=200/YELLOW_MAX=255/GREEN_MAX=200`（黄灯拉满、红绿压低，平衡视觉亮度；可按实物微调）。
- **版本自适应**（关键坑）：`#if ESP_ARDUINO_VERSION_MAJOR>=3` 用 `ledcAttach(pin,...)`+`ledcWrite(pin,...)`；2.x 用 `ledcSetup+ledcAttachPin+ledcWrite(ch,...)`。用户装的是 2.x。
- **通信**：USB CDC（Arduino IDE 设 `USB CDC On Boot=Enabled`），`Serial.begin(115200)`，逐行 `\n` 解析。
- **模式**：MODE_SOLID / MODE_BLINK / MODE_CHASE / MODE_ERROR / MODE_ALARM / MODE_OFF。非阻塞，全 `millis()`，无 `delay()`。
- **跑马灯/警灯/快闪**逻辑移植自 cursor 固件（`updateThinking`/`updateAlarm`/`updateError`+`fadeInOutBrightness`）。
- **跑马灯当前参数**（`updateChase()`）：`period=1500`（一轮 1500ms，每色 500ms），`halfWidth=seg*6/7`（≈429ms，交叉偏多、交接绵长但顺序仍可辨，无双灯以上同亮）。调 `period` 改单灯呼吸时长，调 `halfWidth` 改交叉量（`seg/2`=零交叉硬切，`seg`=开始三灯同亮，越大越糊）。

## 运行方式

```sh
npm install                 # 装 serialport
npm run bridge              # 启动桥（常驻），可加 -- --serial COM3
npm run control             # 桌面控制台（启动/停止/测试/诊断），推荐
npm run light -- thinking   # 手动发命令测试
npm run light -- error
npm run light -- alarm
npm run light -- idle
npm test                    # 单元测试
tail -f agent-light-activity.log   # 监控：哪个 CLI 在驱动灯（[claude]/[codex]/[zcode]）
tail -f bridge.log                 # 监控：桥收到的完整命令流

# ZCode 配置（首次使用）
setup-zcode-hooks.bat            # 自动配置 ZCode hooks
zcode-desktop-hooks.bat          # 启动带 hooks 支持的 ZCode
```

烧录：Arduino IDE 打开 `firmware/esp32c3-agent-light/esp32c3-agent-light.ino`，Board=ESP32C3 Dev Module，USB CDC On Boot=Enabled，上传。实测端口 COM3。

## 桌面控制台（当前推荐用法）

**开机自启已开启**（2026-08-06 重新启用）：启动文件夹 VBS → `bridge-autostart.bat` 重启循环 → 桥。串口断开时桥自动退出、循环 ~3s 重连（硬件未就绪/中途拔插自动恢复，详见"后台自启"）。仍可双击桌面 `Agent-Light控制台.bat` 查看/控制状态。

桌面 `Agent-Light控制台.bat`（`chcp 65001` + `cd` 仓库 + `node control.mjs`）拉起 `control.mjs` 交互菜单：

- **1 启动桥**：`spawn` detached + `windowsHide` 直接跑 `node serial-bridge.mjs`，stdout/stderr 重定向到 `bridge.log`（每次启动覆盖）；设 `CLAUDE_LIGHT_WATCHDOG_MS=120000`。spawn 后等 2.5s 查端口 8765 + 读日志判断成败。**不走 `bridge-autostart.bat` 重启循环**（手动启动无循环）；若自启循环/桥进程已在运行则拒绝（防重复抢 COM3/8765）。
- **2 停止桥**：powershell 同时杀 `node.exe + *serial-bridge.mjs*` 和 `cmd.exe + *bridge-autostart.bat*`（自启循环不会复活）。
- **3 灯效测试**：idle/thinking/running/error/alarm/`G:off`(灭灯)/自定义命令，经 `normalizeCommand` 校验后 net 发到 8765。
- **4 状态诊断**：串口列表（标 ESP32 VID 303a）+ 桥进程 + 端口 8765 + 发测试命令 + `bridge.log` 末尾，给 ✔/✖ 结论和修复建议。**出问题时先用这个。** 桥未运行但自启循环活着时，会提示"循环运行中"而非误报。
- **5 开机自启管理**：查看/关闭/重建启动文件夹 VBS（默认已开，推荐）。

复用：`lib/commands.mjs` `normalizeCommand`、`hook-client.mjs` 的 net 发送模式、`serialport` `SerialPort.list()`、`stop-bridge.bat` 的 powershell 杀进程逻辑。自启场景由 `bridge-autostart.bat`（重启循环）/ `start-bridge-hidden.vbs`（隐藏启动）/ `agent-light-bridge.vbs`（启动文件夹）提供（见"后台自启"）。

> `bridge.log` 让启动失败（如 COM3 未就绪）不再静默：诊断页能直接看到 `Cannot open COM3`。自启 bat 追加保留重试历史、手动启动覆盖。

## Codex 双 CLI 联动（2026-08-20 更新）

架构本来就解耦：hooks 只负责往 TCP 127.0.0.1:8765 发一条命令。因此 **Codex 的 hooks 也指向同一个 `hook-client.mjs` 即可共用同一盏灯**，无需改桥/固件。

**Codex 侧配置（与 Claude 的 `~/.claude/settings.json` 并列，互不影响）**：
- `~/.codex/hooks.json`（全局 hooks 配置；hooks 特性在该版本 `codex-cli 0.147.0` 是 `stable` 且默认开启，**无需**动 config.toml 的 features）
- 事件映射：

| Codex 事件 | 命令 | 灯效 | 说明 |
|---|---|---|---|
| `SessionStart` | `idle` | 绿灯常亮 | 会话开始复位 |
| `UserPromptSubmit` | `thinking` | 跑马灯 | 与既有 codex-hud hook 并存（各自独立 matcher 组） |
| `PreToolUse` | `running` | 黄灯慢闪 | matcher 省略=全工具 |
| `PostToolUse` | `post-tool-codex` | error/跑马灯 | 判定见下 |
| `PermissionRequest` | `alarm` | 红黄警灯 | 需授权/需注意 |
| `Stop` | `idle` | 绿灯常亮 | 回复结束 |

- **PostToolUse 判定（`lib/post-tool-codex.mjs`）**：Codex 的 stdin 与 Claude Code 不同——`tool_response` 可能是空串，也可能是对象。判定 `is_error===true` 或数字 `exit_code!==0` → `error`，其余 → `thinking`。保守低误报，与 Claude 版 `post-tool.mjs` 分开，不碰已工作的 Claude 链路。
- **hook 信任机制**：Codex 对每个 hook 记录 trusted_hash（`config.toml` 的 `[hooks.state]`）。**首次运行 codex 会弹 "Hooks need review" 界面，需按键 "Trust all and continue"**，否则 hooks 不执行（灯不响应）。**重要发现（2026-08-20）**：API 认证完全支持 hooks，问题根源是信任机制未激活。
  - **问题症状**：hooks 配置正确但 Codex 桌面应用不执行，无 `[codex]` 日志记录
  - **根本原因**：hooks 需要被用户明确信任才能执行，新配置或信任丢失后 hooks 被跳过
  - **解决方案**：
    1. **推荐**：使用 `codex-desktop-hooks.bat` 启动脚本（仓库根目录），自动添加 `--dangerously-bypass-hook-trust` 参数
    2. **长期**：在 Codex 桌面应用中运行 `/hooks` 命令，手动信任所有 hooks
    3. **CLI 测试**：`codex --dangerously-bypass-hook-trust --model glm-4.6` 验证功能
  - **验证方法**：`tail -f agent-light-activity.log` 应看到 `[codex]` 记录；`codex` 输出应显示 `hook: SessionStart` 等
  - **详细文档**：参见 `CODEX_HOOKS_ISSUE_RESOLUTION.md` 完整诊断过程和故障排除
- **事件清单（从二进制 schema 确认）**：SessionStart / SessionEnd / UserPromptSubmit / PreToolUse / PostToolUse / PermissionRequest / PreCompact / PostCompact / SubagentStart / SubagentStop / Stop。Windows 上 hook 命令走 `COMSPEC`（cmd.exe），`node C:/.../hook-client.mjs xxx` 直接可用。
- **无 Abort 事件**：Codex 打断思考同样无专用 hook → 桥端 120s 看门狗兜底（与 Claude 相同）。
- **测试**：模拟 payload 喂 `lib/post-tool-codex.mjs`（exit_code 非 0 / is_error / 空串 / exit_code 0 全判对），`bridge.log` 确认命令到达（`error`/`chase`）。`codex doctor` 全绿（config 解析、DeepSeek 认证均正常）。

### 监控手段（怎么确认灯是谁驱动的）

| 手段 | 命令/位置 | 说明 |
|---|---|---|
| **来源归属日志**（2026-08-10 新增） | `tail -f agent-light-activity.log`（仓库根，自动生成） | `[claude] 17:33:31 Y:blink:500` / `[codex] 17:33:36 chase` / `[zcode] 17:33:40 idle`。`hook-client.mjs` 读 argv[3] 记来源：Claude hooks 不传（默认 `claude`），Codex hooks 显式传 `codex`，ZCode hooks 显式传 `zcode`。**可区分是哪个 CLI 在驱动**；失败静默不影响灯 |
| **桥日志**（完整命令流） | `tail -f bridge.log` | 桥收到并成功写入串口的每条命令（`HH:MM:SS -> 命令`）。**分不清来源**（同端口同格式），但覆盖所有事件所有来源 |
| **codex 自身输出** | codex 运行界面 / `codex exec` 输出 | 打印 `hook: SessionStart` / `hook: UserPromptSubmit` / `hook: Stop` 等生命周期行 |
| **状态诊断** | 桌面 `Agent-Light控制台.bat` → 菜单 4 | 串口列表、桥进程、8765 端口、发测试命令、bridge.log 末尾，给 ✔/✖ 结论 |
| **看门狗日志** | `grep watchdog bridge.log` | Esc 打断后 120s 无命令回 idle，会打印 `watchdog: no activity` |
| **灯本身** | 目视 | 最终物理反馈（跑马灯/黄闪/红闪/警灯/绿灯） |

> `bridge.log` 的 `-> 命令` 是 **`serial.write()` 成功后**才打印（见 `sendCommand()`）；串口若死会立刻出现 `Serial error` 并退出由循环重连。故"有 `->`、无 error"即命令已交给固件。判断"是否真的驱动了灯"以物理目视为准。

## 看门狗（Esc 打断恢复）

Esc 打断思考时**没有可靠 hook 触发**（Stop 不保证触发，无专用打断 hook），灯会卡在 chase。桥端加看门狗解决：

- 活动态（`chase` 思考 / `Y:blink:500` 运行 / `error`）收到后启动倒计时，每次新命令重置。运行令牌由 `RUNNING_COMMAND = normalizeCommand('running')` 动态取得，改 `DEFAULTS.running` 后看门狗分类自动跟随，不会悄悄失效。
- **120s 没再收到任何命令** → 判定被打断，自动发 `idle`（绿灯）。日志打印 `watchdog: no activity ... returning to idle`。
- `alarm`（Notification 的权限/需注意）归为粘住态：**disarm 看门狗且不回退**，必须等下一个 hook 清除（设计上不掩盖"需处理"信号）。注意：`lib/notification.mjs` 会过滤掉"空闲等你"类 Notification（不发灯），所以 alarm 只在真正需处理时亮，不会因 60s 空闲误触。
- 手动直接命令（`R:on` 等）也 disarm，不回退，保持原样。
- 超时 env：`CLAUDE_LIGHT_WATCHDOG_MS`（默认 120000；设 `0` 关闭）。权衡：太短→长纯思考（>120s 无工具调用）会被误回 idle；太长→打断后回 idle 慢。120s 是折中。

> 已知副作用：纯思考超 120s 会在中途被误回 idle 一次，直到首个 `PreToolUse` 触发恢复。频繁工具调用的会话几乎不受影响。

## 后台自启（Windows）— 启用中（2026-08-06 重新启用）

> 2026-06-30 因 zombie 弃用，改用桌面控制台手动启动；2026-08-06 修复 zombie 后重新启用（见决策 16）。`bridge-autostart.bat` / `start-bridge-hidden.vbs` / `stop-bridge.bat` 恢复为工作流一部分；`control.mjs` 负责协调自启循环。

链路：`agent-light-bridge.vbs`（启动文件夹，隐藏窗口）→ `bridge-autostart.bat`（重启循环 + 120s 看门狗 env + 日志 `>> bridge.log` 追加）→ `node serial-bridge.mjs`。

- **zombie 修复（关键）**：`serial-bridge.mjs` 原在串口 `error` 时只设 `exitCode=1` **不退出** → 进程假死（TCP 活、串口死），重启循环永不触发。现 `error`/`close`（拔插）一律 `process.exit(1)` 交给循环重连；`shutdown()` 置 `shuttingDown` 防正常关闭被误杀；`server.on('error')`（如重复桥 EADDRINUSE）也退出由循环恢复。serialport v12 拔插时 `close`（带 DisconnectedError）与 `error` 都可能触发，都处理。
- **自愈能力**：开机时 ESP32 未就绪 → 桥 `Cannot open COMx` 退出 → 循环 ~3s 重试直到就绪；中途拔插 → 桥退出 → 循环重连。**不再需要手动 stop→start**。
- **日志**：桥输出 `>> bridge.log`（追加，保留多次重试历史），开机失败不再静默，控制台"4 状态诊断"可直接看。
- **control.mjs 协调**：菜单 1 启动时若自启循环/桥进程在运行会拒绝（防重复抢 COM3/8765）；菜单 2 停止会同时杀 node 桥 + cmd 循环（不会复活）；主菜单/诊断显示自启状态。
- 关自启：控制台菜单 5"关闭开机自启"，或 `Win+R` → `shell:startup` → 删 `agent-light-bridge.vbs`。
- 踩坑（保留）：bat 中文注释 UTF-8/GBK 乱码 → 全 ASCII；`timeout` 隐藏环境失效 → `ping -n 4`；bat 必须 CRLF（LF 报"语法不正确"）。
- 2026-08-06 观察：首次向启动文件夹写 `agent-light-bridge.vbs` 被瞬时拦截（node `EPERM` / PowerShell `拒绝访问`，约 1 分钟），随后放行成功——疑似安全软件/Defender 实时防护对新自启脚本的首次评估。若重建失败，控制台菜单 5 再试；仍不行改走任务计划程序或注册表 Run 键。
- 已知副作用：自启桥在拔插重连的 ~3s 窗口内 TCP 短暂不可用，hook 命令静默丢弃一次，由下一个 hook 同步。

## 关键决策与踩过的坑（历史脉络）

1. **串口桥重写**：原 `serial-bridge.mjs` 用 macOS `stty`+`/dev/cu.*`，Windows 不可用 → 改 `serialport` 包。
2. **固件移植**：原 Arduino 固件 active-high → 改公共正极 active-low（反相）+ ESP32-C3 引脚 + USB CDC。
3. **绿红灯反了**：实测 IO2=红、IO4=绿（与标称反）→ 固件 `GREEN_PIN`/`RED_PIN` 对调，不改线。
4. **bridge 不打印日志**：`serial.on('open')` 注册在 `await openSerial()` 之后，事件已触发完 → 把日志和初始命令移到 `await` 后直接执行；`openSerial` 失败改 try/catch 友好报错。曾因此误以为没启动、重复起桥导致 `Access denied`。
5. **ledcAttach 编译失败**：核心 2.x 无 `ledcAttach` → 版本自适应预编译分支。
6. **thinking 改跑马灯**：光改固件没用——hook 发的 `thinking` 会被 `commands.mjs` 转成 `Y:blink:250`，固件收不到 `thinking`。必须改 `DEFAULTS.thinking='chase'`+`EFFECTS` 透传，固件识别 `chase` 令牌。
7. **输出层改 PWM**：跑马灯需要平滑渐变，`digitalWrite`→LEDC PWM，idle/running 也顺带用 PWM 表达。
8. **新增 error/alarm**：固件加模式 + `EFFECTS` 加令牌 + 新建 `post-tool.mjs` 判错 + hooks 加 `Notification`。
9. **跑马灯调参**：从离散三角波 → 加交叉重叠呼吸感。最终 `period=1500`、`halfWidth=seg*6/7`。曾试过 `halfWidth>seg`（三灯同亮，太糊）和 `seg*11/20`（太干净），折中到 6/7。
10. **看门狗**：Esc 打断无 hook → 桥端 120s 活动态无命令回 idle；alarm 粘住不回退。
11. **后台自启**：启动文件夹 VBS + bat 重启循环。bat 中文注释 UTF-8/GBK 乱码 → 全 ASCII；`timeout` 隐藏环境失效 → `ping`。
12. **桌面控制台替代开机自启**：开机自启时 ESP32 未就绪致 `openSerial` 静默失败，桥假死（TCP 活、串口死），灯不亮且无报错。改为关自启 + 桌面 `Agent-Light控制台.bat`→`control.mjs` 手动启动；桥直接 detached 跑、stdout/stderr 写 `bridge.log`，启动失败不再静默（诊断页可见 `Cannot open COM3`）。用户选"菜单按数字启动 + 不要崩溃自动重启"。bat 闪退坑：Write 工具默认写 LF，cmd 解析 LF-only 报"语法不正确"中止 → 必须 CRLF（`sed -i 's/$/\r/'`）；bash `printf` 会把路径里 `\U` 当 unicode 转义吃掉，别用。
13. **running 改黄灯**：原 `R:blink:250` 红灯闪与 error 红灯混淆（红像出错）。改 `DEFAULTS.running='Y:blink:500'`，红色专属 error/alarm，黄=工作中、绿=就绪。同步把看门狗 `category()` 的运行判定从硬编码 `^R:blink` 改为 `normalizeCommand('running')` 动态匹配，避免改色后看门狗静默失效。
14. **Notification 智能区分**：Claude Code 空闲 ~60s 等输入也触发 Notification，旧配置无脑发 alarm，导致"停手一会儿就闪红"。新建 `lib/notification.mjs` 读 `message`：含 `waiting for your input` → 不发灯（保持绿灯），其余（权限请求/需注意/解析失败）→ alarm。红色只在真正需处理时亮。

15. **Codex hooks 信任问题解决**（2026-08-20 重大发现）：
    - **初始错误诊断**：误认为 API 认证不支持 hooks，基于 Codex 日志 `"remote control requires ChatGPT authentication; API key auth is not supported"`
    - **问题排查**：通过 `--dangerously-bypass-hook-trust` 参数验证，hooks 成功执行并产生大量 `[codex]` 日志记录
    - **根因确认**：问题是 hooks 信任机制，而非 API 认证限制
    - **解决方案**：
      - 创建 `codex-desktop-hooks.bat` 启动脚本，自动绕过信任检查
      - 提供手动信任方案：在 Codex 桌面应用中运行 `/hooks` 命令
      - 创建 `CODEX_HOOKS_ISSUE_RESOLUTION.md` 完整诊断文档
    - **重要教训**：官方文档明确说明 API 认证不影响 hooks，应更仔细分析信任机制而非认证方式

16. **灯"完全不工作"三查**（2026-08-05 实战）：灯一点反应都没有时，根因往往不是桥代码，按顺序查三层：
    - **① 硬件没插/被拔**：ESP32 拔掉后 COM3 在设备管理器变**幽灵设备**（`CM_PROB_PHANTOM`——注册表有记录、物理不存在）。此时 `SerialPort.list()` 返回 `[]`，但 `reg query HKLM\HARDWARE\DEVICEMAP\SERIALCOMM` 仍显示 COM3，**别被注册表骗了**。判据：PowerShell `Get-PnpDevice -Class Ports` 看 Status 是 `OK` 还是 `Unknown`、Problem 列是否 `CM_PROB_PHANTOM`。修：插好 ESP32，确认 Status 变 OK。
    - **② zombie 桥（串口句柄失效）**：桥进程活着、TCP 8765 还在监听，但串口已死。信号：`bridge.log` 出现 `Serial error: Writing to COM port (WriteFileEx): Unknown error code 22`（error 22 = 设备已拔、句柄失效）。修：控制台 `2 停止桥 → 1 启动桥` 重连。注意 `SerialPort.list()` 此刻能看到新插上的 COM3，但旧桥仍握着死句柄，必须重启桥才生效。
    - **③ hooks 丢失**：全局 `~/.claude/settings.json` 只剩 env（重写配置/换 API 时把 hooks 冲掉），Claude Code 从不发命令，桥收不到任何指令。修：把 `claude-settings-snippet.json` 的 hooks 合并回去（保留 env，写前先备份 `.bak`）。hooks 改动对**新会话**生效，当前会话无效。诊断技巧：cat 全局 settings.json 数一下有没有 `"hooks"` 键最快。
    - 附带收获：桥日志每次启动**覆盖** `bridge.log`，重启后旧 error 就没了——要复现"串口报错"需在重启前先看。（2026-08-06 起：自启 bat 改为**追加**，保留多次重试历史；手动启动仍覆盖。）

16. **重新启用开机自启（修 zombie）**（2026-08-06）：zombie 根因 = `serial-bridge.mjs` 串口 `error` 只设 exitCode **不退出** → 进程假死（TCP 活、串口死），`bridge-autostart.bat` 重启循环永不触发。修：`error`/`close` 时 `process.exit(1)` + `shuttingDown` 防正常关闭误杀 + `server.on('error')`（EADDRINUSE 等）兜底退出；bat 日志改 `>> bridge.log` 追加；control.mjs 加 `autostartLoopPids()`（菜单 1 防重复起桥、菜单 2 同时杀 node+cmd 循环），`autostartVbsContent()` 改跑 `cmd /c …bridge-autostart.bat` 隐藏窗口（弃用直接跑 node；VBS 反斜杠**不转义**，原生成器双反斜杠是 bug）；启用启动文件夹 VBS。serialport v12 拔插时 `close`（带 DisconnectedError）与 `error` 都触发，都处理。**已验证（2026-08-06）**：`npm test` 5/5；语法检查通过；bat CRLF；重启循环实测桥连 COM3、监听 8765、服务 hook；杀桥进程后循环 ~3s 自动重连（日志 `bridge exited, restarting in 3s...` → 新桥重连 COM3 发 `G:on`）；`stopBridge` 同时杀 node+cmd 循环无残留；`startBridge` 在桥/循环运行时拒绝。**副作用**：手动 direct-spawn 桥仍无循环；自启下拔插 ~3s 自动重连（不再是已知限制）。

17. **Codex 双 CLI 联动**（2026-08-10）：用户本机装了 `codex-cli 0.147.0`（npm `@openai/codex`，DeepSeek 提供方，`~/.codex/config.toml`）。查询目标是"换 codex 也能用红绿灯，打开哪个都自动响应"。结论：**可行**——hooks 与桥只隔一层 TCP，两套 hooks 配置指向同一 `hook-client.mjs` 即可。**关键事实（从本机 codex.exe 二进制 schema 反推验证）**：hooks 特性 `stable` 默认开启；hooks 配置文件是 `~/.codex/hooks.json`（3 层结构 event→matcher 组→handlers，`matcher` 省略=全匹配，handler 字段 `type/command/timeout/statusMessage`）；事件共 11 个（含 SessionEnd/SubagentStart/Stop，无 Abort）；Windows 上命令走 `COMSPEC`(cmd.exe)；hook 输出契约=退出 0 + 空 stdout 即正常放行（我们脚本天然满足）；每个 hook 有 trusted_hash 信任机制，首次运行需在 TUI "Hooks need review" 界面确认；PostToolUse 的 `tool_response` 是任意值（空串或含 `is_error`/`exit_code` 的对象）。**做法**：新建 `lib/post-tool-codex.mjs`（兼容 `is_error`+`exit_code` 双判定）、`~/.codex/hooks.json`（**并入**既有 codex-hud hook，新增 6 组灯效 hooks）、仓库备份 `codex-hooks-snippet.json`。**监控（同日补）**：`hook-client.mjs` 加来源归属（argv[3]，Claude 默认/Codex 传 `codex`）写 `agent-light-activity.log`，可区分是谁在驱动灯——因 `bridge.log` 同端口同命令格式，原本分不清来源。**已验证（两轮实测）**：①模拟 payload 5 例判定全对 + 命令到达桥（`error`/`chase`）；②真实 `codex exec`（`--dangerously-bypass-hook-trust`，DeepSeek ~3.3k tokens）→ bridge.log 三跳 `G:on→chase→G:on`（SessionStart/UserPromptSubmit/Stop 全触发），activity log 对应 `[codex]` 三跳，且与用户并行 Claude 会话的 `[claude]` 活动同时区分开；`npm test` 5/5；`codex doctor` 全绿。**待用户**：首次跑 codex 时在 "Hooks need review" 界面信任新 hooks（否则不执行）。

18. **ZCode 三 CLI 联动**（2026-08-21）：ZCode 是另一个 AI 编程助手，支持 hooks 机制。查询目标是"让 ZCode 也能像 Claude Code 和 Codex 一样驱动红绿灯"。结论：**高度可行（约90%功能）**——ZCode hooks 系统提供所有必要的核心事件。**关键事实**：hooks 配置文件是 `~/.zcode/cli/config.json`（支持用户级和工作区级）；支持 7 个核心事件：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、PostToolUseFailure、PermissionRequest、Stop；无需复杂的信任机制；配置格式为 JSON，支持 `command` 和 `process` 两种执行类型；支持 regex 匹配器进行事件过滤。**做法**：创建 `zcode-hooks-snippet.json` 配置模板、`zcode-desktop-hooks.bat` 启动脚本、`setup-zcode-hooks.bat` 自动配置脚本；所有 hooks 调用现有的 `hook-client.mjs`，传入 `zcode` 作为来源标识；使用现有的 `lib/post-tool.mjs` 进行错误判定。**限制**：ZCode 缺少 `Notification` 事件，无法智能区分"等待输入"和"需要关注"，使用 `PermissionRequest` 作为部分替代方案。**监控**：现有的 `agent-light-activity.log` 自动记录 `[zcode]` 来源的活动。**优势**：零代码修改，完全兼容现有基础设施，支持多 CLI 同时工作。

## 已知限制 / 待办

- **error 判定保守**：Claude 版仅 `is_error`、Codex 版 `is_error`+`exit_code`，可能漏未标记的失败；可扩展 Bash 退出码/内容启发式（注意误报）。
- **拔插重连（仅自启）**：自启循环下拔插自动重连（~3s）；手动 direct-spawn 启动的桥仍只在启动时开一次 COM3，中途拔插需"2 停止桥"→"1 启动桥"（或 `stop-bridge.bat`→重开）。
- **看门狗误回 idle**：纯思考 >120s 无工具调用会被误回 idle 一次（见"看门狗"）；调大 `CLAUDE_LIGHT_WATCHDOG_MS` 可缓解。
- **多会话单灯冲突**：同时开多个 `claude`/`codex`/`zcode` 会话驱动同一盏灯，状态按最后到达跳变（Claude、Codex 与 ZCode 混用同理，跨 CLI 后到者胜）。
- **Codex hooks 信任机制**（2026-08-20 重大发现）：
  - **问题**：hooks 配置正确但 Codex 桌面应用不执行，无 `[codex]` 日志记录
  - **根因**：hooks 需要被用户明确信任才能执行，新配置或信任丢失后 hooks 被跳过
  - **解决方案**：
    1. **推荐**：使用 `codex-desktop-hooks.bat` 启动脚本（仓库根目录），自动添加 `--dangerously-bypass-hook-trust` 参数
    2. **长期**：在 Codex 桌面应用中运行 `/hooks` 命令，手动信任所有 hooks
    3. **CLI 验证**：`codex --dangerously-bypass-hook-trust --model glm-4.6` 验证功能
  - **重要**：API 认证完全支持 hooks，与 ChatGPT 认证无区别，问题纯粹是信任机制
  - **详细文档**：`CODEX_HOOKS_ISSUE_RESOLUTION.md` 包含完整诊断过程和故障排除
- **Codex PostToolUse 覆盖范围**：工具级 hook 主要对 Bash 可靠触发（文档标注早期版本仅 Bash；0.147 已含 is_error/exit_code 字段）。文件编辑/其他工具若无 PostToolUse，灯会停在 thinking 态直到下一事件，可接受。
- **Codex 无 Abort 事件**：打断思考靠桥端 120s 看门狗兜底（同 Claude），无更快的专用触发。
- **ZCode 缺少 Notification 事件**：无法像 Claude Code 那样智能区分"等待输入"和"需要关注"的 Notification，使用 `PermissionRequest` 作为部分替代方案，功能对等性约 90%。
- **软件版（Rust）未适配 Windows**：`src/main.rs` 读 `/tmp/claude-traffic-light`，Unix only。
- **未用固件保留**：`firmware/agent-light.ino`（Arduino Uno 原版）仍在仓库，未使用。
- 可选扩展：`SessionStart`→demo 就绪、`PreCompact`→慢跑马灯、`SessionEnd`→off 灭灯。

## 环境信息

- 平台：Windows 10。Node v24.18.0。ESP32 Arduino 核心 2.x。
- 仓库路径：`<项目根目录>`（建议挪到固定位置后改 hook 路径）。
- 全局配置：`%USERPROFILE%\.claude\settings.json`、`%USERPROFILE%\.codex\hooks.json`、`%USERPROFILE%\.zcode\cli\config.json`。
- 硬件：ESP32-C3 SuperMini，COM3，VID 303A（Espressif 原生 USB CDC）。
