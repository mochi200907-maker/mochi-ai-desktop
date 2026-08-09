// ═══════════════════════════════════════════════════════════════════
//  Mochi ESP32-S3 Robot Firmware
//  • Servo on pin 15 with smooth interpolation + micro-sway
//  • Built-in NeoPixel (GPIO 48) — solid / blink / fade effects
//  • Non-blocking exploration state machine (no delay() in loop)
//  • BLE commands override exploration, auto-resume after 3 s
//  • ESP32-S3-safe startup diagnostics and BLE callback handoff
//
//  Required libraries (Arduino Library Manager):
//    - Adafruit NeoPixel
//    - ESP32Servo
// ═══════════════════════════════════════════════════════════════════

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <ESP32Servo.h>
#include <Adafruit_NeoPixel.h>
#include <esp_system.h>

#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// ── Pin definitions ──────────────────────────────────────────────
// Updated pins based on motor control mapping
#define MOTOR_A1   4
#define MOTOR_A2   5
#define MOTOR_B1   6
#define MOTOR_B2   7
#define SERVO_PIN  15   // head servo

// Built-in NeoPixel on ESP32-S3-DevKitC-1 is GPIO 48.
#define NEO_PIN    48
#define NEO_COUNT  1

enum MotorState { M_STOP, M_FORWARD, M_BACKWARD, M_LEFT, M_RIGHT };

Adafruit_NeoPixel neo(NEO_COUNT, NEO_PIN, NEO_GRB + NEO_KHZ800);

// ═══════════════════════════════════════════════════════════════════
//  NEOPIXEL — non-blocking effects
// ═══════════════════════════════════════════════════════════════════
enum LedMode { LED_OFF, LED_SOLID, LED_BLINK, LED_FADE };
LedMode ledMode = LED_OFF;

// Current base color (r,g,b 0-255)
uint8_t ledR = 255, ledG = 255, ledB = 255;

// Blink state machine
uint8_t  blinkStep     = 0;
unsigned long blinkNext = 0;
#define BLINK_ON_MS   140
#define BLINK_OFF_MS  100
#define LOOK_HOLD_MS  20000UL

// Fade state
float    fadeVal       = 0.0f;
float    fadeDir       = 1.0f;
unsigned long fadeNext = 0;
#define FADE_STEP_MS  12          // update every 12 ms
#define FADE_SPEED    0.028f      // brightness delta per tick (0-1 range)

void neoSet(uint8_t r, uint8_t g, uint8_t b) {
  neo.setPixelColor(0, neo.Color(r, g, b));
  neo.show();
}

void neoOff() { neoSet(0, 0, 0); }

void bootMark(const char *message) {
  Serial.println(message);
  Serial.flush();
  delay(2);
  yield();
}

void ledStartSolid(uint8_t r, uint8_t g, uint8_t b) {
  ledR = r; ledG = g; ledB = b;
  ledMode = LED_SOLID;
  neoSet(r, g, b);
}

void ledStartBlink(uint8_t r, uint8_t g, uint8_t b) {
  ledR = r; ledG = g; ledB = b;
  ledMode    = LED_BLINK;
  blinkStep  = 0;
  blinkNext  = millis();
}

void ledStartFade(uint8_t r, uint8_t g, uint8_t b) {
  ledR = r; ledG = g; ledB = b;
  ledMode  = LED_FADE;
  fadeVal  = 0.0f;
  fadeDir  = 1.0f;
  fadeNext = millis();
}

bool parseColor(const String &cmd) {
  if      (cmd == "LED_WHITE"  || cmd == "LED_ON") { ledR=255; ledG=255; ledB=255; }
  else if (cmd == "LED_RED"   )                    { ledR=255; ledG=  0; ledB=  0; }
  else if (cmd == "LED_GREEN" )                    { ledR=  0; ledG=200; ledB=  0; }
  else if (cmd == "LED_BLUE"  )                    { ledR=  0; ledG= 80; ledB=255; }
  else if (cmd == "LED_CYAN"  )                    { ledR=  0; ledG=220; ledB=220; }
  else if (cmd == "LED_PURPLE")                    { ledR=160; ledG=  0; ledB=255; }
  else if (cmd == "LED_ORANGE")                    { ledR=255; ledG= 80; ledB=  0; }
  else if (cmd == "LED_YELLOW")                    { ledR=255; ledG=200; ledB=  0; }
  else if (cmd == "LED_PINK"  )                    { ledR=255; ledG= 40; ledB=120; }
  else return false;
  return true;
}

