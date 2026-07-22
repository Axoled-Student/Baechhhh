#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <esp_eap_client.h>

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
constexpr unsigned long kWifiConnectTimeoutMs = 30000;
constexpr char kPreferencesNamespace[] = "baechhhh-net";
constexpr char kDefaultEduroamSsid[] = "eduroam";

// Paste the CA certificate supplied by the school inside the PEM raw string
// before a permanent deployment. Leaving it empty allows PEAP login but does
// not validate that the RADIUS server really belongs to the school.
constexpr char kEduroamCaPem[] = R"PEM()PEM";
}  // namespace Config

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

int activePuzzle = 0;
int pendingPuzzle = 0;
uint8_t stableSampleCount = 0;
int lastPublishedPuzzle = -1;
unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastWifiReconnectAttempt = 0;
bool usingEnterpriseWifi = false;

struct EnterpriseWifiConfig {
  bool enabled = false;
  String ssid = Config::kDefaultEduroamSsid;
  String identity;
  String username;
  String password;
  String radiusDomain;

  bool valid() const {
    return enabled && !ssid.isEmpty() && !username.isEmpty() &&
           !password.isEmpty();
  }
};

int readAveragedAdc() {
  long sum = 0;
  for (int i = 0; i < 10; ++i) {
    sum += analogRead(Config::kAnalogPin);
    delay(2);
  }
  return sum / 10;
}

