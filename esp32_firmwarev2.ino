// ═══════════════════════════════════════════════════════════════════════
//  LOOI ESP32-S3 N16R8 — Firmware v2 (FIX: connectSecure + SSL debug)
// ═══════════════════════════════════════════════════════════════════════
//
//  REQUIRED LIBRARIES (Arduino Library Manager):
//    - ArduinoWebsockets by gilmaimon
//    - ArduinoJson 6.x or 7.x
//    - ESP32Servo
//    - Adafruit NeoPixel
//
//  IMPORTANT: Uninstall "WebSockets" by Markus Sattler first.
//  Install "ArduinoWebsockets" by gilmaimon instead.
// ═══════════════════════════════════════════════════════════════════════

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Adafruit_NeoPixel.h>
#include <driver/i2s.h>

using namespace websockets;

// ── Captive portal configuration ──────────────────────────────────────
#define LOOI_SETUP_AP_NAME      "LOOI-SETUP"

const IPAddress AP_IP(172, 217, 28, 1);
const IPAddress AP_GATEWAY(172, 217, 28, 1);
const IPAddress AP_SUBNET(255, 255, 255, 0);

// ── Hardware pins ──────────────────────────────────────────────────────
#define MOTOR_A1       4
#define MOTOR_A2       5
#define MOTOR_B1       6
#define MOTOR_B2       7
#define SERVO_PIN      15
#define NEO_PIN        48
#define NEO_COUNT      1

#define MIC_I2S_PORT   I2S_NUM_0
#define MIC_BCLK_PIN   17
#define MIC_WS_PIN     18
#define MIC_SD_PIN     8

#define DAC_I2S_PORT   I2S_NUM_1
#define DAC_BCLK_PIN   9
#define DAC_WS_PIN     10
#define DAC_DIN_PIN    11

#define GEMINI_INPUT_RATE   16000
#define GEMINI_OUTPUT_RATE  24000
#define MIC_FRAMES_PER_CHUNK 320
#define SPEAKER_CHUNK_SAMPLES 512
#define GEMINI_KEY_SLOTS 10

static const char *GEMINI_HOST = "generativelanguage.googleapis.com";
static const uint16_t GEMINI_PORT = 443;
static const char *GEMINI_PATH =
  "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

WebsocketsClient geminiWs;
Servo headServo;
Adafruit_NeoPixel neo(NEO_COUNT, NEO_PIN, NEO_GRB + NEO_KHZ800);

bool wifiReady = false;
bool geminiReady = false;
bool portalActive = false;
unsigned long lastWifiAttempt = 0;
unsigned long lastGeminiAttempt = 0;
unsigned long lastAudioSentAt = 0;
unsigned long lastSpeakerAudioAt = 0;
unsigned long lastGeminiReconnect = 0;

WebServer portalServer(80);
DNSServer portalDns;
Preferences configStore;
String configuredWifiSsid;
String configuredWifiPassword;
String configuredGeminiKeys[GEMINI_KEY_SLOTS];
uint8_t configuredGeminiKeyCount = 0;
uint8_t activeGeminiKeyIndex = 0;
uint8_t geminiKeysTriedThisCycle = 0;
volatile bool keyRotationRequested = false;

// ── Robot controls ────────────────────────────────────────────────────
enum MotorState { M_STOP, M_FORWARD, M_BACKWARD, M_LEFT, M_RIGHT };
MotorState motorState = M_STOP;
unsigned long motorEnd = 0;
float servoAngle = 90.0f;
float servoTarget = 90.0f;
float servoSpeed = 1.2f;
unsigned long lookHoldEnd = 0;

enum LedMode { LED_OFF, LED_SOLID, LED_BLINK, LED_FADE };
LedMode ledMode = LED_OFF;
uint8_t ledR = 0, ledG = 220, ledB = 220;
uint8_t blinkStep = 0;
unsigned long ledNext = 0;
float fadeValue = 0.0f;
float fadeDirection = 1.0f;

// ── Speaker queue ─────────────────────────────────────────────────────
struct SpeakerChunk {
  uint16_t count;
  int16_t samples[SPEAKER_CHUNK_SAMPLES];
};

QueueHandle_t speakerQueue = nullptr;

// ═══════════════════════════════════════════════════════════════════════
//  FORWARD DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════
void startCaptivePortal();
void connectWiFi();
void connectGemini();
void rotateGeminiKey();
void rawStop();
void drive(MotorState state, uint16_t duration, uint8_t speed);
void setHeadTarget(int angle, float speed);
void updateServo();
void updateMotors();
void setLed(uint8_t r, uint8_t g, uint8_t b);
void updateLed();
void applyLed(String led);
void executeScenario(JsonObject args);
void sendGeminiSetup();
void sendScenarioResponse(const char *id, const char *name);
void requestGeminiKeyRotation();
void handleGeminiToolCall(JsonObject toolCall);
void handleGeminiMessage(uint8_t *payload, size_t length);
void onGeminiMessage(WebsocketsMessage message);
void onGeminiEvent(WebsocketsEvent event, String data);
void updateSpeaker();
void sendMicChunk();
String captivePortalPage();
void handlePortalSave();
void loadSavedConfig();
void clearSpeakerQueue();
bool speakerIsActive();
void initMicI2S();
void initDacI2S();
int16_t micRawToPcm16(int32_t raw);
String base64Encode(const uint8_t *data, size_t length);
size_t base64Decode(const char *input, size_t length, uint8_t *output, size_t maxOutput);
void queueGeminiAudio(const char *encoded);
bool testRawSSL();

