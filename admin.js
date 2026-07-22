"use strict";

const OWNER = "Axoled-Student";
const REPOSITORY = "Baechhhh";
const BRANCH = "main";
const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const TOKEN_STORAGE_KEY = "baechhhh-video-upload-token";
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const VIDEO_PATHS = {
  1: "assets/videos/node-1.mp4",
  2: "assets/videos/node-2.mp4",
  3: "assets/videos/node-3.mp4",
};

const state = {
  token: "",
  node: 1,
  selectedFile: null,
  selectedPreviewUrl: "",
  metadata: new Map(),
  busy: false,
};

const elements = {
  bootScreen: document.querySelector("#bootScreen"),
  tokenScreen: document.querySelector("#tokenScreen"),
  managerScreen: document.querySelector("#managerScreen"),
  tokenForm: document.querySelector("#tokenForm"),
  tokenInput: document.querySelector("#tokenInput"),
  saveTokenButton: document.querySelector("#saveTokenButton"),
  tokenMessage: document.querySelector("#tokenMessage"),
  changeTokenButton: document.querySelector("#changeTokenButton"),
  currentNodeLabel: document.querySelector("#currentNodeLabel"),
  currentVideoInfo: document.querySelector("#currentVideoInfo"),
  currentVideo: document.querySelector("#currentVideo"),
  currentVideoMissing: document.querySelector("#currentVideoMissing"),
  videoFileInput: document.querySelector("#videoFileInput"),
  selectedFileName: document.querySelector("#selectedFileName"),
  newVideoPanel: document.querySelector("#newVideoPanel"),
  newVideo: document.querySelector("#newVideo"),
  uploadSummary: document.querySelector("#uploadSummary"),
  uploadButton: document.querySelector("#uploadButton"),
  uploadMessage: document.querySelector("#uploadMessage"),
  nodeInputs: Array.from(document.querySelectorAll('input[name="node"]')),
};

function showOnly(screen) {
  elements.bootScreen.hidden = screen !== "boot";
  elements.tokenScreen.hidden = screen !== "token";
  elements.managerScreen.hidden = screen !== "manager";
}

function setMessage(element, text, kind = "info") {
  element.textContent = text;
  element.dataset.kind = kind;
  element.hidden = !text;
}

function friendlyError(error) {
  if (error && error.status === 401) {
    return "Token 無效或已過期，請輸入新的 Token。";
  }
  if (error && error.status === 403) {
    return "這個 Token 沒有上傳權限。請確認已授權此網站的 Contents：Read and write。";
  }
  if (error && error.status === 409) {
    return "影片剛被其他人更新，請再按一次上傳。";
  }
  if (error && error.status === 422) {
    return "GitHub 無法接受這個檔案。請確認是 MP4，且檔案小於 100 MB。";
  }
  if (error instanceof TypeError) {
    return "目前無法連上 GitHub，請檢查網路後再試一次。";
  }
  return error && error.message ? error.message : "發生問題，請稍後再試。";
}

function createApiError(response, data) {
  const error = new Error(data && data.message ? data.message : `GitHub 回傳 ${response.status}`);
  error.status = response.status;
  return error;
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${state.token}`);
  headers.set("X-GitHub-Api-Version", API_VERSION);

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body,
    cache: "no-store",
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw createApiError(response, data);
  }

  return data;
}

async function verifyToken() {
  await apiRequest(`/repos/${OWNER}/${REPOSITORY}`);
}

function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "大小未知";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.ceil(bytes / 1024)} KB`;
}

function metadataPath(node) {
  return `/repos/${OWNER}/${REPOSITORY}/contents/${VIDEO_PATHS[node]}?ref=${encodeURIComponent(BRANCH)}`;
}

async function loadVideoMetadata(node) {
  try {
    const metadata = await apiRequest(metadataPath(node));
    state.metadata.set(node, metadata);
    return metadata;
  } catch (error) {
    if (error.status === 404) {
      state.metadata.set(node, null);
      return null;
    }
    throw error;
  }
}

