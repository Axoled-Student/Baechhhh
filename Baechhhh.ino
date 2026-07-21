#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>

namespace Config {
constexpr uint8_t kAnalogPin = 34;
constexpr char kSetupAccessPoint[] = "ESP32-Video-Setup";
constexpr char kMqttHost[] = "broker.hivemq.com";
constexpr uint16_t kMqttPort = 1883;
constexpr char kControlTopic[] =
    "axoled-student/baechhhh/20260721/video/control/v1";
constexpr char kStatusTopic[] =
    "axoled-student/baechhhh/20260721/device/status/v1";
constexpr uint8_t kStableSamples = 3;
constexpr unsigned long kReconnectIntervalMs = 5000;
}  // namespace Config

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

int activePuzzle = 0;
int pendingPuzzle = 0;
uint8_t stableSampleCount = 0;
int lastPublishedPuzzle = -1;
unsigned long lastReconnectAttempt = 0;

int readAveragedAdc() {
  long sum = 0;
  for (int i = 0; i < 10; ++i) {
    sum += analogRead(Config::kAnalogPin);
    delay(2);
  }
  return sum / 10;
}

int puzzleFromAdc(int adcValue) {
  if (adcValue >= 200 && adcValue < 1000) return 1;
  if (adcValue >= 1200 && adcValue < 2200) return 2;
  if (adcValue >= 2400 && adcValue < 3400) return 3;
  return 0;
}

void publishCurrentState(bool force = false) {
  if (!mqttClient.connected()) return;
  if (!force && activePuzzle == lastPublishedPuzzle) return;

  const String message = activePuzzle == 0
                             ? "OFF|0"
                             : "ON|" + String(activePuzzle);

  if (mqttClient.publish(Config::kControlTopic, message.c_str(), true)) {
    Serial.println("MQTT -> " + message);
    lastPublishedPuzzle = activePuzzle;
  } else {
    Serial.println("MQTT publish failed");
  }
}

bool connectMqtt() {
  const String clientId = "baechhhh-esp32-" +
                          String(static_cast<uint32_t>(ESP.getEfuseMac()), HEX);

  Serial.print("Connecting to MQTT...");
  const bool connected = mqttClient.connect(
      clientId.c_str(), Config::kStatusTopic, 0, true, "offline");

  if (!connected) {
    Serial.printf(" failed (state %d)\n", mqttClient.state());
    return false;
  }

  Serial.println(" connected");
  mqttClient.publish(Config::kStatusTopic, "online", true);
  lastPublishedPuzzle = -1;
  publishCurrentState(true);
  return true;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("baechhhh-esp32");

  WiFiManager wifiManager;
  wifiManager.setTitle("ESP32 影片控制器");
  wifiManager.setConfigPortalBlocking(true);

  Serial.println("Connecting to saved Wi-Fi...");
  Serial.println("If setup is needed, join AP: ESP32-Video-Setup");

  if (!wifiManager.autoConnect(Config::kSetupAccessPoint)) {
    Serial.println("Wi-Fi setup failed; restarting...");
    delay(2000);
    ESP.restart();
  }

  Serial.print("Wi-Fi connected. IP: ");
  Serial.println(WiFi.localIP());
}

void updateStablePuzzle(int measuredPuzzle) {
  if (measuredPuzzle != pendingPuzzle) {
    pendingPuzzle = measuredPuzzle;
    stableSampleCount = 1;
    return;
  }

  if (stableSampleCount < Config::kStableSamples) {
    ++stableSampleCount;
  }

  if (stableSampleCount >= Config::kStableSamples &&
      activePuzzle != pendingPuzzle) {
    activePuzzle = pendingPuzzle;
    publishCurrentState();
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);

  analogReadResolution(12);
  analogSetPinAttenuation(Config::kAnalogPin, ADC_11db);

  connectWifi();
  mqttClient.setServer(Config::kMqttHost, Config::kMqttPort);
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(5);
  connectMqtt();

  Serial.println("ESP32 video controller ready");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }

  if (!mqttClient.connected()) {
    const unsigned long now = millis();
    if (now - lastReconnectAttempt >= Config::kReconnectIntervalMs) {
      lastReconnectAttempt = now;
      connectMqtt();
    }
  } else {
    mqttClient.loop();
  }

  const int adcValue = readAveragedAdc();
  const int measuredPuzzle = puzzleFromAdc(adcValue);
  updateStablePuzzle(measuredPuzzle);

  Serial.printf("ADC: %d | node: %d\n", adcValue, activePuzzle);
  delay(80);
}