// ═══════════════════════════════════════════════════════════════════════
//  SPEAKER QUEUE HELPERS
// ═══════════════════════════════════════════════════════════════════════

void clearSpeakerQueue() {
  if (speakerQueue) xQueueReset(speakerQueue);
}

bool speakerIsActive() {
  return speakerQueue && uxQueueMessagesWaiting(speakerQueue) > 0
    || (lastSpeakerAudioAt && millis() - lastSpeakerAudioAt < 320);
}

// ═══════════════════════════════════════════════════════════════════════
//  I²S AUDIO
// ═══════════════════════════════════════════════════════════════════════

void initMicI2S() {
  const i2s_config_t config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = GEMINI_INPUT_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  const i2s_pin_config_t pins = {
    .bck_io_num = MIC_BCLK_PIN,
    .ws_io_num = MIC_WS_PIN,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = MIC_SD_PIN
  };
  i2s_driver_install(MIC_I2S_PORT, &config, 0, nullptr);
  i2s_set_pin(MIC_I2S_PORT, &pins);
  i2s_zero_dma_buffer(MIC_I2S_PORT);
}

void initDacI2S() {
  const i2s_config_t config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = GEMINI_OUTPUT_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };
  const i2s_pin_config_t pins = {
    .bck_io_num = DAC_BCLK_PIN,
    .ws_io_num = DAC_WS_PIN,
    .data_out_num = DAC_DIN_PIN,
    .data_in_num = I2S_PIN_NO_CHANGE
  };
  i2s_driver_install(DAC_I2S_PORT, &config, 0, nullptr);
  i2s_set_pin(DAC_I2S_PORT, &pins);
  i2s_zero_dma_buffer(DAC_I2S_PORT);
}

void updateSpeaker() {
  if (!speakerQueue) return;
  SpeakerChunk chunk;
  if (xQueueReceive(speakerQueue, &chunk, 0) != pdTRUE) return;

  static int32_t stereo[SPEAKER_CHUNK_SAMPLES * 2];
  for (uint16_t i = 0; i < chunk.count; ++i) {
    const int32_t sample = ((int32_t)chunk.samples[i]) << 16;
    stereo[i * 2] = sample;
    stereo[i * 2 + 1] = sample;
  }
  size_t written = 0;
  i2s_write(DAC_I2S_PORT, stereo, chunk.count * 2 * sizeof(int32_t), &written, portMAX_DELAY);
  lastSpeakerAudioAt = millis();
}

int16_t micRawToPcm16(int32_t raw) {
  int32_t sample = raw >> 16;
  sample = constrain(sample, -32768, 32767);
  return (int16_t)sample;
}

// ═══════════════════════════════════════════════════════════════════════
//  Base64
// ═══════════════════════════════════════════════════════════════════════

static const char BASE64_CHARS[] =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

