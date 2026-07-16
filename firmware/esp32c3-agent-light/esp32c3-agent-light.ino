// =====================================================
// ESP32-C3 SuperMini + 玩具红绿灯挂件（公共正极灯板）
// 串口版 agent-light 固件
//
// 接线（与 cursor_agent_status_light 项目一致）：
//   ESP32 3.3V -> 灯板 + / 原电池正极
//   ESP32 IO2  -> 220Ω -> 红灯（实测）
//   ESP32 IO3  -> 220Ω -> 黄灯
//   ESP32 IO4  -> 220Ω -> 绿灯（实测）
//   灯板 - / 原电池负极：第一版先不接
//
// 公共正极：GPIO LOW = 灯亮，GPIO HIGH = 灯灭（已在 writeLed 中反相）。
// 输出用 LEDC PWM，可做平滑渐变；thinking 复用 cursor 项目的跑马灯效果。
//
// 通信：USB CDC 虚拟串口。Arduino IDE 中需设置：
//   Board: ESP32C3 Dev Module
//   USB CDC On Boot: Enabled
//   这样 Serial 走 USB，电脑会看到一个 COM 口。
//
// 协议（与 agent-light 的 lib/commands.mjs 输出一致，逐行，\n 结尾）：
//   命名状态：idle / thinking / running（含别名 green/yellow/red/busy/think/execute/executing）
//     idle     -> 绿灯常亮
//     thinking -> 跑马灯：绿 -> 黄 -> 红平滑渐变（1050ms 一轮）
//     running  -> 红灯闪烁（默认 250ms）
//     error    -> 红灯快闪（工具出错）
//     alarm    -> 红黄交替警灯（需要确认 / 请求权限）
//   直接命令：
//     G / Y / R            -> 该灯默认态（G=绿灯常亮, Y=黄闪250, R=红闪250）
//     G/Y/R:on             -> 该灯常亮，其余灭
//     G/Y/R:off            -> 全灭
//     G/Y/R:blink:ms       -> 该灯按 ms 闪烁，其余灭（ms 限制 50–10000，越界夹紧）
// =====================================================

// 引脚对应按实测灯位调整。如果某盏灯颜色对不上，
// 只需把对应颜色的 _PIN 改成实际控制它的 IO 即可，无需改线。
const int GREEN_PIN = 4;   // IO4 -> 绿灯（实测）
const int YELLOW_PIN = 3;  // IO3 -> 黄灯
const int RED_PIN = 2;     // IO2 -> 红灯（实测）

const int PWM_FREQ = 5000;
const int PWM_RESOLUTION = 8;

// ESP32 Arduino 核心 2.x 用通道式 LEDC API，3.x 用引脚式 API。
// 下面按版本自适应，两种核心都能编译。
const int RED_CH = 0;      // 2.x 专用：红灯 LEDC 通道
const int YELLOW_CH = 1;   // 2.x 专用：黄灯 LEDC 通道
const int GREEN_CH = 2;    // 2.x 专用：绿灯 LEDC 通道

// 各色最大亮度（黄灯拉满；红绿压到最低；可按实物微调）
const int RED_MAX = 100;
const int YELLOW_MAX = 125;
const int GREEN_MAX = 100;

const unsigned long DEFAULT_BLINK_MS = 250;
const unsigned long MIN_BLINK_MS = 50;
const unsigned long MAX_BLINK_MS = 10000;

// 显示模式
enum Mode {
  MODE_SOLID,     // 单灯常亮：solidPin 满亮，其余灭
  MODE_BLINK,     // 单灯闪烁：blinkPin 按 blinkInterval 0↔满亮
  MODE_CHASE,     // 跑马灯（thinking）
  MODE_ERROR,     // 红灯快闪（出错）
  MODE_ALARM,     // 红黄交替警灯（需要确认 / 请求权限）
  MODE_OFF        // 全灭
};

Mode currentMode = MODE_SOLID;
int solidPin = GREEN_PIN;        // MODE_SOLID 时点亮的引脚
int blinkPin = RED_PIN;          // MODE_BLINK 时闪烁的引脚
unsigned long blinkInterval = DEFAULT_BLINK_MS;
unsigned long modeStart = 0;     // 进入当前模式的时间（用于跑马灯相位）
unsigned long lastToggle = 0;    // 闪烁上次翻转时间
bool blinkOn = true;

String input = "";

void setup() {
  initPwm();

  // USB CDC：波特率无实际意义，保留 115200 兼容串口监视器习惯
  Serial.begin(115200);

  setIdle();
}

