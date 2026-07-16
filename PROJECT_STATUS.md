# 项目进度总结

> 用途：日后快速了解本项目当前状态、架构、关键决策与历史改动。最后更新：2026-06-30。

## 一句话目标

用 **cursor 项目的硬件**（ESP32-C3 SuperMini + 玩具红绿灯挂件，公共正极灯板）跑 **agent-light 项目的软件**（Claude Code hooks + 命令体系），**USB 串口**通信（弃用原 BLE），Windows 平台，灯效复刻自 cursor。

## 架构

```
Claude Code hooks ──> hook-client.mjs (TCP, fire-and-forget, 250ms 超时)
                  ──> serial-bridge.mjs (长驻 TCP server 127.0.0.1:8765 + serialport 串口)
                  ──USB CDC──> ESP32-C3 固件（解析协议、驱动 LEDC PWM 灯效）
```

- hook-client / 桥之间走 TCP（语言无关、解耦）。
- 桥是**长驻进程**，必须保持运行；不开则 hook-client 静默失败，Claude Code 不受影响。
- hooks 在用户级 `~/.claude/settings.json`（全局），任意 CLI 启动的 `claude` 会话都触发。

## 当前状态映射（已实现 5 态）

| Claude Code 事件 | 命令 | 灯效 | 固件模式 |
|---|---|---|---|
| `UserPromptSubmit` 提交 prompt | `thinking` | 跑马灯 绿→黄→红（1500ms） | MODE_CHASE |
| `PreToolUse` 工具开始 | `running` | 黄灯慢闪（500ms） | MODE_BLINK(黄) |
| `PostToolUse` 工具结束（正常） | `thinking` | 跑马灯 | MODE_CHASE |
| `PostToolUse` 工具结束（出错） | `error` | 红灯快闪（渐入渐灭） | MODE_ERROR |
| `Notification` 需确认/权限 | `alarm`（仅权限/需注意）/ 不发灯（空闲等你） | 红黄交替警灯 | MODE_ALARM |
| `Stop` 回复结束 | `idle` | 绿灯常亮 | MODE_SOLID(绿) |

> 出错判定：`lib/post-tool.mjs` 读 stdin 的 `tool_response.is_error === true` → 发 `error`，否则发 `thinking`。保守低误报，可能漏未标 is_error 的失败。

## 文件清单与职责