int base64Index(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

String base64Encode(const uint8_t *data, size_t length) {
  String result;
  result.reserve(((length + 2) / 3) * 4);
  for (size_t i = 0; i < length; i += 3) {
    const uint32_t a = data[i];
    const uint32_t b = (i + 1 < length) ? data[i + 1] : 0;
    const uint32_t c = (i + 2 < length) ? data[i + 2] : 0;
    const uint32_t value = (a << 16) | (b << 8) | c;
    result += BASE64_CHARS[(value >> 18) & 0x3F];
    result += BASE64_CHARS[(value >> 12) & 0x3F];
    result += (i + 1 < length) ? BASE64_CHARS[(value >> 6) & 0x3F] : '=';
    result += (i + 2 < length) ? BASE64_CHARS[value & 0x3F] : '=';
  }
  return result;
}

size_t base64Decode(const char *input, size_t length, uint8_t *output, size_t maxOutput) {
  size_t out = 0;
  int value = 0;
  int bits = -8;
  for (size_t i = 0; i < length; ++i) {
    const int index = base64Index(input[i]);
    if (index < 0) continue;
    value = (value << 6) | index;
    bits += 6;
    if (bits >= 0) {
      if (out >= maxOutput) break;
      output[out++] = (uint8_t)((value >> bits) & 0xFF);
      bits -= 8;
    }
  }
  return out;
}

void queueGeminiAudio(const char *encoded) {
  if (!encoded || !speakerQueue) return;
  static uint8_t decoded[4096];
  const size_t encodedLength = strlen(encoded);
  const size_t byteCount = base64Decode(encoded, encodedLength, decoded, sizeof(decoded));
  for (size_t offset = 0; offset + 1 < byteCount;) {
    SpeakerChunk chunk;
    chunk.count = 0;
    while (offset + 1 < byteCount && chunk.count < SPEAKER_CHUNK_SAMPLES) {
      chunk.samples[chunk.count++] =
        (int16_t)((uint16_t)decoded[offset] | ((uint16_t)decoded[offset + 1] << 8));
      offset += 2;
    }
    if (chunk.count && xQueueSend(speakerQueue, &chunk, 0) != pdTRUE) {
      SpeakerChunk discarded;
      xQueueReceive(speakerQueue, &discarded, 0);
      xQueueSend(speakerQueue, &chunk, 0);
    }
  }
}

void sendMicChunk() {
  if (!geminiReady || !geminiWs.available() || speakerIsActive()) return;

  static int32_t raw[MIC_FRAMES_PER_CHUNK];
  static int16_t pcm[MIC_FRAMES_PER_CHUNK];
  size_t bytesRead = 0;
  const esp_err_t result = i2s_read(
    MIC_I2S_PORT, raw, sizeof(raw), &bytesRead, pdMS_TO_TICKS(30));
  if (result != ESP_OK || bytesRead < sizeof(int32_t)) return;

  const size_t frameCount = bytesRead / sizeof(int32_t);
  for (size_t i = 0; i < frameCount; ++i) pcm[i] = micRawToPcm16(raw[i]);
  const String encoded = base64Encode((const uint8_t *)pcm, frameCount * sizeof(int16_t));

  DynamicJsonDocument doc(1800);
  JsonObject realtime = doc.createNestedObject("realtimeInput");
  JsonObject audio = realtime.createNestedObject("audio");
  audio["data"] = encoded;
  audio["mimeType"] = "audio/pcm;rate=16000";
  String payload;
  serializeJson(doc, payload);
  geminiWs.send(payload);
  lastAudioSentAt = millis();
}

// ═══════════════════════════════════════════════════════════════════════
//  Robot controls
// ═══════════════════════════════════════════════════════════════════════

void rawStop() {
  analogWrite(MOTOR_A1, 0);
  analogWrite(MOTOR_A2, 0);
  analogWrite(MOTOR_B1, 0);
  analogWrite(MOTOR_B2, 0);
  motorState = M_STOP;
}

void drive(MotorState state, uint16_t duration, uint8_t speed = 128) {
  rawStop();
  motorState = state;
  motorEnd = millis() + duration;
  switch (state) {
    case M_FORWARD:  analogWrite(MOTOR_A1, speed); analogWrite(MOTOR_B1, speed); break;
    case M_BACKWARD: analogWrite(MOTOR_A2, speed); analogWrite(MOTOR_B2, speed); break;
    case M_LEFT:     analogWrite(MOTOR_A2, speed); analogWrite(MOTOR_B1, speed); break;
    case M_RIGHT:    analogWrite(MOTOR_A1, speed); analogWrite(MOTOR_B2, speed); break;
    default: break;
  }
}

void setHeadTarget(int angle, float speed = 1.2f) {
  servoTarget = constrain(angle, 45, 135);
  servoSpeed = constrain(speed, 0.3f, 3.0f);
  lookHoldEnd = millis() + 20000UL;
}

void updateServo() {
  const float difference = servoTarget - servoAngle;
  if (fabsf(difference) < 0.4f) servoAngle = servoTarget;
  else servoAngle += difference > 0 ? servoSpeed : -servoSpeed;
  headServo.write((int)constrain(servoAngle, 45.0f, 135.0f));
}

void updateMotors() {
  if (motorState != M_STOP && millis() >= motorEnd) rawStop();
}

void setLed(uint8_t r, uint8_t g, uint8_t b) {
  ledR = r; ledG = g; ledB = b;
  ledMode = LED_SOLID;
  neo.setPixelColor(0, neo.Color(r, g, b));
  neo.show();
}

void updateLed() {
  if (ledMode == LED_BLINK && millis() >= ledNext) {
    if (blinkStep == 0) {
      neo.setPixelColor(0, neo.Color(ledR, ledG, ledB));
      ledNext = millis() + 140;
      blinkStep = 1;
    } else {
      neo.clear();
      neo.show();
      ledMode = LED_OFF;
      blinkStep = 0;
    }
  } else if (ledMode == LED_FADE && millis() >= ledNext) {
    ledNext = millis() + 15;
    fadeValue += fadeDirection * 0.04f;
    if (fadeValue >= 1.0f) { fadeValue = 1.0f; fadeDirection = -1.0f; }
    if (fadeValue <= 0.0f) { fadeValue = 0.0f; fadeDirection = 1.0f; }
    neo.setPixelColor(0, neo.Color(
      (uint8_t)(ledR * fadeValue), (uint8_t)(ledG * fadeValue), (uint8_t)(ledB * fadeValue)));
    neo.show();
  }
}

void applyLed(String led) {
  led.toUpperCase();
  if (led == "LED_OFF") {
    ledMode = LED_OFF;
    neo.clear();
    neo.show();
  } else if (led == "LED_BLINK") {
    ledMode = LED_BLINK;
    blinkStep = 0;
    ledNext = 0;
  } else if (led == "LED_FADE") {
    ledMode = LED_FADE;
    fadeValue = 0.0f;
    fadeDirection = 1.0f;
    ledNext = 0;
  } else if (led == "LED_RED") setLed(255, 0, 0);
  else if (led == "LED_GREEN") setLed(0, 200, 0);
  else if (led == "LED_BLUE") setLed(0, 80, 255);
  else if (led == "LED_CYAN") setLed(0, 220, 220);
  else if (led == "LED_PURPLE") setLed(160, 0, 255);
  else if (led == "LED_ORANGE") setLed(255, 80, 0);
  else if (led == "LED_YELLOW") setLed(255, 200, 0);
  else if (led == "LED_PINK") setLed(255, 40, 120);
  else if (led == "LED_WHITE" || led == "LED_ON") setLed(255, 255, 255);
}

void executeScenario(JsonObject args) {
  String action = args["action"] | "idle";
  String move = args["move"] | "NONE";
  String led = args["led"] | "NONE";
  action.toLowerCase();
  move.toUpperCase();
  led.toUpperCase();
  const uint8_t speed = (uint8_t)constrain((int)(args["speed"] | 128), 0, 255);

  if (move == "FORWARD") drive(M_FORWARD, 800, speed);
  else if (move == "BACKWARD") drive(M_BACKWARD, 800, speed);
  else if (move == "LEFT") drive(M_LEFT, 400, speed);
  else if (move == "RIGHT") drive(M_RIGHT, 400, speed);
  else if (move == "LOOK_UP") setHeadTarget(120);
  else if (move == "LOOK_DOWN") setHeadTarget(60);
  else if (move == "LOOK_CENTER") setHeadTarget(90);

  if (led != "NONE") applyLed(led);
  else if (action == "angry") applyLed("LED_RED");
  else if (action == "loving") applyLed("LED_PINK");
  else if (action == "happy") applyLed("LED_GREEN");
  else if (action == "shocked") applyLed("LED_YELLOW");
}

// ═══════════════════════════════════════════════════════════════════════
//  Gemini Live
// ═══════════════════════════════════════════════════════════════════════

static const char LOOI_SYSTEM_PROMPT[] = R"LOOI(
You are LOOI, a cute, expressive, and curious AI Robot Companion created by
April Manalo. Speak primarily in Tagalog (Filipino), with natural Taglish.
Keep responses short and natural: 1 to 3 sentences.

Use run_scenario immediately for every emotional reaction or physical command.
Use it for movement, looking up/down/center, and LED effects. Do not claim to
see a face or camera image: this audio-only firmware has no camera or display.
Do not claim to play music, video, browse the web, or register a face because
those website-only features are not available in this hardware-only build.
When asked for current facts that need web search, honestly say that this
offline hardware build cannot search the web right now.
When asked who created you, say April Manalo made you.
)LOOI";