// 按核心版本初始化 LEDC：3.x 用 ledcAttach(pin,...)，2.x 用 ledcSetup+ledcAttachPin
void initPwm() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(RED_PIN, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(YELLOW_PIN, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(GREEN_PIN, PWM_FREQ, PWM_RESOLUTION);
#else
  ledcSetup(RED_CH, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(RED_PIN, RED_CH);
  ledcSetup(YELLOW_CH, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(YELLOW_PIN, YELLOW_CH);
  ledcSetup(GREEN_CH, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(GREEN_PIN, GREEN_CH);
#endif
}

void loop() {
  readCommand();
  updateDisplay();
}

// ---------- 公共正极反相 PWM 输出 ----------

// value: 0=灭, 255=最亮（公共正极反相后写进 ledc）
void writeLed(int pin, int value) {
  value = constrain(value, 0, 255);
  int duty = 255 - value;  // 公共正极反相
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(pin, duty);
#else
  int ch = (pin == RED_PIN) ? RED_CH : (pin == YELLOW_PIN) ? YELLOW_CH : GREEN_CH;
  ledcWrite(ch, duty);
#endif
}

void allOff() {
  writeLed(RED_PIN, 0);
  writeLed(YELLOW_PIN, 0);
  writeLed(GREEN_PIN, 0);
}

// 按 (红, 黄, 绿) 亮度设置三盏灯
void setOnly(int red, int yellow, int green) {
  writeLed(RED_PIN, constrain(red, 0, RED_MAX));
  writeLed(YELLOW_PIN, constrain(yellow, 0, YELLOW_MAX));
  writeLed(GREEN_PIN, constrain(green, 0, GREEN_MAX));
}

int maxForPin(int pin) {
  if (pin == RED_PIN) return RED_MAX;
  if (pin == YELLOW_PIN) return YELLOW_MAX;
  return GREEN_MAX;
}

// ---------- 串口读取 ----------

void readCommand() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (input.length() > 0) {
        input.trim();
        handleCommand(input);
        input = "";
      }
    } else {
      input += c;
    }
  }
}

// ---------- 命令处理 ----------

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  String upper = cmd;
  upper.toUpperCase();

  // 裸字母：G / Y / R -> 该灯默认态
  if (upper == "G") { setSolid(GREEN_PIN); return; }
  if (upper == "Y") { setBlink(YELLOW_PIN, DEFAULT_BLINK_MS); return; }
  if (upper == "R") { setBlink(RED_PIN, DEFAULT_BLINK_MS); return; }

  // 命名状态 + 别名
  if (upper == "IDLE" || upper == "GREEN") { setIdle(); return; }
  if (upper == "THINKING" || upper == "THINK" || upper == "YELLOW" || upper == "CHASE") { setChase(); return; }
  if (upper == "RUNNING" || upper == "BUSY" || upper == "EXECUTE" ||
      upper == "EXECUTING" || upper == "RED") {
    setBlink(RED_PIN, DEFAULT_BLINK_MS);
    return;
  }
  if (upper == "ERROR") { setError(); return; }
  if (upper == "ALARM") { setAlarm(); return; }

  // 直接命令：G/Y/R:on|off|blink[:ms]
  int firstColon = cmd.indexOf(':');
  if (firstColon <= 0) return;

  char lightChar = upper.charAt(0);
  int targetPin = pinForChar(lightChar);
  if (targetPin < 0) return;

  int secondColon = cmd.indexOf(':', firstColon + 1);
  String mode = cmd.substring(firstColon + 1, secondColon < 0 ? (unsigned int)cmd.length() : (unsigned int)secondColon);
  mode.toUpperCase();

  unsigned long interval = DEFAULT_BLINK_MS;
  if (secondColon > 0) {
    long parsed = cmd.substring(secondColon + 1).toInt();
    if (parsed < (long)MIN_BLINK_MS) parsed = MIN_BLINK_MS;
    if (parsed > (long)MAX_BLINK_MS) parsed = MAX_BLINK_MS;
    interval = (unsigned long)parsed;
  }

  if (mode == "ON") {
    setSolid(targetPin);
  } else if (mode == "OFF") {
    setOff();
  } else if (mode == "BLINK") {
    setBlink(targetPin, interval);
  }
}

int pinForChar(char light) {
  if (light == 'G') return GREEN_PIN;
  if (light == 'Y') return YELLOW_PIN;
  if (light == 'R') return RED_PIN;
  return -1;
}

// ---------- 模式设置 ----------

void enterMode(Mode m) {
  currentMode = m;
  modeStart = millis();
  lastToggle = millis();
  blinkOn = true;
}

void setIdle() {
  solidPin = GREEN_PIN;
  enterMode(MODE_SOLID);
}

void setChase() {
  enterMode(MODE_CHASE);
}

void setError() {
  enterMode(MODE_ERROR);
}

void setAlarm() {
  enterMode(MODE_ALARM);
}

void setSolid(int pin) {
  solidPin = pin;
  enterMode(MODE_SOLID);
}