void updateLed() {
  unsigned long now = millis();

  if (ledMode == LED_BLINK) {
    if (now < blinkNext) return;
    switch (blinkStep) {
      case 0: neoSet(ledR, ledG, ledB); blinkNext = now + BLINK_ON_MS;  blinkStep++; break;
      case 1: neoOff();                 blinkNext = now + BLINK_OFF_MS; blinkStep++; break;
      case 2: neoSet(ledR, ledG, ledB); blinkNext = now + BLINK_ON_MS;  blinkStep++; break;
      case 3: neoOff();
              ledMode = LED_OFF;
              break;
    }

  } else if (ledMode == LED_FADE) {
    if (now < fadeNext) return;
    fadeNext = now + FADE_STEP_MS;
    fadeVal += fadeDir * FADE_SPEED;
    if (fadeVal >= 1.0f) { fadeVal = 1.0f; fadeDir = -1.0f; }
    if (fadeVal <= 0.0f) { fadeVal = 0.0f; fadeDir =  1.0f; }
    neoSet((uint8_t)(ledR * fadeVal),
           (uint8_t)(ledG * fadeVal),
           (uint8_t)(ledB * fadeVal));
  }
}

bool handleLedCommand(const String &cmd) {
  if (cmd == "LED_OFF") {
    ledMode = LED_OFF;
    neoOff();
    return true;
  }
  if (cmd == "LED_BLINK") {
    ledStartBlink(ledR, ledG, ledB);
    return true;
  }
  if (cmd == "LED_FADE") {
    ledStartFade(ledR, ledG, ledB);
    return true;
  }
  if (parseColor(cmd)) {
    ledStartSolid(ledR, ledG, ledB);
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
//  SERVO — smooth interpolation + micro-sway
// ═══════════════════════════════════════════════════════════════════
Servo headServo;

float  servoAngle  = 90.0f;
float  servoTarget = 90.0f;
float  servoSpeed  = 1.2f;
unsigned long lookHoldEnd = 0;

bool lookHoldActive() {
  return lookHoldEnd != 0 && millis() < lookHoldEnd;
}

void setHeadTarget(int angle, float speed = 1.2f) {
  servoTarget = constrain(angle, 45, 135);
  servoSpeed  = constrain(speed, 0.3f, 3.0f);
}

void updateServo() {
  float diff = servoTarget - servoAngle;
  if (fabsf(diff) < 0.4f) {
    servoAngle = servoTarget;
  } else {
    float t    = fabsf(diff) / 45.0f;
    float ease = 0.35f + 0.65f * min(1.0f, t);
    float step = servoSpeed * ease;
    servoAngle += (diff > 0) ? step : -step;
  }
  float sway   = lookHoldActive() ? 0.0f : 1.8f * sinf(millis() * 0.00157f);
  int writeVal = (int)constrain(servoAngle + sway, 45.0f, 135.0f);
  headServo.write(writeVal);
}

// ═══════════════════════════════════════════════════════════════════
//  MOTORS — non-blocking (Inverted direction logic fixed)
// ═══════════════════════════════════════════════════════════════════
MotorState  motorState = M_STOP;
unsigned long motorEnd = 0;
bool aiRoamMode = false;
unsigned long lastAiCommandAt = 0;
#define AI_COMMAND_TIMEOUT_MS 1800UL

void rawStop() {
  digitalWrite(MOTOR_A1, LOW); digitalWrite(MOTOR_A2, LOW);
  digitalWrite(MOTOR_B1, LOW); digitalWrite(MOTOR_B2, LOW);
}

void drive(MotorState s, int ms) {
  motorState = s;
  motorEnd   = millis() + ms;
  switch (s) {
    case M_FORWARD:  digitalWrite(MOTOR_A1, HIGH); digitalWrite(MOTOR_A2, LOW);
                     digitalWrite(MOTOR_B1, HIGH); digitalWrite(MOTOR_B2, LOW);  break;
    case M_BACKWARD: digitalWrite(MOTOR_A1, LOW);  digitalWrite(MOTOR_A2, HIGH);
                     digitalWrite(MOTOR_B1, LOW);  digitalWrite(MOTOR_B2, HIGH); break;
    case M_LEFT:     digitalWrite(MOTOR_A1, LOW);  digitalWrite(MOTOR_A2, HIGH);
                     digitalWrite(MOTOR_B1, HIGH); digitalWrite(MOTOR_B2, LOW);  break;
    case M_RIGHT:    digitalWrite(MOTOR_A1, HIGH); digitalWrite(MOTOR_A2, LOW);
                     digitalWrite(MOTOR_B1, LOW);  digitalWrite(MOTOR_B2, HIGH); break;
    default: rawStop(); break;
  }
}

void updateMotors() {
  if (motorState != M_STOP && millis() >= motorEnd) {
    rawStop();
    motorState = M_STOP;
  }
  // If the browser/AI disappears, never keep driving indefinitely.
  if (aiRoamMode && lastAiCommandAt != 0 &&
      millis() - lastAiCommandAt > AI_COMMAND_TIMEOUT_MS) {
    rawStop();
    motorState = M_STOP;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  EXPLORATION STATE MACHINE
// ═══════════════════════════════════════════════════════════════════
enum ExplorePhase { EX_IDLE, EX_LOOK, EX_MOVE, EX_SETTLE };
ExplorePhase   exPhase        = EX_IDLE;
unsigned long  exPhaseEnd     = 0;
unsigned long  bleOverrideEnd = 0;

bool bleActive() { return millis() < bleOverrideEnd; }

void holdHeadLook(int angle, float speed) {
  setHeadTarget(angle, speed);
  rawStop();
  motorState = M_STOP;
  motorEnd = 0;
  exPhase = EX_LOOK;
  lookHoldEnd = millis() + LOOK_HOLD_MS;
  exPhaseEnd = lookHoldEnd;
  Serial.print("[LOOK] holding head at ");
  Serial.print(angle);
  Serial.println(" degrees for 20 seconds");
}

void cancelLookHold() {
  if (lookHoldEnd != 0) {
    lookHoldEnd = 0;
    Serial.println("[LOOK] hold cancelled by movement command");
  }
}

void nextExploreBehavior() {
  unsigned long now = millis();
  int r = random(0, 100);

  if (r < 25) {
    exPhase = EX_IDLE;
    setHeadTarget(90 + random(-28, 29), 0.4f + random(0, 60) / 100.0f);
    exPhaseEnd = now + random(2500, 6000);

  } else if (r < 45) {
    int target = (random(0, 2) == 0) ? random(50, 75) : random(105, 130);
    holdHeadLook(target, 0.8f);

  } else if (r < 55) {
    holdHeadLook(random(55, 75), 1.0f);

  } else if (r < 70) {
    exPhase = EX_MOVE;
    setHeadTarget(90, 1.5f);
    int dur = random(400, 1000);
    drive(M_FORWARD, dur);
    exPhaseEnd = now + dur + 600;

  } else if (r < 78) {
    exPhase = EX_MOVE;
    setHeadTarget(90, 1.2f);
    int dur = random(250, 550);
    drive(M_BACKWARD, dur);
    exPhaseEnd = now + dur + 500;

  } else if (r < 88) {
    exPhase = EX_MOVE;
    bool goLeft = random(0, 2);
    setHeadTarget(goLeft ? 65 : 115, 1.8f);
    int dur = random(200, 600);
    drive(goLeft ? M_LEFT : M_RIGHT, dur);
    exPhaseEnd = now + dur + 700;

  } else if (r < 95) {
    exPhase = EX_SETTLE;
    setHeadTarget(random(70, 110), 0.6f);
    exPhaseEnd = now + random(1800, 4500);

  } else {
    exPhase = EX_IDLE;
    setHeadTarget(90, 0.35f);
    exPhaseEnd = now + random(5000, 9000);
  }
}

void updateExploration() {
  if (aiRoamMode) return;
  if (bleActive()) return;
  if (lookHoldActive()) return;
  if (lookHoldEnd != 0) {
    lookHoldEnd = 0;
    exPhaseEnd = millis();
    Serial.println("[LOOK] 20-second hold finished; resuming exploration");
  }
  if (millis() < exPhaseEnd) return;
  nextExploreBehavior();
}

// ═══════════════════════════════════════════════════════════════════
//  BLE CALLBACKS
// ═══════════════════════════════════════════════════════════════════
#define COMMAND_QUEUE_SIZE 8
char commandQueue[COMMAND_QUEUE_SIZE][64] = {};
volatile uint8_t commandHead = 0;
volatile uint8_t commandTail = 0;
portMUX_TYPE commandMux = portMUX_INITIALIZER_UNLOCKED;

class CommandCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pChar) {
    String value = pChar->getValue().c_str();
    if (value.length() == 0) return;

    size_t copyLength = value.length();
    if (copyLength >= sizeof(commandQueue[0])) {
      copyLength = sizeof(commandQueue[0]) - 1;
    }
    portENTER_CRITICAL(&commandMux);
    uint8_t nextHead = (commandHead + 1) % COMMAND_QUEUE_SIZE;
    if (nextHead != commandTail) {
      memcpy(commandQueue[commandHead], value.c_str(), copyLength);
      commandQueue[commandHead][copyLength] = '\0';
      commandHead = nextHead;
    }
    portEXIT_CRITICAL(&commandMux);
  }
};

String normalizeCommand(String value) {
  value.trim();
  value.toUpperCase();

  if (value.startsWith("LED:") || value.startsWith("LED=")) {
    value = value.substring(4);
    value.trim();
    if (!value.startsWith("LED_")) value = "LED_" + value;
  } else if (value.startsWith("COLOR:") || value.startsWith("COLOR=")) {
    value = "LED_" + value.substring(6);
    value.trim();
  }
  return value;
}

void applyLedCommandWithLog(const String &value, const char *source) {
  if (handleLedCommand(value)) {
    Serial.print("[LED] ");
    Serial.print(source);
    Serial.print(" applied: ");
    Serial.println(value);
  } else {
    Serial.print("[LED] ");
    Serial.print(source);
    Serial.print(" unknown: ");
    Serial.println(value);
  }
}

void processSerialLedTest() {
  if (!Serial.available()) return;

  String value = normalizeCommand(Serial.readStringUntil('\n'));
  if (!value.startsWith("LED_")) return;
  applyLedCommandWithLog(value, "serial");
}

void processPendingCommand() {
  char commandBuffer[sizeof(commandQueue[0])];

  portENTER_CRITICAL(&commandMux);
  if (commandTail == commandHead) {
    portEXIT_CRITICAL(&commandMux);
    return;
  }
  memcpy(commandBuffer, commandQueue[commandTail], sizeof(commandBuffer));
  commandQueue[commandTail][0] = '\0';
  commandTail = (commandTail + 1) % COMMAND_QUEUE_SIZE;
  portEXIT_CRITICAL(&commandMux);

  String rawValue = commandBuffer;
  String value = normalizeCommand(rawValue);
  Serial.print("[BLE] CMD raw: "); Serial.println(rawValue);
  Serial.print("[BLE] CMD normalized: "); Serial.println(value);
  // Commands may be "FORWARD:100:600" (direction:speed:duration).
  // The current motor driver is full-power digital; speed is accepted for
  // protocol compatibility while duration is enforced for short AI steps.
  int firstSep = value.indexOf(':');
  String baseCommand = firstSep >= 0 ? value.substring(0, firstSep) : value;
  int secondSep = firstSep >= 0 ? value.indexOf(':', firstSep + 1) : -1;
  int requestedDuration = secondSep >= 0 ? value.substring(secondSep + 1).toInt() : 0;
  requestedDuration = constrain(requestedDuration, 0, 1500);
  value = baseCommand;
  bleOverrideEnd = millis() + 3000;

  if (value == "ROAM_ON") {
    aiRoamMode = true;
    lastAiCommandAt = millis();
    rawStop();
    motorState = M_STOP;
    motorEnd = 0;
    cancelLookHold();
    Serial.println("[ROAM] AI control enabled");
    return;
  }
  if (value == "ROAM_OFF") {
    aiRoamMode = false;
    lastAiCommandAt = 0;
    rawStop();
    motorState = M_STOP;
    motorEnd = 0;
    Serial.println("[ROAM] AI control disabled");
    return;
  }
  if (value == "STOP") {
    lastAiCommandAt = aiRoamMode ? millis() : 0;
    rawStop();
    motorState = M_STOP;
    motorEnd = 0;
    Serial.println("[BLE] STOP");
    return;
  }

  // ── Movement commands ──
  if      (value == "FORWARD") {
    cancelLookHold();
    lastAiCommandAt = aiRoamMode ? millis() : lastAiCommandAt;
    drive(M_FORWARD, requestedDuration > 0 ? requestedDuration : 800);
  }
  else if (value == "BACKWARD") {
    cancelLookHold();
    lastAiCommandAt = aiRoamMode ? millis() : lastAiCommandAt;
    drive(M_BACKWARD, requestedDuration > 0 ? requestedDuration : 800);
  }
  else if (value == "LEFT") {
    cancelLookHold();
    lastAiCommandAt = aiRoamMode ? millis() : lastAiCommandAt;
    drive(M_LEFT, requestedDuration > 0 ? requestedDuration : 400);
  }
  else if (value == "RIGHT") {
    cancelLookHold();
    lastAiCommandAt = aiRoamMode ? millis() : lastAiCommandAt;
    drive(M_RIGHT, requestedDuration > 0 ? requestedDuration : 400);
  }
  else if (value == "LOOK_UP")     holdHeadLook(120, 1.0f);
  else if (value == "LOOK_DOWN")   holdHeadLook(60,  1.0f);
  else if (value == "LOOK_CENTER") holdHeadLook(90,  0.9f);
  // ── LED commands ──
  else if (value.startsWith("LED_")) {
    applyLedCommandWithLog(value, "BLE");
  }
  else {
    Serial.print("[BLE] unknown command: ");
    Serial.println(value);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(250);
  Serial.println();
  bootMark("[BOOT] Mochi ESP32-S3 firmware starting");

  esp_reset_reason_t resetReason = esp_reset_reason();
  Serial.print("[BOOT] reset reason: ");
  switch (resetReason) {
    case ESP_RST_POWERON:  Serial.println("POWERON");  break;
    case ESP_RST_SW:       Serial.println("SOFTWARE"); break;
    case ESP_RST_PANIC:    Serial.println("PANIC");    break;
    case ESP_RST_INT_WDT:  Serial.println("INT_WDT");  break;
    case ESP_RST_TASK_WDT: Serial.println("TASK_WDT"); break;
    case ESP_RST_WDT:      Serial.println("WDT");      break;
    case ESP_RST_BROWNOUT: Serial.println("BROWNOUT"); break;
    default:               Serial.println("OTHER");    break;
  }
  Serial.flush();
  delay(2);
  yield();

  // Motors
  bootMark("[BOOT] motors");
  bootMark("[BOOT] motor A1 init");
  pinMode(MOTOR_A1, OUTPUT);
  digitalWrite(MOTOR_A1, LOW);
  delay(5);
  yield();

  bootMark("[BOOT] motor A2 init");
  pinMode(MOTOR_A2, OUTPUT);
  digitalWrite(MOTOR_A2, LOW);
  delay(5);
  yield();

  bootMark("[BOOT] motor B1 init");
  pinMode(MOTOR_B1, OUTPUT);
  digitalWrite(MOTOR_B1, LOW);
  delay(5);
  yield();

  bootMark("[BOOT] motor B2 init");
  pinMode(MOTOR_B2, OUTPUT);
  digitalWrite(MOTOR_B2, LOW);
  delay(5);
  yield();
  bootMark("[BOOT] motors done");

  // Servo
  bootMark("[BOOT] servo");
  headServo.setPeriodHertz(50);
  headServo.attach(SERVO_PIN, 500, 2500);
  headServo.write(90);
  delay(1);

  // NeoPixel
  bootMark("[BOOT] neopixel");
  Serial.print("[BOOT] neopixel GPIO: ");
  Serial.println(NEO_PIN);
  Serial.flush();
  neo.begin();
  neo.setBrightness(180);
  neoOff();

  ledStartBlink(0, 220, 220);

  randomSeed((uint32_t)esp_random());

  // BLE
  bootMark("[BOOT] BLE init");
  BLEDevice::init("MOCHI_ESP32_ROBOT");
  delay(10);
  BLEServer        *pServer = BLEDevice::createServer();
  delay(1);
  BLEService       *pSvc    = pServer->createService(SERVICE_UUID);
  BLECharacteristic *pChar  = pSvc->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  pChar->setCallbacks(new CommandCallback());
  pSvc->start();
  delay(1);

  BLEAdvertising *pAdvert = BLEDevice::getAdvertising();
  pAdvert->addServiceUUID(SERVICE_UUID);
  pAdvert->start();
  delay(10);

  Serial.println("Mochi ESP32-S3 ready!");
  exPhaseEnd = 0;
}

// ═══════════════════════════════════════════════════════════════════
//  LOOP  — runs every 10 ms, never blocks
// ═══════════════════════════════════════════════════════════════════
void loop() {
  processPendingCommand();
  processSerialLedTest();
  updateServo();
  updateMotors();
  updateLed();
  updateExploration();
  delay(10);
}