void sendGeminiSetup() {
  DynamicJsonDocument doc(12000);
  JsonObject setup = doc.createNestedObject("setup");
  setup["model"] = "models/gemini-3.1-flash-live-preview";

  JsonObject generation = setup.createNestedObject("generationConfig");
  JsonArray modalities = generation.createNestedArray("responseModalities");
  modalities.add("AUDIO");
  JsonObject speech = generation.createNestedObject("speechConfig");
  JsonObject voice = speech.createNestedObject("voiceConfig");
  voice["prebuiltVoiceConfig"]["voiceName"] = "Kore";
  speech["languageCode"] = "fil-PH";
  generation["temperature"] = 0.15;

  JsonObject realtime = setup.createNestedObject("realtimeInputConfig");
  JsonObject vad = realtime.createNestedObject("automaticActivityDetection");
  vad["disabled"] = false;
  vad["startOfSpeechSensitivity"] = "START_SENSITIVITY_HIGH";
  vad["endOfSpeechSensitivity"] = "END_SENSITIVITY_HIGH";
  vad["prefixPaddingMs"] = 20;
  vad["silenceDurationMs"] = 480;
  realtime["activityHandling"] = "START_OF_ACTIVITY_INTERRUPTS";
  realtime["turnCoverage"] = "TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO";
  setup.createNestedObject("inputAudioTranscription");
  setup.createNestedObject("outputAudioTranscription");

  JsonArray tools = setup.createNestedArray("tools");
  JsonObject tool = tools.createNestedObject();
  JsonArray declarations = tool.createNestedArray("functionDeclarations");
  JsonObject run = declarations.createNestedObject();
  run["name"] = "run_scenario";
  run["description"] = "React emotionally or control the robot's movement and LED.";
  JsonObject params = run.createNestedObject("parameters");
  params["type"] = "OBJECT";
  JsonObject properties = params.createNestedObject("properties");
  JsonObject action = properties.createNestedObject("action");
  action["type"] = "STRING";
  action["description"] = "idle, happy, loving, angry, sad, shocked, question, forward, backward, left, right, look_up, look_down, or look_center";
  JsonObject move = properties.createNestedObject("move");
  move["type"] = "STRING";
  move["description"] = "NONE, FORWARD, BACKWARD, LEFT, RIGHT, LOOK_UP, LOOK_DOWN, or LOOK_CENTER";
  JsonObject led = properties.createNestedObject("led");
  led["type"] = "STRING";
  led["description"] = "NONE or LED_OFF, LED_RED, LED_GREEN, LED_BLUE, LED_CYAN, LED_PURPLE, LED_ORANGE, LED_YELLOW, LED_PINK, LED_WHITE, LED_BLINK, LED_FADE";
  JsonObject speed = properties.createNestedObject("speed");
  speed["type"] = "INTEGER";
  speed["description"] = "Motor speed from 0 to 255";
  JsonArray required = params.createNestedArray("required");
  required.add("action");

  JsonObject instruction = setup.createNestedObject("systemInstruction");
  JsonArray parts = instruction.createNestedArray("parts");
  parts.createNestedObject()["text"] = LOOI_SYSTEM_PROMPT;

  String payload;
  serializeJson(doc, payload);
  geminiWs.send(payload);
}

void sendScenarioResponse(const char *id, const char *name) {
  DynamicJsonDocument doc(1800);
  JsonObject toolResponse = doc.createNestedObject("toolResponse");
  JsonArray responses = toolResponse.createNestedArray("functionResponses");
  JsonObject item = responses.createNestedObject();
  item["id"] = id;
  item["name"] = name;
  item["response"]["output"] = "executed";
  String payload;
  serializeJson(doc, payload);
  geminiWs.send(payload);
}

