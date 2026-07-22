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
const cacheButton = document.querySelector("#cacheButton");
const cacheText = document.querySelector("#cacheText");

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

function setCacheStatus(state, label) {
  cacheButton.classList.toggle("ready", state === "ready");
  cacheButton.classList.toggle("error", state === "error");
  cacheButton.disabled = state === "loading";
  cacheText.textContent = label;
}

function askServiceWorker(worker, type) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("Service worker timeout")), 30000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      if (event.data?.ok) resolve(event.data);
      else reject(new Error(event.data?.error || "Video cache failed"));
    };

    worker.postMessage({ type }, [channel.port2]);
  });
}

async function prepareVideoCache(forceRefresh = false) {
  if (!("serviceWorker" in navigator)) {
    setCacheStatus("error", "此瀏覽器不支援離線快取");
    return;
  }

  setCacheStatus("loading", forceRefresh ? "正在重新下載影片…" : "正在快取三支影片…");

  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
    const worker = registration.active || navigator.serviceWorker.controller;
    if (!worker) throw new Error("Service worker is not active");

    const status = await askServiceWorker(worker, "VIDEO_CACHE_STATUS");
    if (!forceRefresh && status.ready) {
      setCacheStatus("ready", "三支影片已快取｜點此重新下載");
      return;
    }

    await askServiceWorker(worker, forceRefresh ? "REFRESH_VIDEOS" : "CACHE_VIDEOS");
    setCacheStatus("ready", "三支影片已快取｜點此重新下載");
  } catch (error) {
    console.error("Video cache error:", error);
    setCacheStatus("error", "影片快取失敗｜點此重試");
  }
}

cacheButton.addEventListener("click", () => prepareVideoCache(true));
prepareVideoCache();

if (!window.mqtt) {
  setConnection("error", "即時元件載入失敗");
} else {
  const randomId = crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  const clientId = `baechhhh-tablet-${randomId}`;
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