| 文件 | 状态 | 职责 |
|---|---|---|
| `hook-client.mjs` | 未改 | TCP 客户端，发一条命令即退出，只用 `node:net`，零依赖 |
| `lib/commands.mjs` | 改 | 命令归一化校验。`DEFAULTS.thinking='chase'`、`running='Y:blink:500'`；`EFFECTS={chase,error,alarm}` 原样透传 |
| `lib/post-tool.mjs` | **新建** | PostToolUse hook：读 stdin 判 is_error，发 error 或 thinking |
| `lib/notification.mjs` | **新建** | Notification hook：读 message 区分"权限/需注意"→alarm 与"空闲等你"→不发灯（保持绿灯）。避免空闲 60s 误触警灯 |
| `serial-bridge.mjs` | **重写** | serialport 包跨平台串口桥；TCP+行缓冲+normalizeCommand 校验+优雅关闭；自动检测 COM 口；开端口延迟 1500ms 发初始命令；**看门狗**（120s 活动态无命令自动回 idle） |
| `bridge-autostart.bat` | **新建** | 后台自启重启循环：node 崩了 3s 重起，设 `CLAUDE_LIGHT_WATCHDOG_MS=120000`。全 ASCII 注释；用 `ping` 计时（`timeout` 在隐藏无控制台环境会失效空转） |
| `start-bridge-hidden.vbs` | **新建** | 隐藏窗口启动上面的 bat。副本已放启动文件夹→开机自启；双击亦可手动启动 |
| `stop-bridge.bat` | 未动 | 一键停止桥（按进程名 node.exe/cmd.exe 过滤，不会自杀）。重烧固件前先跑它释放 COM3。新流程改由 `control.mjs` 内置停止 |
| `control.mjs` | **新建** | 桌面交互控制台：启动/停止桥、灯效测试、状态诊断、开机自启管理。直接 detached 跑 `serial-bridge.mjs`，日志写 `bridge.log` |
| `Agent-Light控制台.bat`（桌面） | **新建** | 双击拉起 `control.mjs`；`chcp 65001` 防中文乱码 |
| `bridge.log` | 自动生成 | 桥的 stdout/stderr，诊断页读取。每次启动覆盖 |
| `firmware/esp32c3-agent-light/esp32c3-agent-light.ino` | **新建** | ESP32-C3 固件（见下） |
| `firmware/agent-light.ino` | 未动 | 原版 Arduino Uno 固件，保留未用 |
| `claude-settings-snippet.json` | 改 | hooks 配置片段，路径已更新 |
| `~/.claude/settings.json` | 改 | 全局 hooks 已合并（PostToolUse→post-tool，Notification→notification.mjs 智能区分，PreToolUse→running，Stop→idle） |
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
```

烧录：Arduino IDE 打开 `firmware/esp32c3-agent-light/esp32c3-agent-light.ino`，Board=ESP32C3 Dev Module，USB CDC On Boot=Enabled，上传。实测端口 COM3。

## 桌面控制台（当前推荐用法）

**开机自启已关闭**（启动文件夹的 VBS 已删）。改为手动工作流：开机 → 插 ESP32 → 等就绪 → 双击桌面 `Agent-Light控制台.bat`。

桌面 `Agent-Light控制台.bat`（`chcp 65001` + `cd` 仓库 + `node control.mjs`）拉起 `control.mjs` 交互菜单：

- **1 启动桥**：`spawn` detached + `windowsHide` 直接跑 `node serial-bridge.mjs`，stdout/stderr 重定向到 `bridge.log`（每次启动覆盖）；设 `CLAUDE_LIGHT_WATCHDOG_MS=120000`。spawn 后等 2.5s 查端口 8765 + 读日志判断成败。**不走 `bridge-autostart.bat` 重启循环**（用户选择手动重启）。
- **2 停止桥**：powershell 杀 `node.exe + *serial-bridge.mjs*`。
- **3 灯效测试**：idle/thinking/running/error/alarm/`G:off`(灭灯)/自定义命令，经 `normalizeCommand` 校验后 net 发到 8765。
- **4 状态诊断**：串口列表（标 ESP32 VID 303a）+ 桥进程 + 端口 8765 + 发测试命令 + `bridge.log` 末尾，给 ✔/✖ 结论和修复建议。**出问题时先用这个。**
- **5 开机自启管理**：查看/关闭/重建启动文件夹 VBS（默认已关）。

复用：`lib/commands.mjs` `normalizeCommand`、`hook-client.mjs` 的 net 发送模式、`serialport` `SerialPort.list()`、`stop-bridge.bat` 的 powershell 杀进程逻辑。`bridge-autostart.bat` / `start-bridge-hidden.vbs` / `stop-bridge.bat` 保留但新流程不再依赖。

> `bridge.log` 让启动失败（如 COM3 未就绪）不再静默——这正是改用手动启动的初衷：诊断页能直接看到 `Cannot open COM3`。

## 看门狗（Esc 打断恢复）

Esc 打断思考时**没有可靠 hook 触发**（Stop 不保证触发，无专用打断 hook），灯会卡在 chase。桥端加看门狗解决：

- 活动态（`chase` 思考 / `Y:blink:500` 运行 / `error`）收到后启动倒计时，每次新命令重置。运行令牌由 `RUNNING_COMMAND = normalizeCommand('running')` 动态取得，改 `DEFAULTS.running` 后看门狗分类自动跟随，不会悄悄失效。
- **120s 没再收到任何命令** → 判定被打断，自动发 `idle`（绿灯）。日志打印 `watchdog: no activity ... returning to idle`。
- `alarm`（Notification 的权限/需注意）归为粘住态：**disarm 看门狗且不回退**，必须等下一个 hook 清除（设计上不掩盖"需处理"信号）。注意：`lib/notification.mjs` 会过滤掉"空闲等你"类 Notification（不发灯），所以 alarm 只在真正需处理时亮，不会因 60s 空闲误触。
- 手动直接命令（`R:on` 等）也 disarm，不回退，保持原样。
- 超时 env：`CLAUDE_LIGHT_WATCHDOG_MS`（默认 120000；设 `0` 关闭）。权衡：太短→长纯思考（>120s 无工具调用）会被误回 idle；太长→打断后回 idle 慢。120s 是折中。

> 已知副作用：纯思考超 120s 会在中途被误回 idle 一次，直到首个 `PreToolUse` 触发恢复。频繁工具调用的会话几乎不受影响。

## 后台自启（Windows）— 已弃用

> **当前已关闭开机自启**，改用桌面控制台手动启动（见上"桌面控制台"）。以下保留作历史记录；`bridge-autostart.bat` / `start-bridge-hidden.vbs` 文件仍在仓库但新流程不再使用。

桥做成开机自启 + 崩溃自重启，无需每次手动 `npm run bridge`：

- `start-bridge-hidden.vbs`（隐藏窗口）→ `bridge-autostart.bat`（重启循环 + 120s 看门狗 env）→ `node serial-bridge.mjs`。
- VBS 副本已放入启动文件夹（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\agent-light-bridge.vbs`），登录自动后台拉起。
- 手动启动：双击 `start-bridge-hidden.vbs`。停止：双击 `stop-bridge.bat`（重烧固件前必跑，释放 COM3）。
- 关自启：`Win+R` → `shell:startup` → 删 `agent-light-bridge.vbs`。
- **固有限制**：桥只在启动时开一次 COM3，**中途拔插 ESP32 不会自动重连**，需 stop→重新 start。开机时插着则无影响。
- 踩坑：bat 中文注释 UTF-8 被 cmd 按 GBK 读成乱码命令 → 改全 ASCII；`timeout /t` 在隐藏无控制台环境失效（"Input redirection not supported"立即返回）→ 改 `ping -n 4`。

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

