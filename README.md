# Agent Light — Desktop Traffic Light for AI Coding Agents

[中文版](README.zh-CN.md)

Turn an ESP32-C3 and a toy traffic light into a real-time status indicator for AI coding
agents (Claude Code / Codex / ZCode). When the agent is thinking, running tools, hitting
errors, or waiting for your confirmation — the light follows, so you don't have to watch
the screen.

| State | Trigger | Light |
|---|---|---|
| Idle | Session start / turn finished | 🟢 Green solid |
| Thinking | You submit a prompt | 🟡🟢🔴 Chase (green → yellow → red cycle) |
| Running tools | Agent invokes a tool | 🟡 Yellow blink (500ms) |
| Tool error | Tool execution failed | 🔴 Red fast blink |
| Needs attention | Permission request / needs your input | 🔴🟡 Red-yellow alternating alarm |

## Architecture

```
Claude Code ─┐
Codex       ─┤→ hooks invoke hook-client.mjs ──TCP 127.0.0.1:8765──→ serial-bridge.mjs
ZCode       ─┘                                                              │ USB serial (auto-detected)
                                                                            ▼
                                                              ESP32-C3 firmware → traffic light
```

- The bridge runs under a **restart loop** (auto-respawn on crash) and a **watchdog**
  (if an active state receives no command for 2 minutes — e.g. you hit Esc, which fires
  no hook — it falls back to idle).
- Multiple CLIs / sessions drive the same light; the last command received wins.
  The activity log tags every command with its source (`[claude]` `[codex]` `[zcode]`).

## Quick Start (on a new PC)