function setCurrentVideo(metadata) {
  if (!metadata || !metadata.download_url) {
    elements.currentVideo.removeAttribute("src");
    elements.currentVideo.load();
    elements.currentVideo.hidden = true;
    elements.currentVideoMissing.hidden = false;
    elements.currentVideoInfo.textContent = "尚未上傳";
    return;
  }

  const separator = metadata.download_url.includes("?") ? "&" : "?";
  elements.currentVideo.src = `${metadata.download_url}${separator}v=${encodeURIComponent(metadata.sha || Date.now())}`;
  elements.currentVideo.hidden = false;
  elements.currentVideoMissing.hidden = true;
  elements.currentVideoInfo.textContent = humanFileSize(metadata.size);
  elements.currentVideo.load();
}

function updateNodeText() {
  elements.currentNodeLabel.textContent = String(state.node);
  elements.uploadSummary.textContent = `新影片會替換「影片 ${state.node}」。`;
  elements.uploadButton.textContent = state.busy
    ? `正在上傳影片 ${state.node}…`
    : `上傳並替換影片 ${state.node}`;
}

function clearSelectedFile() {
  if (state.selectedPreviewUrl) {
    URL.revokeObjectURL(state.selectedPreviewUrl);
  }
  state.selectedFile = null;
  state.selectedPreviewUrl = "";
  elements.videoFileInput.value = "";
  elements.selectedFileName.textContent = "尚未選擇影片";
  elements.newVideo.removeAttribute("src");
  elements.newVideo.load();
  elements.newVideoPanel.hidden = true;
  elements.uploadButton.disabled = true;
}

async function selectNode(node) {
  state.node = node;
  clearSelectedFile();
  setMessage(elements.uploadMessage, "");
  updateNodeText();

  elements.currentVideoInfo.textContent = "讀取中…";
  const cached = state.metadata.get(node);
  if (cached !== undefined) {
    setCurrentVideo(cached);
    return;
  }

  try {
    setCurrentVideo(await loadVideoMetadata(node));
  } catch (error) {
    elements.currentVideoInfo.textContent = "無法讀取";
    setMessage(elements.uploadMessage, friendlyError(error), "error");
  }
}

function validateVideo(file) {
  if (!file) {
    throw new Error("請先選擇一個 MP4 影片。 ");
  }
  if (!file.name.toLowerCase().endsWith(".mp4")) {
    throw new Error("請選擇副檔名為 .mp4 的影片。 ");
  }
  if (file.size <= 0) {
    throw new Error("這個影片是空的，請重新選擇。 ");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("影片超過 100 MB，請先壓縮再上傳。 ");
  }
}