void requestGeminiKeyRotation() {
  if (!keyRotationRequested) {
    keyRotationRequested = true;
    Serial.println("[Gemini] Key failure detected; rotating to the next key");
  }
}

void rotateGeminiKey() {
  keyRotationRequested = false;
  geminiReady = false;
  clearSpeakerQueue();

  if (configuredGeminiKeyCount < 2) {
    Serial.println("[Gemini] No alternate API key is configured");
    startCaptivePortal();
    return;
  }
  if (geminiKeysTriedThisCycle >= configuredGeminiKeyCount) {
    Serial.println("[Gemini] All configured API keys failed; open setup portal");
    startCaptivePortal();
    return;
  }

  for (uint8_t step = 1; step <= GEMINI_KEY_SLOTS; ++step) {
    const uint8_t next = (activeGeminiKeyIndex + step) % GEMINI_KEY_SLOTS;
    if (configuredGeminiKeys[next].isEmpty()) continue;
    activeGeminiKeyIndex = next;
    geminiKeysTriedThisCycle++;
    Serial.printf("[Gemini] Trying API key slot %u/%u\n",
      activeGeminiKeyIndex + 1, configuredGeminiKeyCount);
    geminiWs.close();
    delay(40);
    connectGemini();
    return;
  }
  Serial.println("[Gemini] API key pool is empty; open setup portal");
  startCaptivePortal();
}

void handleGeminiToolCall(JsonObject toolCall) {
  JsonArray calls = toolCall["functionCalls"].as<JsonArray>();
  for (JsonObject call : calls) {
    const char *name = call["name"] | "";
    const char *id = call["id"] | "";
    if (strcmp(name, "run_scenario") == 0) {
      executeScenario(call["args"].as<JsonObject>());
      sendScenarioResponse(id, name);
    }
  }
}