Prerequisite: [Node.js 18+](https://nodejs.org/).

1. Get the project folder (`git clone` or unzip, anywhere on any drive)
2. Plug in a light with the firmware already flashed (ESP32-C3 native USB, no driver
   needed on Win10/11)
3. Double-click **`install.bat`**: installs dependencies → asks which CLIs to hook into
   (merges with existing hooks, idempotent, backs up before writing) → sets up autostart
   → starts the bridge → sends a test command (light turns green = success)
4. Building a new light from parts? Follow the
   [ESP32-C3 firmware flashing guide](docs/FIRMWARE_GUIDE.md)

> **No hardware yet?** Run `node control.mjs` and use the console to test the command
> chain; or poke the firmware directly over serial as described in `firmware/`.

> **ChatGPT Desktop (Codex) note**: hook trust state resets every time the app restarts;
> re-trust them under Settings → Hooks. That's a Desktop mechanism, not a bug here.

## Supported AI CLIs

| | Claude Code | Codex / ChatGPT Desktop | ZCode |
|---|---|---|---|
| Config file | `~/.claude/settings.json` | `~/.codex/hooks.json` + `[hooks]` in `config.toml` | `~/.zcode/cli/config.json` |
| Events | UserPromptSubmit / PreToolUse / PostToolUse / Notification / Stop | adds SessionStart / PermissionRequest | same six as Codex |
| Error detection | `tool_response.is_error` | `is_error` or non-zero `exit_code` | same as Claude |
| Setup tool | `install.bat` | `install.bat` (Desktop needs manual trust) | `install.bat` |
| Manual template | `configs/claude-settings-snippet.json` | `configs/codex-hooks-snippet.json` | `configs/zcode-hooks-snippet.json` |

Replace the `<项目根目录>` placeholder in the templates with your actual project path
(`install.bat` does this automatically).

## Light Commands & Customization

Send commands straight to the bridge for testing (while it listens on 8765):

```sh
npm run light -- idle      # green solid
npm run light -- chase     # chase effect
npm run light -- Y:blink:700
```

**Named states**: `idle` / `thinking` / `running` (aliases: `green` `yellow` `red`
`think` `busy` `execute` `executing`), plus effects `chase` `error` `alarm`.

**Direct commands**: `G:off`, `R:on`, `Y:blink:700` — color G/Y/R, mode on/off/blink,
blink period 50–10000 ms.

**Environment overrides** (honored by both bridge and hook-client):

| Variable | Default | Meaning |
|---|---|---|
| `CLAUDE_LIGHT_HOST` / `CLAUDE_LIGHT_PORT` | 127.0.0.1 / 8765 | Bridge listen address |
| `CLAUDE_LIGHT_SERIAL` / `CLAUDE_LIGHT_BAUD` | auto / 115200 | Serial port & baud (auto prefers Espressif VID 303a) |
| `CLAUDE_LIGHT_WATCHDOG_MS` | 120000 | Watchdog timeout, 0 disables |
| `CLAUDE_LIGHT_IDLE/THINKING/RUNNING` | — | Full command override per state, e.g. `CLAUDE_LIGHT_RUNNING=R:on` |
| `CLAUDE_LIGHT_THINKING_MS/RUNNING_MS` | — | Blink period only |

Bridge CLI flags: `node serial-bridge.mjs --serial COM3 --baud 115200 --listen 8765 --initial idle`.

## Daily Use

- **Console**: `node control.mjs` (or `npm run control`) — start/stop the bridge, test
  light effects, run diagnostics (serial / process / port / log, step by step), manage
  autostart.
- **Stop the bridge**: double-click `stop-bridge.bat` (required before reflashing —
  frees the serial port).
- **Logs**: `bridge.log` (every command the bridge forwarded) and
  `agent-light-activity.log` (hook activity tagged by source CLI).
- **Monitor one CLI**: `scripts/monitor-zcode-activity.bat` /
  `scripts/monitor-codex-desktop-activity.bat`.
- **Diagnose hook firing**: `tools/test-zcode-hooks.mjs` / `tools/test-codex-hooks.mjs`,
  or fire one real Codex turn with `tools/test-hook.bat` (uses API quota).

## Project Layout

```
├── install.bat / install.mjs        # One-click installer (deps + hooks + autostart + self-test)
├── hook-client.mjs                  # Hook entry point: normalize command → TCP → activity log
├── lib/
│   ├── commands.mjs                 # Command parsing/validation/aliases/env overrides (unit-tested)
│   ├── post-tool.mjs / -codex      # PostToolUse error detection per CLI family
│   └── notification.mjs             # Notification hook: "needs you" vs "idle waiting"
├── serial-bridge.mjs                # TCP→serial bridge: auto port detect + watchdog + exit-on-disconnect
├── control.mjs                      # Desktop console (start/stop, effects, diagnostics, autostart)
├── bridge-autostart.bat / start-bridge-hidden.vbs / stop-bridge.bat   # Bridge runtime chain (portable, %~dp0)
├── firmware/
│   ├── esp32c3-agent-light/         # Main firmware: ESP32-C3 + common-anode board (PWM, 6 modes)
│   └── agent-light.ino              # Legacy: classic Arduino wiring (pins 5/6/7, 9600, feature subset)
├── configs/                         # Hook config templates for the three CLIs
├── scripts/                         # Environment ops (launchers / restarters / monitors)
├── tools/                           # Install verification (config checks, hook firing tests)
├── docs/                            # Firmware guide, ZCode setup notes
└── test/                            # node --test unit tests
```

## Firmware

The main firmware is `firmware/esp32c3-agent-light/esp32c3-agent-light.ino` (USB CDC
virtual serial, common-anode inverted PWM, chase/fast-blink/alarm effects, tunable
brightness constants). Flashing steps, wiring table, and Arduino IDE settings are in the
**[firmware flashing guide](docs/FIRMWARE_GUIDE.md)**.

`firmware/agent-light.ino` is a legacy build (classic Arduino boards, common cathode,
9600 baud, no named effects) kept for old hardware — pass `--baud 9600` to the bridge
when using it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Light never lights up / never changes | `node control.mjs` → menu 4 diagnostics; follow the step-by-step hints |
| Bridge won't start, serial errors in log | Serial port busy (Arduino serial monitor / other apps) or hardware unplugged |
| One CLI doesn't trigger the light | Run its `tools/test-*.mjs`; for Codex Desktop check hook trust |
| Want to reflash the firmware | Run `stop-bridge.bat` first to free the serial port, restart after flashing |

## Development

```sh
npm install    # installs serialport
npm test       # command-normalization unit tests
```

## Credits

Hardware design and light effects are inspired by the CursorLight project.

## License

MIT