function chooseFile(file) {
  try {
    validateVideo(file);
  } catch (error) {
    clearSelectedFile();
    setMessage(elements.uploadMessage, error.message.trim(), "error");
    return;
  }

  if (state.selectedPreviewUrl) {
    URL.revokeObjectURL(state.selectedPreviewUrl);
  }

  state.selectedFile = file;
  state.selectedPreviewUrl = URL.createObjectURL(file);
  elements.selectedFileName.textContent = `${file.name} · ${humanFileSize(file.size)}`;
  elements.newVideo.src = state.selectedPreviewUrl;
  elements.newVideoPanel.hidden = false;
  elements.newVideo.load();
  elements.uploadButton.disabled = false;
  setMessage(elements.uploadMessage, "");
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function setBusy(busy) {
  state.busy = busy;
  elements.nodeInputs.forEach((input) => {
    input.disabled = busy;
  });
  elements.videoFileInput.disabled = busy;
  elements.changeTokenButton.disabled = busy;
  elements.uploadButton.disabled = busy || !state.selectedFile;
  updateNodeText();
}

async function uploadSelectedVideo() {
  if (state.busy || !state.selectedFile) {
    return;
  }

  const node = state.node;
  const file = state.selectedFile;

  try {
    validateVideo(file);
    setBusy(true);
    setMessage(elements.uploadMessage, "正在準備影片，請不要關閉此頁…");

    const latestMetadata = await loadVideoMetadata(node);
    const content = bytesToBase64(await file.arrayBuffer());
    const body = {
      message: `Replace video ${node}`,
      content,
      branch: BRANCH,
    };

    if (latestMetadata && latestMetadata.sha) {
      body.sha = latestMetadata.sha;
    }

    setMessage(elements.uploadMessage, "正在上傳到 GitHub，較大的影片會需要幾分鐘…");
    const result = await apiRequest(metadataPath(node).split("?ref=")[0], {
      method: "PUT",
      body: JSON.stringify(body),
    });

    if (result && result.content) {
      state.metadata.set(node, result.content);
      setCurrentVideo(result.content);
    } else {
      state.metadata.delete(node);
      setCurrentVideo(await loadVideoMetadata(node));
    }

    clearSelectedFile();
    setMessage(
      elements.uploadMessage,
      `影片 ${node} 已上傳完成。牆內 iPad 最晚約 5 分鐘會自動更新。`,
      "success",
    );
  } catch (error) {
    if (error.status === 401) {
      forgetToken();
      showTokenScreen(friendlyError(error));
      return;
    }
    setMessage(elements.uploadMessage, friendlyError(error), "error");
  } finally {
    setBusy(false);
  }
}

function saveTokenLocally(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function readSavedToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function forgetToken() {
  state.token = "";
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory token is still cleared when browser storage is unavailable.
  }
}

function showTokenScreen(message = "") {
  showOnly("token");
  elements.tokenInput.value = "";
  elements.tokenInput.focus();
  setMessage(elements.tokenMessage, message, message ? "error" : "info");
}

async function openManager() {
  showOnly("manager");
  updateNodeText();
  await selectNode(state.node);

  Promise.all([1, 2, 3].filter((node) => node !== state.node).map(loadVideoMetadata)).catch(() => {
    // Other slots will retry when the user selects them.
  });
}

async function handleTokenSubmit(event) {
  event.preventDefault();
  const token = elements.tokenInput.value.trim();
  if (!token) {
    setMessage(elements.tokenMessage, "請貼上 GitHub Token。", "error");
    return;
  }

  state.token = token;
  elements.saveTokenButton.disabled = true;
  elements.saveTokenButton.textContent = "正在確認…";
  setMessage(elements.tokenMessage, "正在連接 GitHub…");

  try {
    await verifyToken();
    try {
      saveTokenLocally(token);
    } catch {
      setMessage(elements.tokenMessage, "瀏覽器無法記住 Token，但這次仍可繼續使用。", "error");
    }
    await openManager();
  } catch (error) {
    forgetToken();
    setMessage(elements.tokenMessage, friendlyError(error), "error");
  } finally {
    elements.saveTokenButton.disabled = false;
    elements.saveTokenButton.textContent = "儲存並開始";
  }
}

async function initialize() {
  const savedToken = readSavedToken();
  if (!savedToken) {
    showTokenScreen();
    return;
  }

  state.token = savedToken;
  showOnly("boot");
  try {
    await verifyToken();
    await openManager();
  } catch (error) {
    forgetToken();
    showTokenScreen(friendlyError(error));
  }
}

elements.tokenForm.addEventListener("submit", handleTokenSubmit);

elements.changeTokenButton.addEventListener("click", () => {
  forgetToken();
  clearSelectedFile();
  showTokenScreen();
});

elements.nodeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      selectNode(Number(input.value));
    }
  });
});

elements.videoFileInput.addEventListener("change", () => {
  chooseFile(elements.videoFileInput.files && elements.videoFileInput.files[0]);
});

elements.uploadButton.addEventListener("click", uploadSelectedVideo);

window.addEventListener("beforeunload", () => {
  if (state.selectedPreviewUrl) {
    URL.revokeObjectURL(state.selectedPreviewUrl);
  }
});

initialize();
