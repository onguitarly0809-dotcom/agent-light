# Agent Light — AI 编程代理桌面红绿灯

[English](README.md)

用一颗 ESP32-C3 + 玩具红绿灯挂件，实时显示 AI 编程代理（Claude Code / Codex / ZCode）的工作状态。
代理在思考、执行、出错、等你确认时，灯会跟着变——人不用盯屏幕。

| 状态 | 触发时机 | 灯效 |
|---|---|---|
| 空闲 idle | 会话开始 / 回合结束 | 🟢 绿灯常亮 |
| 思考 thinking | 你提交 Prompt | 🟡🟢🔴 跑马灯（绿→黄→红循环渐变） |
| 运行 running | 代理调用工具 | 🟡 黄灯闪（500ms） |
| 出错 error | 工具执行失败 | 🔴 红灯快闪 |
| 需确认 alarm | 权限请求 / 需要你注意 | 🔴🟡 红黄交替警灯 |

## 架构

```
Claude Code ─┐
Codex       ─┤→ hooks 调用 hook-client.mjs ──TCP 127.0.0.1:8765──→ serial-bridge.mjs
ZCode       ─┘                                                              │ USB 串口（自动探测）
                                                                            ▼
                                                              ESP32-C3 固件 → 红绿灯
```

- 桥进程带**重启循环**（崩溃自动拉起）和**看门狗**（Esc 打断等无 hook 场景下，活动态 2 分钟无命令自动回空闲）。
- 多个 CLI / 多个会话同时开时驱动同一盏灯，状态按最后到达的命令跳变；活动日志带 `[claude]` `[codex]` `[zcode]` 来源标记可查。

## 快速安装（新电脑）

