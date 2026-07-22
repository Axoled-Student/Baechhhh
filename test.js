const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt";
const CONTROL_TOPIC = "axoled-student/baechhhh/20260721/video/control/v1";
const AUTO_MESSAGES = ["ON|1", "ON|2", "ON|3", "OFF|0"];

const connection = document.querySelector("#connection");
const connectionText = document.querySelector("#connectionText");
const currentState = document.querySelector("#currentState");
const currentMessage = document.querySelector("#currentMessage");
const eventLog = document.querySelector("#eventLog");
const nodeButtons = [...document.querySelectorAll(".node-button")];
const autoButton = document.querySelector("#autoButton");

let client = null;
let autoTimer = null;
let autoIndex = 0;

function setConnected(ready, label, isError = false) {
  connection.classList.toggle("ready", ready);
  connection.classList.toggle("error", isError);
  connectionText.textContent = label;
  nodeButtons.forEach((button) => { button.disabled = !ready; });
  autoButton.disabled = !ready;
}

function stateLabel(message) {
  const labels = {
    "ON|1": "節點一播放中",
    "ON|2": "節點二播放中",
    "ON|3": "節點三播放中",
    "OFF|0": "等待板塊",
  };
  return labels[message] || "收到未知訊號";
}

function addLog(message) {
  if (eventLog.children.length === 1 && eventLog.firstElementChild.textContent.includes("等待")) {
    eventLog.replaceChildren();
  }

  const item = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  item.append(time, `　${message}　${stateLabel(message)}`);
  eventLog.prepend(item);

  while (eventLog.children.length > 5) eventLog.lastElementChild.remove();
}

function showState(message) {
  currentState.textContent = stateLabel(message);
  currentMessage.textContent = message;
  nodeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.message === message);
  });
  addLog(message);
}

function publish(message) {
  if (!client?.connected) return;
  client.publish(CONTROL_TOPIC, message, { qos: 0, retain: true });
}

function stopAutoTest() {
  window.clearInterval(autoTimer);
  autoTimer = null;
  autoIndex = 0;
  autoButton.classList.remove("running");
  autoButton.textContent = "開始自動測試 1 → 2 → 3";
}

function startAutoTest() {
  stopAutoTest();
  autoButton.classList.add("running");
  autoButton.textContent = "停止自動測試";

  const sendNext = () => {
    publish(AUTO_MESSAGES[autoIndex]);
    autoIndex = (autoIndex + 1) % AUTO_MESSAGES.length;
  };

  sendNext();
  autoTimer = window.setInterval(sendNext, 3000);
}

nodeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    stopAutoTest();
    publish(button.dataset.message);
  });
});

autoButton.addEventListener("click", () => {
  if (autoTimer) {
    stopAutoTest();
    publish("OFF|0");
  } else {
    startAutoTest();
  }
});

if (!window.mqtt) {
  setConnected(false, "控制元件載入失敗", true);
} else {
  const randomId = crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);

  client = mqtt.connect(MQTT_URL, {
    clientId: `baechhhh-tester-${randomId}`,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 2500,
    keepalive: 30,
  });

  client.on("connect", () => {
    setConnected(true, "模擬器已連線");
    client.subscribe(CONTROL_TOPIC, { qos: 0 });
  });

  client.on("message", (topic, payload) => {
    if (topic === CONTROL_TOPIC) showState(payload.toString());
  });

  client.on("reconnect", () => setConnected(false, "重新連線中…"));
  client.on("offline", () => setConnected(false, "連線中斷", true));
  client.on("error", () => setConnected(false, "連線錯誤", true));
}
