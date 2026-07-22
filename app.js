const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt";
const CONTROL_TOPIC = "axoled-student/baechhhh/20260721/video/control/v1";
const CACHE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const videos = {
  1: { src: "assets/videos/node-1.mp4", name: "影片一" },
  2: { src: "assets/videos/node-2.mp4", name: "影片二" },
  3: { src: "assets/videos/node-3.mp4", name: "影片三" },
};

const stage = document.querySelector(".stage");
const mainVideo = document.querySelector("#mainVideo");
const connection = document.querySelector(".connection");
const connectionText = document.querySelector("#connectionText");

let currentNode = 0;
let idleTimer = null;

function setConnection(state, label) {
  connection.classList.toggle("connected", state === "connected");
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
  try {
    await mainVideo.play();
  } catch {
    window.setTimeout(() => mainVideo.play().catch(() => {}), 1000);
  }
}

function showIdle() {
  clearTimeout(idleTimer);
  currentNode = 0;
  mainVideo.pause();
  mainVideo.removeAttribute("src");
  mainVideo.load();
  stage.classList.remove("has-video");
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

async function prepareBackgroundCache() {
  if (!("serviceWorker" in navigator)) return;

  let hasController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasController && !reloading) {
      reloading = true;
      window.location.reload();
    }
    hasController = true;
  });

  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;

    const worker = registration.active || navigator.serviceWorker.controller;
    if (!worker) return;

    const status = await askServiceWorker(worker, "VIDEO_CACHE_STATUS");
    if (!status.ready) await askServiceWorker(worker, "CACHE_VIDEOS");

    const refreshVideos = () =>
      askServiceWorker(worker, "REFRESH_VIDEOS").catch((error) =>
        console.error("Background video refresh failed:", error),
      );

    window.setInterval(refreshVideos, CACHE_REFRESH_INTERVAL_MS);
    window.setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
  } catch (error) {
    console.error("Background cache setup failed:", error);
  }
}

prepareBackgroundCache();

if (!window.mqtt) {
  setConnection("connecting", "體驗準備中…");
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
    setConnection("connected", "體驗準備完成");
    client.subscribe(CONTROL_TOPIC, { qos: 0 });
  });

  client.on("reconnect", () => setConnection("connecting", "體驗準備中…"));
  client.on("offline", () => setConnection("connecting", "體驗準備中…"));
  client.on("error", () => setConnection("connecting", "體驗準備中…"));

  client.on("message", (topic, payload) => {
    if (topic === CONTROL_TOPIC) handleControlMessage(payload.toString());
  });
}