int puzzleFromAdc(int adcValue) {
  // Each physical puzzle tile is identified by the ADC range it produces on
  // GPIO 34. Values between these bands mean that no known tile is seated.
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
  if (WiFi.status() != WL_CONNECTED) return false;

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

EnterpriseWifiConfig loadEnterpriseWifiConfig() {
  EnterpriseWifiConfig config;
  Preferences preferences;
  if (!preferences.begin(Config::kPreferencesNamespace, true)) return config;

  config.enabled = preferences.getBool("enabled", false);
  config.ssid = preferences.getString("ssid", Config::kDefaultEduroamSsid);
  config.identity = preferences.getString("identity", "");
  config.username = preferences.getString("username", "");
  config.password = preferences.getString("password", "");
  config.radiusDomain = preferences.getString("radius", "");
  preferences.end();
  return config;
}

void saveEnterpriseWifiConfig(const EnterpriseWifiConfig& config) {
  Preferences preferences;
  if (!preferences.begin(Config::kPreferencesNamespace, false)) return;

  preferences.putBool("enabled", true);
  preferences.putString("ssid", config.ssid);
  preferences.putString("identity", config.identity);
  preferences.putString("username", config.username);
  preferences.putString("password", config.password);
  preferences.putString("radius", config.radiusDomain);
  preferences.end();
}

void clearEnterpriseWifiConfig() {
  Preferences preferences;
  if (!preferences.begin(Config::kPreferencesNamespace, false)) return;
  preferences.clear();
  preferences.end();
}

bool waitForWifi(unsigned long timeoutMs) {
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < timeoutMs) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

bool connectEduroam(const EnterpriseWifiConfig& config) {
  if (!config.valid()) return false;

  Serial.println("Connecting to eduroam...");

  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("baechhhh-esp32");
  WiFi.setAutoReconnect(true);

  const String identity = config.identity.isEmpty()
                              ? config.username
                              : config.identity;
  const char* caPem = Config::kEduroamCaPem[0] == '\0'
                          ? nullptr
                          : Config::kEduroamCaPem;

  const esp_err_t domainResult = esp_eap_client_set_domain_name(
      config.radiusDomain.isEmpty() ? nullptr : config.radiusDomain.c_str());
  if (domainResult != ESP_OK) {
    Serial.printf("Could not set RADIUS domain (error %d)\n", domainResult);
    return false;
  }

  WiFi.begin(config.ssid.c_str(), WPA2_AUTH_PEAP, identity.c_str(),
             config.username.c_str(), config.password.c_str(), caPem);

  if (!waitForWifi(Config::kWifiConnectTimeoutMs)) {
    Serial.println("eduroam authentication failed");
    return false;
  }

  usingEnterpriseWifi = true;
  return true;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname("baechhhh-esp32");
  WiFi.setAutoReconnect(true);

  EnterpriseWifiConfig savedEnterprise = loadEnterpriseWifiConfig();
  if (savedEnterprise.valid()) {
    Serial.println("Trying saved eduroam credentials...");
    if (connectEduroam(savedEnterprise)) {
      Serial.print("Wi-Fi connected. IP: ");
      Serial.println(WiFi.localIP());
      return;
    }
  } else {
    Serial.println("Trying saved personal Wi-Fi...");
    WiFi.begin();
    if (waitForWifi(15000)) {
      Serial.print("Wi-Fi connected. IP: ");
      Serial.println(WiFi.localIP());
      return;
    }
  }

  WiFiManager wifiManager;
  wifiManager.setTitle("ESP32 影片控制器");
  wifiManager.setConfigPortalBlocking(true);
  wifiManager.setBreakAfterConfig(true);
  wifiManager.setConnectTimeout(15);
  wifiManager.setSaveConnectTimeout(15);

  WiFiManagerParameter enterpriseHelp(
      "<p><b>eduroam：</b>請選擇 eduroam，將上方一般 Password 留空，"
      "並填寫下面三個校園欄位。</p>");
  WiFiManagerParameter enterpriseEnabled(
      "enterprise", "使用 eduroam / WPA2-Enterprise", "1", 1,
      "type=\"checkbox\" checked");
  WiFiManagerParameter enterpriseIdentity(
      "eap_identity", "外部身分（依學校說明；空白會使用校園帳號）",
      savedEnterprise.identity.c_str(), 64,
      "autocomplete=\"off\" autocapitalize=\"none\"");
  WiFiManagerParameter enterpriseUsername(
      "eap_username", "完整校園帳號（例如學號@學校網域）",
      savedEnterprise.username.c_str(), 64,
      "autocomplete=\"username\" autocapitalize=\"none\"");
  WiFiManagerParameter enterprisePassword(
      "eap_password", "校園密碼（空白會保留原密碼）", "", 64,
      "type=\"password\" autocomplete=\"off\"");
  WiFiManagerParameter radiusDomain(
      "radius_domain", "RADIUS 伺服器網域（請依學校 IT 說明填寫）",
      savedEnterprise.radiusDomain.c_str(), 255,
      "autocomplete=\"off\" autocapitalize=\"none\"");

  wifiManager.addParameter(&enterpriseHelp);
  wifiManager.addParameter(&enterpriseEnabled);
  wifiManager.addParameter(&enterpriseIdentity);
  wifiManager.addParameter(&enterpriseUsername);
  wifiManager.addParameter(&enterprisePassword);
  wifiManager.addParameter(&radiusDomain);

  bool portalSubmitted = false;
  bool enterpriseRequested = false;
  EnterpriseWifiConfig submittedEnterprise;

  wifiManager.setSaveConfigCallback([&]() {
    portalSubmitted = true;
    submittedEnterprise.ssid = wifiManager.getWiFiSSID(true);
    submittedEnterprise.ssid.trim();

    const String enterpriseValue = enterpriseEnabled.getValue();
    enterpriseRequested = enterpriseValue == "1" ||
                          submittedEnterprise.ssid.equalsIgnoreCase(
                              Config::kDefaultEduroamSsid);
    submittedEnterprise.enabled = enterpriseRequested;
    submittedEnterprise.identity = enterpriseIdentity.getValue();
    submittedEnterprise.identity.trim();
    submittedEnterprise.username = enterpriseUsername.getValue();
    submittedEnterprise.username.trim();
    submittedEnterprise.password = enterprisePassword.getValue();
    submittedEnterprise.radiusDomain = radiusDomain.getValue();
    submittedEnterprise.radiusDomain.trim();

    if (submittedEnterprise.password.isEmpty() && savedEnterprise.enabled &&
        submittedEnterprise.username == savedEnterprise.username) {
      submittedEnterprise.password = savedEnterprise.password;
    }
  });

  Serial.println("Join setup AP: ESP32-Video-Setup");
  const bool personalWifiConnected =
      wifiManager.startConfigPortal(Config::kSetupAccessPoint);

  if (portalSubmitted && enterpriseRequested) {
    if (!submittedEnterprise.valid()) {
      Serial.println("eduroam setup needs SSID, username and password");
    } else {
      saveEnterpriseWifiConfig(submittedEnterprise);
      if (connectEduroam(submittedEnterprise)) {
        Serial.print("Wi-Fi connected. IP: ");
        Serial.println(WiFi.localIP());
        return;
      }
    }
  } else if (personalWifiConnected && WiFi.status() == WL_CONNECTED) {
    clearEnterpriseWifiConfig();
    usingEnterpriseWifi = false;
    Serial.print("Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
    return;
  }

  Serial.println("Wi-Fi setup failed; restarting...");
  delay(2000);
  ESP.restart();
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
  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiReconnectAttempt >= Config::kReconnectIntervalMs) {
      lastWifiReconnectAttempt = now;
      Serial.println(usingEnterpriseWifi
                         ? "Reconnecting to eduroam..."
                         : "Reconnecting to Wi-Fi...");
      WiFi.reconnect();
    }
  }

  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    if (now - lastMqttReconnectAttempt >= Config::kReconnectIntervalMs) {
      lastMqttReconnectAttempt = now;
      connectMqtt();
    }
  } else if (mqttClient.connected()) {
    mqttClient.loop();
  }

  const int adcValue = readAveragedAdc();
  const int measuredPuzzle = puzzleFromAdc(adcValue);
  updateStablePuzzle(measuredPuzzle);

  Serial.printf("ADC: %d | node: %d\n", adcValue, activePuzzle);
  delay(80);
}