前提：装好 [Node.js 18+](https://nodejs.org/)。

1. 拿到项目文件夹（`git clone` 或解压 zip，放哪个盘都行）
2. 插上已刷固件的灯（ESP32-C3 原生 USB，Win10/11 免驱）
3. 双击 **`install.bat`**：自动装依赖 → 选要接入的 CLI 并写入 hooks（与已有配置共存、幂等可重跑、写前备份）→ 配开机自启 → 启动桥 → 发测试命令自检（灯变绿即成功）
4. 想自己买零件做一盏灯？看 [ESP32-C3 固件烧录指南](docs/FIRMWARE_GUIDE.md)

> **没有硬件？** 跑 `node control.mjs` 用控制台测试命令链路；或参考仓库内 `firmware/` 注释直接用 Arduino 调试。

> **ChatGPT Desktop（Codex）注意**：hooks 信任状态每次重启应用后会重置，需在 设置 → 钩子 页面重新信任，这是 Desktop 的机制。

## 支持的 AI CLI

| | Claude Code | Codex / ChatGPT Desktop | ZCode |
|---|---|---|---|
| 接入方式 | `~/.claude/settings.json` | `~/.codex/hooks.json` + `config.toml` 启用 hooks | `~/.zcode/cli/config.json` |
| 事件 | UserPromptSubmit / PreToolUse / PostToolUse / Notification / Stop | 另加 SessionStart / PermissionRequest | 同 Codex 六事件 |
| 出错判定 | `tool_response.is_error` | `is_error` 或非零 `exit_code` | 同 Claude |
| 配置工具 | `install.bat` | `install.bat`（Desktop 需手动信任） | `install.bat` |
| 手动模板 | `configs/claude-settings-snippet.json` | `configs/codex-hooks-snippet.json` | `configs/zcode-hooks-snippet.json` |

模板里的 `<项目根目录>` 占位符需替换为实际路径（`install.bat` 会自动处理）。

## 灯效命令与自定义

直接对桥发命令测试（桥在 8765 监听时）：

```sh
npm run light -- idle      # 绿常亮
npm run light -- chase     # 跑马灯
npm run light -- Y:blink:700
```

**命名状态**：`idle` / `thinking` / `running`（别名 `green` `yellow` `red` `think` `busy` `execute` `executing`），以及特效 `chase` `error` `alarm`。

**直接命令**：`G:off`、`R:on`、`Y:blink:700`——颜色 G/Y/R，模式 on/off/blink，闪烁周期 50–10000ms。

**环境变量覆盖**（桥和 hook-client 都认）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `CLAUDE_LIGHT_HOST` / `CLAUDE_LIGHT_PORT` | 127.0.0.1 / 8765 | 桥监听地址 |
| `CLAUDE_LIGHT_SERIAL` / `CLAUDE_LIGHT_BAUD` | auto / 115200 | 串口与波特率（auto 优先找 Espressif VID 303a） |
| `CLAUDE_LIGHT_WATCHDOG_MS` | 120000 | 看门狗时长，0 关闭 |
| `CLAUDE_LIGHT_IDLE/THINKING/RUNNING` | — | 整条命令覆盖某状态，如 `CLAUDE_LIGHT_RUNNING=R:on` |
| `CLAUDE_LIGHT_THINKING_MS/RUNNING_MS` | — | 只改闪烁周期 |

桥的命令行参数：`node serial-bridge.mjs --serial COM3 --baud 115200 --listen 8765 --initial idle`。

## 日常使用

- **控制台**：`node control.mjs`（或 `npm run control`）——启动/停止桥、灯效测试、状态诊断（串口/进程/端口/日志逐项检查）、开机自启管理。
- **停桥**：双击 `stop-bridge.bat`（重新烧固件前必做，释放串口）。
- **看日志**：`bridge.log`（桥全部命令流）、`agent-light-activity.log`（按来源区分的 hooks 活动，`npm run` 无关）。
- **监控某家 CLI**：`scripts/monitor-zcode-activity.bat` / `scripts/monitor-codex-desktop-activity.bat`。
- **诊断某家 hooks 是否触发**：`tools/test-zcode-hooks.mjs` / `tools/test-codex-hooks.mjs`。

## 目录结构

```
├── install.bat / install.mjs        # 一键安装（依赖 + hooks + 自启 + 自检）
├── hook-client.mjs                  # hooks 统一入口：归一化命令 → TCP → 记活动日志
├── lib/
│   ├── commands.mjs                 # 命令解析/校验/别名/环境变量覆盖（唯一测试覆盖模块）
│   ├── post-tool.mjs / -codex        # PostToolUse 出错判定
│   └── notification.mjs             # Notification hook：区分"需处理"与"空闲等你"
├── serial-bridge.mjs                # TCP→串口桥：自动探测串口 + 看门狗 + 断线退出
├── control.mjs                      # 桌面控制台（启停/灯效测试/诊断/自启）
├── bridge-autostart.bat / start-bridge-hidden.vbs / stop-bridge.bat   # 桥运行链（相对路径，可放任意盘）
├── firmware/
│   ├── esp32c3-agent-light/         # 主力固件：ESP32-C3 + 公共阳极灯板（PWM、六模式）
│   └── agent-light.ino              # 旧版：Arduino 经典接线（引脚 5/6/7、9600、功能子集）
├── configs/                         # 三家 CLI 的 hooks 配置模板
├── scripts/                         # 工具脚本（监控/启动器/上传）
├── tools/                           # hooks 触发诊断工具
├── docs/                            # 固件烧录指南、ZCode 配置说明
└── test/                            # node --test 单元测试
```

## 固件

主力固件是 `firmware/esp32c3-agent-light/esp32c3-agent-light.ino`（USB CDC 虚拟串口、公共阳极反相 PWM、跑马灯/快闪/警灯特效，亮度常量可调）。烧录步骤、接线表、Arduino IDE 设置见 **[固件烧录指南](docs/FIRMWARE_GUIDE.md)**。

`firmware/agent-light.ino` 是旧版（Arduino 经典板、公共阴极、9600 波特率、不支持命名特效），仅供老硬件兼容——用它需给桥传 `--baud 9600`。

## 故障排查

| 症状 | 处理 |
|---|---|
| 灯完全不亮/不变化 | `node control.mjs` → 菜单 4 状态诊断，按提示逐环节排查 |
| 桥起不来，日志报串口错误 | 串口被占用（Arduino 串口监视器/其他程序），或硬件未插好 |
| 某家 CLI 不触发灯 | 对应 `tools/test-*.mjs` 查配置；Codex Desktop 检查 hooks 信任 |
| 想重新烧固件 | 先 `stop-bridge.bat` 释放串口，烧完再启动 |

## 开发

```sh
npm install    # 安装 serialport
npm test       # 命令归一化单元测试
```

## 致谢

硬件方案与灯效设计参考了 CursorLight 项目。

## License

MIT
