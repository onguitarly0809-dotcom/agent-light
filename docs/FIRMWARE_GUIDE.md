# ESP32-C3 固件烧录指南

拿到硬件（或自己买了一盏新灯）后，按本指南把固件烧进 ESP32-C3，之后配合项目根目录的
`install.bat` 完成软件安装，即可让 AI CLI（Claude Code / Codex / ZCode）驱动红绿灯。

---

## 1. 硬件清单

| 物品 | 说明 | 参考价 |
|---|---|---|
| ESP32-C3 SuperMini 开发板 | 带原生 USB（Type-C），免驱 | ¥15-20 |
| 玩具红绿灯挂件 | **公共阳极**灯板（三色灯共用正极） | ¥1-3 |
| 220Ω 电阻 ×3 | 限流，保护 LED 和 GPIO | 分钱级 |
| 杜邦线若干 | 母对母即可 | ¥2 |

> 灯板必须是"公共阳极"接法。若你的灯模块是"公共阴极"（三色共用负极），
> 请改用 `firmware/agent-light.ino`（旧版固件，逻辑未反相），接线见其文件头注释。

## 2. 接线

| ESP32-C3 | 连接到 |
|---|---|
| 3V3 | 灯板 `+`（公共正极） |
| IO4 | 220Ω → 绿灯 |
| IO3 | 220Ω → 黄灯 |
| IO2 | 220Ω → 红灯 |

- 灯板上原电池的负极线**不用接**（电流经 GPIO 回地）。
- 如果烧录后发现某盏灯的颜色对不上（比如 IO2 实际点的是绿灯），
  不用改线，直接改固件顶部的 `RED_PIN / YELLOW_PIN / GREEN_PIN` 常量即可。

## 3. Arduino IDE 设置

1. 安装 [Arduino IDE](https://www.arduino.cc/en/software)（1.8 或 2.x 均可）
2. **File → Preferences → Additional boards manager URLs** 填入：
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **Tools → Board → Boards Manager** 搜索 `esp32`，安装 **esp32 by Espressif Systems**
4. 插上 ESP32-C3，在 **Tools** 里设置：
   - **Board**: `ESP32C3 Dev Module`
   - **USB CDC On Boot**: `Enabled`（关键！否则电脑看不到串口）
   - **Port**: 选新出现的 COM 口

## 4. 烧录

1. 用 Arduino IDE 打开 `firmware/esp32c3-agent-light/esp32c3-agent-light.ino`
2. 点击 **Upload（→）**，等待编译写入完成
3. 烧录成功后灯应**绿灯常亮**（固件默认 idle 状态）

## 5. 验证（可选）

打开 Arduino IDE 串口监视器（波特率随便填，CDC 模式下无实际意义），逐行输入：

```
idle
thinking
running
error
alarm
G:off
```

灯应依次呈现：绿常亮 → 绿黄红跑马灯 → 黄闪 → 红快闪 → 红黄交替 → 全灭。

## 6. 常见问题

- **找不到 COM 口**：换 USB 线（有些线只能充电）；确认 USB CDC On Boot 已 Enable；
  按住板载 BOOT 键再插 USB 进入烧录模式。
- **端口被占用（upload 报错 serial port busy）**：先关掉串口监视器；
  如果电脑上已运行本项目桥进程，先双击 `stop-bridge.bat` 停桥，烧完再启动。
- **灯太亮/太暗**：改固件里的 `RED_MAX / YELLOW_MAX / GREEN_MAX`（0-255）重新烧录。

## 7. 下一步

回到项目根目录，双击 **`install.bat`** 完成软件侧安装（hooks 配置 + 桥 + 开机自启），
详见 [README.md](../README.md) 的「快速安装」一节。