void setBlink(int pin, unsigned long interval) {
  blinkPin = pin;
  blinkInterval = interval;
  enterMode(MODE_BLINK);
}

void setOff() {
  enterMode(MODE_OFF);
  allOff();
}

// ---------- 显示更新 ----------

void updateDisplay() {
  switch (currentMode) {
    case MODE_OFF:
      allOff();
      return;
    case MODE_SOLID:
      setOnly(solidPin == RED_PIN ? RED_MAX : 0,
              solidPin == YELLOW_PIN ? YELLOW_MAX : 0,
              solidPin == GREEN_PIN ? GREEN_MAX : 0);
      return;
    case MODE_BLINK: {
      unsigned long now = millis();
      if (now - lastToggle >= blinkInterval) {
        lastToggle = now;
        blinkOn = !blinkOn;
      }
      int v = blinkOn ? maxForPin(blinkPin) : 0;
      setOnly(blinkPin == RED_PIN ? v : 0,
              blinkPin == YELLOW_PIN ? v : 0,
              blinkPin == GREEN_PIN ? v : 0);
      return;
    }
    case MODE_CHASE:
      updateChase();
      return;
    case MODE_ERROR:
      updateError();
      return;
    case MODE_ALARM:
      updateAlarm();
      return;
  }
}

// thinking：顺序跑马灯，绿 -> 黄 -> 红，每色平滑渐亮再渐灭，带轻微交叉衔接。
// 一轮 1050ms，三段各 350ms；每色一个三角波、中心对齐各段中点，半宽略大于半段，
// 相邻波尾自然重叠，交接更连贯、每色余韵更长。调 halfWidth 可控交叉量。
int triBrightness(unsigned long x, unsigned long center, unsigned long halfWidth,
                  unsigned long period, int maxValue) {
  long d = (long)x - (long)center;
  if (d < 0) d = -d;
  long half = (long)(period / 2);
  if (d > half) d = (long)period - d;     // 环形距离
  if (d >= (long)halfWidth) return 0;
  return map((unsigned long)d, 0, halfWidth, maxValue, 0);
}

void updateChase() {
  unsigned long t = millis() - modeStart;
  // period：一轮总长，越大每色呼吸越慢越长。halfWidth：三角波半宽，越大重叠越多；
  // 当 halfWidth > seg 时相邻波大面积交叠，每色峰值附近三灯同亮。
  // 当前为夸张档：period 2100ms（每色 700ms），halfWidth≈875ms > seg，三灯常有大段同亮。
  const unsigned long period = 1500;
  const unsigned long seg = period / 3;            // 500ms 每色
  const unsigned long halfWidth = seg * 6 / 7;     // ≈429ms，交叉偏多，交接绵长但顺序仍可辨

  unsigned long x = t % period;

  int g = triBrightness(x, seg / 2,                 halfWidth, period, GREEN_MAX);
  int y = triBrightness(x, seg + seg / 2,           halfWidth, period, YELLOW_MAX);
  int r = triBrightness(x, 2 * seg + seg / 2,       halfWidth, period, RED_MAX);

  setOnly(r, y, g);
}

// 渐入-保持-渐灭-熄灭 周期亮度（移植自 cursor 项目）
int fadeInOutBrightness(unsigned long t,
                        unsigned long fadeIn,
                        unsigned long hold,
                        unsigned long fadeOut,
                        unsigned long offTime,
                        int maxValue) {
  unsigned long total = fadeIn + hold + fadeOut + offTime;
  unsigned long x = t % total;

  if (x < fadeIn) return map(x, 0, fadeIn, 0, maxValue);
  x -= fadeIn;
  if (x < hold) return maxValue;
  x -= hold;
  if (x < fadeOut) return map(x, 0, fadeOut, maxValue, 0);
  return 0;
}

// error：红灯快闪（渐入180ms-保持80ms-渐灭180ms-灭80ms）
void updateError() {
  unsigned long t = millis() - modeStart;
  int r = fadeInOutBrightness(t, 40, 180, 80, 180, RED_MAX);
  setOnly(r, 0, 0);
}

// alarm：红黄交替警灯，带短渐变（需要确认 / 请求权限）
void updateAlarm() {
  unsigned long t = millis() - modeStart;
  const unsigned long phaseMs = 260;
  int phase = (t / phaseMs) % 2;
  unsigned long inside = t % phaseMs;

  int brightness;
  if (inside < 60) {
    brightness = map(inside, 0, 60, 0, 255);
  } else if (inside < 180) {
    brightness = 255;
  } else {
    brightness = map(inside, 180, phaseMs, 255, 0);
  }

  if (phase == 0) {
    setOnly(brightness, 0, 0);
  } else {
    setOnly(0, min(brightness, YELLOW_MAX), 0);
  }
}
