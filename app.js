const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt";
const CONTROL_TOPIC = "axoled-student/baechhhh/20260721/video/control/v1";

const videos = {
  1: { src: "assets/videos/node-1.mp4", name: "節點一｜暖色脈衝" },
  2: { src: "assets/videos/node-2.mp4", name: "節點二｜藍色流動" },
  3: { src: "assets/videos/node-3.mp4", name: "節點三｜綠色波形" },
};

const stage = document.querySelector(".stage");
const mainVideo = document.querySelector("#mainVideo");
const nowPlaying = document.querySelector("#nowPlaying");
const connection = document.querySelector(".connection");
const connectionText = document.querySelector("#connectionText");
const soundButton = document.querySelector("#soundButton");
const nodeCards = [...document.querySelectorAll(".node-card")];

let currentNode = 0;
let idleTimer = null;

function setConnection(state, label) {
  connection.classList.toggle("connected", state === "connected");
  connection.classList.toggle("error", state === "error");
  connectionText.textContent = label;
}

async function showNode(node) {
  const selected = videos[node];
  if (!selected || currentNode === node) return;

  clearTimeout(idleTimer);
  currentNode = node;
  mainVideo.src = selected.src;
  mainVideo.load();
  stage.classList.add("has-video");
  nowPlaying.textContent = selected.name;

  nodeCards.forEach((card) => {
    const active = Number(card.dataset.node) === node;
    card.classList.toggle("active", active);
    card.setAttribute("aria-pressed", String(active));
  });

  try {
    await mainVideo.play();
  } catch {
    nowPlaying.textContent = `${selected.name}（點一下畫面播放）`;
  }
}

function showIdle() {
  clearTimeout(idleTimer);
  currentNode = 0;
  mainVideo.pause();
  mainVideo.removeAttribute("src");
  mainVideo.load();
  stage.classList.remove("has-video");
  nowPlaying.textContent = "尚未選擇節點";
  nodeCards.forEach((card) => {
    card.classList.remove("active");
    card.setAttribute("aria-pressed", "false");
  });
}

function handleControlMessage(rawMessage) {
  const [action, rawNode] = rawMessage.trim().toUpperCase().split("|");
  const node = Number(rawNode);

  if (action === "ON" && videos[node]) {
    clearTimeout(idleTimer);
    showNode(node);
    return;
  }

  if (action === "OFF") {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(showIdle, 250);
  }
}

nodeCards.forEach((card) => {
  card.setAttribute("aria-pressed", "false");
  card.addEventListener("click", () => showNode(Number(card.dataset.node)));
});

mainVideo.addEventListener("click", () => mainVideo.play());

soundButton.addEventListener("click", () => {
  mainVideo.muted = !mainVideo.muted;
  soundButton.textContent = mainVideo.muted ? "開啟聲音" : "關閉聲音";
});

if (!window.mqtt) {
  setConnection("error", "即時元件載入失敗");
} else {
  const clientId = `baechhhh-tablet-${crypto.randomUUID().slice(0, 8)}`;
  const client = mqtt.connect(MQTT_URL, {
    clientId,
    clean: true,
    connectTimeout: 8000,
    reconnectPeriod: 2500,
    keepalive: 30,
  });

  client.on("connect", () => {
    setConnection("connected", "已連線，等待 ESP32");
    client.subscribe(CONTROL_TOPIC, { qos: 0 }, (error) => {
      if (error) setConnection("error", "訂閱失敗，正在重試");
    });
  });

  client.on("reconnect", () => setConnection("connecting", "重新連線中…"));
  client.on("offline", () => setConnection("error", "連線中斷，正在重試"));
  client.on("error", () => setConnection("error", "即時連線發生錯誤"));

  client.on("message", (topic, payload) => {
    if (topic === CONTROL_TOPIC) handleControlMessage(payload.toString());
  });
}