## 已知限制 / 待办

- **error 判定保守**：仅 `is_error`，可能漏未标记的失败；可扩展 Bash 退出码/内容启发式（注意误报）。
- **拔插不重连**：桥只在启动时开一次 COM3，中途拔插 ESP32 需用控制台"2 停止桥"→"1 启动桥"（或 `stop-bridge.bat`→重开）重连。
- **看门狗误回 idle**：纯思考 >120s 无工具调用会被误回 idle 一次（见"看门狗"）；调大 `CLAUDE_LIGHT_WATCHDOG_MS` 可缓解。
- **多会话单灯冲突**：同时开多个 `claude` 会话驱动同一盏灯，状态按最后到达跳变。
- **软件版（Rust）未适配 Windows**：`src/main.rs` 读 `/tmp/claude-traffic-light`，Unix only。
- **未用固件保留**：`firmware/agent-light.ino`（Arduino Uno 原版）仍在仓库，未使用。
- 可选扩展：`SessionStart`→demo 就绪、`PreCompact`→慢跑马灯、`SessionEnd`→off 灭灯。

## 环境信息

- 平台：Windows 10。Node v24.18.0。ESP32 Arduino 核心 2.x。
- 仓库路径：`C:\Users\USER\Downloads\agent-light-main`（建议挪到固定位置后改 hook 路径）。
- 全局配置：`C:\Users\USER\.claude\settings.json`。
- 硬件：ESP32-C3 SuperMini，COM3，VID 303A（Espressif 原生 USB CDC）。