void handleGeminiMessage(uint8_t *payload, size_t length) {
  DynamicJsonDocument doc(24000);
  DeserializationError error = deserializeJson(doc, payload, length);
  if (error) {
    Serial.printf("[Gemini] JSON error: %s\n", error.c_str());
    return;
  }
  if (doc["setupComplete"].is<JsonObject>()) {
    geminiReady = true;
    geminiKeysTriedThisCycle = 0;
    Serial.println("[Gemini] Live session ready");
    setLed(0, 200, 0); // Green = connected
  }
  if (doc["error"].is<JsonObject>()) {
    String errorText;
    serializeJson(doc["error"], errorText);
    String normalizedError = errorText;
    normalizedError.toLowerCase();
    Serial.println("[Gemini] upstream error");
    geminiReady = false;
    if (normalizedError.indexOf("api key") >= 0 ||
        normalizedError.indexOf("quota") >= 0 ||
        normalizedError.indexOf("resource_exhausted") >= 0 ||
        normalizedError.indexOf("permission") >= 0 ||
        normalizedError.indexOf("unauthenticated") >= 0 ||
        normalizedError.indexOf("invalid") >= 0 ||
        normalizedError.indexOf("401") >= 0 ||
        normalizedError.indexOf("403") >= 0 ||
        normalizedError.indexOf("429") >= 0) {
      requestGeminiKeyRotation();
    }
  }
  if (doc["toolCall"].is<JsonObject>()) {
    handleGeminiToolCall(doc["toolCall"].as<JsonObject>());
  }
  JsonObject serverContent = doc["serverContent"].as<JsonObject>();
  if (serverContent.isNull()) return;
  if (serverContent["interrupted"] == true) {
    clearSpeakerQueue();
    lastSpeakerAudioAt = 0;
    return;
  }
  JsonArray parts = serverContent["modelTurn"]["parts"].as<JsonArray>();
  for (JsonObject part : parts) {
    JsonObject inlineData = part["inlineData"].as<JsonObject>();
    if (!inlineData.isNull()) {
      const char *mime = inlineData["mimeType"] | "";
      if (strncmp(mime, "audio/pcm", 9) == 0) {
        queueGeminiAudio(inlineData["data"] | "");
      }
    }
  }
  if (serverContent["inputTranscription"]["text"].is<const char *>()) {
    Serial.printf("[User] %s\n", serverContent["inputTranscription"]["text"].as<const char *>());
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  ArduinoWebsockets callbacks
// ═══════════════════════════════════════════════════════════════════════

void onGeminiMessage(WebsocketsMessage message) {
  if (message.isText()) {
    handleGeminiMessage((uint8_t *)message.c_str(), message.length());
  }
}

void onGeminiEvent(WebsocketsEvent event, String data) {
  if (event == WebsocketsEvent::ConnectionOpened) {
    Serial.println("[Gemini] WebSocket connected; sending setup");
    geminiReady = false;
    sendGeminiSetup();
  } else if (event == WebsocketsEvent::ConnectionClosed) {
    Serial.println("[Gemini] WebSocket disconnected");
    geminiReady = false;
    clearSpeakerQueue();
  } else if (event == WebsocketsEvent::GotPing) {
    // auto-pong
  } else if (event == WebsocketsEvent::GotPong) {
    // pong received
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  RAW SSL TEST — para malaman kung SSL o network ang problema
// ═══════════════════════════════════════════════════════════════════════

bool testRawSSL() {
  Serial.println("[SSL-Test] Testing raw TCP+SSL to Google...");
  WiFiClientSecure testClient;
  testClient.setInsecure();
  testClient.setTimeout(10);

  if (!testClient.connect(GEMINI_HOST, GEMINI_PORT)) {
    Serial.println("[SSL-Test] FAILED: Cannot establish raw SSL connection");
    return false;
  }

  Serial.println("[SSL-Test] Raw SSL OK! Sending HTTP probe...");

  testClient.print("GET ");
  testClient.print(GEMINI_PATH);
  testClient.print("?key=");
  testClient.print(configuredGeminiKeys[activeGeminiKeyIndex]);
  testClient.println(" HTTP/1.1");
  testClient.print("Host: ");
  testClient.println(GEMINI_HOST);
  testClient.println("Connection: close");
  testClient.println();

  unsigned long timeout = millis() + 5000;
  while (testClient.connected() && millis() < timeout) {
    if (testClient.available()) {
      String line = testClient.readStringUntil('\n');
      Serial.printf("[SSL-Test] %s\n", line.c_str());
      if (line.startsWith("HTTP/1.1")) {
        if (line.indexOf("400") > 0) {
          Serial.println("[SSL-Test] Got 400 Bad Request = SSL works, WebSocket upgrade needed");
        } else if (line.indexOf("401") > 0 || line.indexOf("403") > 0) {
          Serial.println("[SSL-Test] Got 401/403 = SSL works, KEY is invalid/expired");
        }
        break;
      }
    }
    delay(10);
  }
  testClient.stop();
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
//  CONNECT GEMINI — using connectSecure() with explicit host/port/path
// ═══════════════════════════════════════════════════════════════════════

void connectGemini() {
  if (!wifiReady || configuredGeminiKeyCount == 0) {
    Serial.println("[Gemini] API key missing; open the LOOI setup portal");
    return;
  }
  if (activeGeminiKeyIndex >= GEMINI_KEY_SLOTS ||
      configuredGeminiKeys[activeGeminiKeyIndex].isEmpty()) {
    activeGeminiKeyIndex = 0;
  }
  if (geminiKeysTriedThisCycle == 0) geminiKeysTriedThisCycle = 1;

  String keyPreview = configuredGeminiKeys[activeGeminiKeyIndex].substring(0, 10);
  Serial.printf("[Gemini] Connecting with key prefix: %s...\n", keyPreview.c_str());

  // Step 1: Test raw SSL first
  if (!testRawSSL()) {
    Serial.println("[Gemini] Raw SSL test failed. Network or firewall issue?");
    return;
  }

  // Step 2: Build path with query string
  String path = GEMINI_PATH;
  path += "?key=";
  path += configuredGeminiKeys[activeGeminiKeyIndex];

  Serial.printf("[Gemini] Host: %s | Port: %u | Path: %s\n",
    GEMINI_HOST, GEMINI_PORT, path.c_str());

  // Step 3: Close any existing connection
  geminiWs.close();
  delay(100);

  // Step 4: CRITICAL — set callbacks BEFORE connecting
  geminiWs.onMessage(onGeminiMessage);
  geminiWs.onEvent(onGeminiEvent);

  // Step 5: CRITICAL — disable SSL verification
  geminiWs.setInsecure();

  // Step 6: Use connectSecure() instead of connect(url)
  // This is more reliable for WSS on ESP32
  bool connected = geminiWs.connectSecure(GEMINI_HOST, GEMINI_PORT, path);

  if (!connected) {
    Serial.println("[Gemini] WebSocket connectSecure() returned false");
    // Fallback: try connect() with full URL
    Serial.println("[Gemini] Fallback: trying connect() with full URL...");
    String url = "wss://";
    url += GEMINI_HOST;
    url += ":";
    url += GEMINI_PORT;
    url += path;
    connected = geminiWs.connect(url);
    if (!connected) {
      Serial.println("[Gemini] Fallback connect() also failed");
    }
  }

  if (connected) {
    Serial.println("[Gemini] WebSocket connect succeeded, waiting for handshake...");
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  CAPTIVE PORTAL
// ═══════════════════════════════════════════════════════════════════════

String captivePortalPage() {
  return String(R"HTML(<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>LOOI Wi-Fi Setup</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      background: #050812; color: #eaf7ff; font-family: system-ui, -apple-system, sans-serif; }
    main { width: min(92vw, 440px); padding: 28px; border: 1px solid #1c5770;
      border-radius: 18px; background: #0a1422; box-shadow: 0 16px 50px #0008; }
    h1 { margin: 0 0 8px; color: #7deeff; font-size: 1.6rem; }
    p { color: #a9bfca; line-height: 1.5; margin: 0 0 6px; }
    label { display: block; margin: 18px 0 7px; color: #bfe5f2; font-weight: 500; }
    input, textarea { width: 100%; padding: 12px; border-radius: 9px;
      border: 1px solid #2b657b; background: #06101b; color: #fff; font-size: 16px; outline: none; }
    input:focus, textarea:focus { border-color: #18c7ec; }
    button { width: 100%; margin-top: 24px; padding: 13px; border: 0;
      border-radius: 999px; background: #18c7ec; color: #03121a; font-weight: 800;
      font-size: 16px; cursor: pointer; }
    button:active { transform: scale(0.98); }
    small { display: block; margin-top: 18px; color: #7893a0; line-height: 1.4; font-size: 0.82rem; }
    .warn { color: #ff8844; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>LOOI setup</h1>
    <p>Ikonekta ang ESP32 sa Wi-Fi para makausap si LOOI nang direkta sa Gemini.</p>
    <p class="warn">IMPORTANTE: I-paste lang ang RAW KEY (hindi .env format).<br>
    Halimbawa: AQ.Ab8RN6... (hindi GEMINI_API_KEY="AQ...")</p>
    <form method="post" action="/save">
      <label for="ssid">Wi-Fi network name (SSID)</label>
      <input id="ssid" name="ssid" required autocomplete="off" placeholder="e.g. PLDTHome_Fiber">
      <label for="password">Wi-Fi password</label>
      <input id="password" name="password" type="password" autocomplete="off" placeholder="Wi-Fi password">
      <label for="keys">Gemini API keys (RAW keys only, one per line)</label>
      <textarea id="keys" name="keys" rows="6" required
        placeholder="AQ.Ab8RN6JxY6FKfo5hkfO6...&#10;AQ.Ab8RN6K2rDPwdtT3otjX..."></textarea>
      <button type="submit">Save and connect</button>
    </form>
    <small>Maglagay ng hanggang 10 keys, isang key bawat linya. Automatic na lilipat sa susunod na key kapag nag-fail. Pag na-save, magre-restart ang ESP32.</small>
  </main>
</body>
</html>)HTML");
}

void servePortal() {
  portalServer.send(200, "text/html", captivePortalPage());
}

void handleAppleCaptiveCheck() {
  portalServer.send(200, "text/html", "<!DOCTYPE html><html><head><title>Success</title></head><body>Success</body></html>");
}

void handleAndroid204() {
  portalServer.sendHeader("Location", "http://" + AP_IP.toString() + "/", true);
  portalServer.send(302, "text/plain", "Redirecting...");
}

String sanitizeApiKey(String raw) {
  raw.trim();
  int eqPos = raw.indexOf('=');
  if (eqPos >= 0) {
    raw = raw.substring(eqPos + 1);
    raw.trim();
  }
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    raw = raw.substring(1, raw.length() - 1);
  }
  if (raw.startsWith("'") && raw.endsWith("'")) {
    raw = raw.substring(1, raw.length() - 1);
  }
  raw.trim();
  return raw;
}

void handlePortalSave() {
  const String ssid = portalServer.arg("ssid");
  const String password = portalServer.arg("password");
  const String submittedKeys = portalServer.arg("keys");
  if (ssid.isEmpty() || submittedKeys.isEmpty()) {
    portalServer.send(400, "text/plain", "SSID and at least one Gemini API key are required.");
    return;
  }

  String keysToSave[GEMINI_KEY_SLOTS];
  uint8_t keyCount = 0;
  int lineStart = 0;
  while (lineStart <= submittedKeys.length() && keyCount < GEMINI_KEY_SLOTS) {
    int lineEnd = submittedKeys.indexOf('\n', lineStart);
    if (lineEnd < 0) lineEnd = submittedKeys.length();
    String key = submittedKeys.substring(lineStart, lineEnd);
    key = sanitizeApiKey(key);
    if (!key.isEmpty()) {
      bool duplicate = false;
      for (uint8_t i = 0; i < keyCount; ++i) {
        if (keysToSave[i] == key) { duplicate = true; break; }
      }
      if (!duplicate) {
        keysToSave[keyCount++] = key;
        Serial.printf("[Portal] Key %u sanitized OK (prefix: %s...)\n",
          keyCount, key.substring(0, 8).c_str());
      }
    }
    if (lineEnd >= submittedKeys.length()) break;
    lineStart = lineEnd + 1;
  }
  if (keyCount == 0) {
    portalServer.send(400, "text/plain", "At least one non-empty Gemini API key is required.");
    return;
  }

  configStore.begin("looi-v2", false);
  configStore.putString("wifi_ssid", ssid);
  configStore.putString("wifi_pass", password);
  for (uint8_t i = 0; i < GEMINI_KEY_SLOTS; ++i) {
    const String keyName = "gemini_" + String(i);
    configStore.putString(keyName.c_str(), i < keyCount ? keysToSave[i] : "");
  }
  configStore.remove("gemini_key");
  configStore.end();

  portalServer.send(200, "text/html",
    "<!doctype html><meta name='viewport' content='width=device-width'>"
    "<h2>Saved!</h2><p>LOOI is restarting and will connect to Wi-Fi.</p>");
  delay(1200);
  ESP.restart();
}

void startCaptivePortal() {
  if (portalActive) {
    Serial.println("[Portal] Already active");
    return;
  }

  Serial.println("\n========== STARTING CAPTIVE PORTAL ==========");
  wifiReady = false;
  geminiReady = false;

  WiFi.disconnect(true, true);
  delay(200);
  WiFi.mode(WIFI_OFF);
  delay(200);
  WiFi.mode(WIFI_AP);
  delay(200);

  bool configOk = WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  Serial.printf("[Portal] softAPConfig: %s\n", configOk ? "OK" : "FAILED");

  bool apStarted = WiFi.softAP(LOOI_SETUP_AP_NAME, NULL, 6, 0, 4);
  if (!apStarted) {
    Serial.println("[Portal] ERROR: WiFi.softAP() failed!");
    return;
  }
  Serial.println("[Portal] softAP started OK (OPEN network)");

  IPAddress actualIP = WiFi.softAPIP();
  Serial.printf("[Portal] AP IP: %s\n", actualIP.toString().c_str());
  Serial.printf("[Portal] SSID: %s (NO PASSWORD)\n", LOOI_SETUP_AP_NAME);

  bool dnsStarted = portalDns.start(53, "*", actualIP);
  Serial.printf("[Portal] DNS server: %s\n", dnsStarted ? "STARTED" : "FAILED");

  portalServer.on("/", HTTP_GET, servePortal);
  portalServer.on("/save", HTTP_POST, handlePortalSave);

  portalServer.on("/generate_204", HTTP_GET, handleAndroid204);
  portalServer.on("/gen_204", HTTP_GET, handleAndroid204);
  portalServer.on("/connecttest.txt", HTTP_GET, servePortal);

  portalServer.on("/hotspot-detect.html", HTTP_GET, handleAppleCaptiveCheck);
  portalServer.on("/captive.apple.com", HTTP_GET, handleAppleCaptiveCheck);
  portalServer.on("/library/test/success.html", HTTP_GET, handleAppleCaptiveCheck);

  portalServer.on("/ncsi.txt", HTTP_GET, servePortal);
  portalServer.on("/fwlink", HTTP_GET, servePortal);

  portalServer.on("/connectivitycheck.gstatic.com", HTTP_GET, servePortal);
  portalServer.on("/clients3.google.com", HTTP_GET, servePortal);
  portalServer.on("/www.google.com", HTTP_GET, servePortal);

  portalServer.onNotFound(servePortal);

  portalServer.begin();
  Serial.println("[Portal] HTTP server started on port 80");
  Serial.println("===========================================\n");

  portalActive = true;
  applyLed("LED_BLINK");
}

void loadSavedConfig() {
  configStore.begin("looi-v2", true);
  configuredWifiSsid = configStore.getString("wifi_ssid", "");
  configuredWifiPassword = configStore.getString("wifi_pass", "");
  configuredGeminiKeyCount = 0;
  for (uint8_t i = 0; i < GEMINI_KEY_SLOTS; ++i) {
    const String keyName = "gemini_" + String(i);
    configuredGeminiKeys[i] = configStore.getString(keyName.c_str(), "");
    if (!configuredGeminiKeys[i].isEmpty()) configuredGeminiKeyCount++;
  }
  if (configuredGeminiKeyCount == 0) {
    const String legacyKey = configStore.getString("gemini_key", "");
    if (!legacyKey.isEmpty()) {
      configuredGeminiKeys[0] = legacyKey;
      configuredGeminiKeyCount = 1;
    }
  }
  configStore.end();

  Serial.printf("[Config] Loaded %u key(s)\n", configuredGeminiKeyCount);
  for (uint8_t i = 0; i < configuredGeminiKeyCount; ++i) {
    if (!configuredGeminiKeys[i].isEmpty()) {
      Serial.printf("[Config] Key %u prefix: %s...\n", i + 1,
        configuredGeminiKeys[i].substring(0, 8).c_str());
    }
  }
}

void connectWiFi() {
  if (configuredWifiSsid.isEmpty() || configuredGeminiKeyCount == 0) {
    Serial.println("[WiFi] No saved setup; starting captive portal");
    startCaptivePortal();
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(configuredWifiSsid.c_str(), configuredWifiPassword.c_str());
  Serial.printf("[WiFi] Connecting to %s", configuredWifiSsid.c_str());
  const unsigned long deadline = millis() + 20000;
  while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  wifiReady = WiFi.status() == WL_CONNECTED;
  if (wifiReady) {
    Serial.print("[WiFi] Connected! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("[WiFi] Connection failed; starting captive portal");
    startCaptivePortal();
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[BOOT] LOOI ESP32-S3 Firmware v2");

  pinMode(MOTOR_A1, OUTPUT);
  pinMode(MOTOR_A2, OUTPUT);
  pinMode(MOTOR_B1, OUTPUT);
  pinMode(MOTOR_B2, OUTPUT);
  rawStop();

  headServo.setPeriodHertz(50);
  headServo.attach(SERVO_PIN, 500, 2500);
  headServo.write(90);

  neo.begin();
  neo.setBrightness(180);
  setLed(0, 220, 220);

  speakerQueue = xQueueCreate(8, sizeof(SpeakerChunk));
  initMicI2S();
  initDacI2S();
  loadSavedConfig();
  connectWiFi();
  if (wifiReady) connectGemini();
  Serial.println("[BOOT] Audio: 16 kHz mic -> Gemini -> 24 kHz PCM5100A");
}

void loop() {
  if (portalActive) {
    portalDns.processNextRequest();
    portalServer.handleClient();
  } else {
    geminiWs.poll();

    if (wifiReady && !geminiWs.available() && !geminiReady
        && millis() - lastGeminiReconnect > 8000) {
      lastGeminiReconnect = millis();
      Serial.println("[Gemini] Auto-reconnecting...");
      connectGemini();
    }
  }

  if (keyRotationRequested && !portalActive) rotateGeminiKey();

  if (!wifiReady && !portalActive && millis() - lastWifiAttempt > 10000) {
    lastWifiAttempt = millis();
    connectWiFi();
    if (wifiReady) connectGemini();
  }

  updateSpeaker();
  if (geminiReady && millis() - lastAudioSentAt >= 15) sendMicChunk();
  updateServo();
  updateMotors();
  updateLed();
  delay(1);
}
