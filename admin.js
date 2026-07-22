"use strict";

const API_ROOT = "https://api.github.com";
const API_VERSION = "2026-03-10";
const TOKEN_STORAGE_KEY = "baechhhh-admin-token";
const REPO_STORAGE_KEY = "baechhhh-admin-repository";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  "c", "cc", "cpp", "css", "csv", "h", "hpp", "htm", "html", "ino",
  "ini", "js", "json", "jsx", "md", "mjs", "py", "scss", "sh", "sql",
  "svg", "toml", "ts", "tsx", "txt", "xml", "yaml", "yml",
]);
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);
const VIDEO_EXTENSIONS = new Set(["m4v", "mov", "mp4", "webm"]);

const elements = {
  authView: document.querySelector("#authView"),
  authForm: document.querySelector("#authForm"),
  authError: document.querySelector("#authError"),
  tokenInput: document.querySelector("#tokenInput"),
  toggleTokenButton: document.querySelector("#toggleTokenButton"),
  ownerInput: document.querySelector("#ownerInput"),
  repoInput: document.querySelector("#repoInput"),
  branchInput: document.querySelector("#branchInput"),
  connectButton: document.querySelector("#connectButton"),
  workspace: document.querySelector("#workspace"),
  repoLabel: document.querySelector("#repoLabel"),
  branchLabel: document.querySelector("#branchLabel"),
  accountAvatar: document.querySelector("#accountAvatar"),
  accountName: document.querySelector("#accountName"),
  refreshButton: document.querySelector("#refreshButton"),
  logoutButton: document.querySelector("#logoutButton"),
  fileCount: document.querySelector("#fileCount"),
  fileSearch: document.querySelector("#fileSearch"),
  fileList: document.querySelector("#fileList"),
  editorTitle: document.querySelector("#editorTitle"),
  fileMeta: document.querySelector("#fileMeta"),
  rawLink: document.querySelector("#rawLink"),
  emptyEditor: document.querySelector("#emptyEditor"),
  editorWork: document.querySelector("#editorWork"),
  textEditor: document.querySelector("#textEditor"),
  binaryPreview: document.querySelector("#binaryPreview"),
  videoPreview: document.querySelector("#videoPreview"),
  imagePreview: document.querySelector("#imagePreview"),
  editCommitRow: document.querySelector("#editCommitRow"),
  editCommitMessage: document.querySelector("#editCommitMessage"),
  saveButton: document.querySelector("#saveButton"),
  dropZone: document.querySelector("#dropZone"),
  uploadFileInput: document.querySelector("#uploadFileInput"),
  selectedUpload: document.querySelector("#selectedUpload"),
  uploadPath: document.querySelector("#uploadPath"),
  uploadCommitMessage: document.querySelector("#uploadCommitMessage"),
  uploadButton: document.querySelector("#uploadButton"),
  uploadProgress: document.querySelector("#uploadProgress"),
  uploadProgressText: document.querySelector("#uploadProgressText"),
  toast: document.querySelector("#toast"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  cancelConfirmButton: document.querySelector("#cancelConfirmButton"),
  confirmActionButton: document.querySelector("#confirmActionButton"),
};

const state = {
  token: "",
  owner: "Axoled-Student",
  repo: "Baechhhh",
  branch: "main",
  files: [],
  filesByPath: new Map(),
  currentFile: null,
  selectedUpload: null,
  toastTimer: null,
};

class GitHubApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function fileExtension(path) {
  const name = path.split("/").pop() || "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
}

function rawFileUrl(path) {
  const encodedBranch = encodeURIComponent(state.branch);
  return `https://raw.githubusercontent.com/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/${encodedBranch}/${encodePath(path)}`;
}

function showToast(message, isError = false) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("error", isError);
  elements.toast.classList.add("show");
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3600);
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

async function githubRequest(path, options = {}) {
  const headers = new Headers({
    Accept: options.accept || "application/vnd.github+json",
    Authorization: `Bearer ${state.token}`,
    "X-GitHub-Api-Version": API_VERSION,
  });

  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `GitHub API 回傳 ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.message) message = payload.message;
    } catch {
      // Keep the status-based fallback. Never include request headers or token.
    }
    throw new GitHubApiError(response.status, message);
  }

  return response;
}

async function githubJson(path, options = {}) {
  const response = await githubRequest(path, options);
  if (response.status === 204) return null;
  return response.json();
}

function saveRepositoryPreference() {
  try {
    localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify({
      owner: state.owner,
      repo: state.repo,
      branch: state.branch,
    }));
  } catch {
    // Repository fields are only a convenience; storage can be unavailable.
  }
}

function loadRepositoryPreference() {
  try {
    const saved = JSON.parse(localStorage.getItem(REPO_STORAGE_KEY) || "null");
    if (!saved) return;
    if (typeof saved.owner === "string") elements.ownerInput.value = saved.owner;
    if (typeof saved.repo === "string") elements.repoInput.value = saved.repo;
    if (typeof saved.branch === "string") elements.branchInput.value = saved.branch;
  } catch {
    localStorage.removeItem(REPO_STORAGE_KEY);
  }
}

async function loadFiles() {
  elements.fileList.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "list-message";
  loading.textContent = "正在讀取 GitHub 檔案…";
  elements.fileList.append(loading);

  const branch = encodeURIComponent(state.branch);
  const payload = await githubJson(
    `/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/git/trees/${branch}?recursive=1`,
  );

  state.files = (payload.tree || [])
    .filter((item) => item.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path, "zh-Hant"));
  state.filesByPath = new Map(state.files.map((file) => [file.path, file]));
  elements.fileCount.textContent = String(state.files.length);
  renderFileList();

  if (payload.truncated) {
    showToast("倉庫檔案很多，GitHub 只回傳了部分清單。", true);
  }
}

function renderFileList() {
  const query = elements.fileSearch.value.trim().toLowerCase();
  const visible = query
    ? state.files.filter((file) => file.path.toLowerCase().includes(query))
    : state.files;

  const fragment = document.createDocumentFragment();
  for (const file of visible) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item";
    button.setAttribute("role", "option");
    button.dataset.path = file.path;
    if (state.currentFile?.path === file.path) {
      button.classList.add("selected");
      button.setAttribute("aria-selected", "true");
    }

    const path = document.createElement("strong");
    path.textContent = file.path;
    const meta = document.createElement("small");
    meta.textContent = formatBytes(file.size);
    button.append(path, meta);
    fragment.append(button);
  }

  elements.fileList.replaceChildren(fragment);
  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "list-message";
    empty.textContent = query ? "沒有符合的檔案。" : "這個 branch 沒有檔案。";
    elements.fileList.append(empty);
  }
}

function resetPreview() {
  elements.videoPreview.pause();
  elements.videoPreview.removeAttribute("src");
  elements.videoPreview.load();
  elements.videoPreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.imagePreview.hidden = true;
}

async function openFile(file) {
  state.currentFile = file;
  renderFileList();
  resetPreview();

  elements.emptyEditor.hidden = true;
  elements.editorWork.hidden = false;
  elements.editorTitle.textContent = file.path;
  elements.fileMeta.textContent = `${formatBytes(file.size)} · ${file.sha.slice(0, 9)}`;
  elements.rawLink.href = rawFileUrl(file.path);
  elements.rawLink.hidden = false;
  elements.editCommitMessage.value = `Update ${file.path}`;
  elements.uploadPath.value = file.path;
  elements.uploadCommitMessage.value = `Replace ${file.path}`;

  const extension = fileExtension(file.path);
  const isText = TEXT_EXTENSIONS.has(extension) && file.size <= MAX_TEXT_BYTES;

  if (isText) {
    elements.textEditor.hidden = false;
    elements.binaryPreview.hidden = true;
    elements.editCommitRow.hidden = false;
    elements.textEditor.value = "正在載入…";
    elements.textEditor.disabled = true;

    try {
      const response = await githubRequest(
        `/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${encodePath(file.path)}?ref=${encodeURIComponent(state.branch)}`,
        { accept: "application/vnd.github.raw+json" },
      );
      elements.textEditor.value = await response.text();
      elements.textEditor.disabled = false;
      elements.textEditor.focus();
    } catch (error) {
      elements.textEditor.value = "";
      showToast(`載入失敗：${friendlyError(error)}`, true);
    }
    return;
  }

  elements.textEditor.hidden = true;
  elements.binaryPreview.hidden = false;
  elements.editCommitRow.hidden = true;

  const previewUrl = rawFileUrl(file.path);
  if (VIDEO_EXTENSIONS.has(extension)) {
    elements.videoPreview.src = previewUrl;
    elements.videoPreview.hidden = false;
  } else if (IMAGE_EXTENSIONS.has(extension)) {
    elements.imagePreview.src = previewUrl;
    elements.imagePreview.hidden = false;
  }
}

function friendlyError(error) {
  if (!(error instanceof GitHubApiError)) return "網路連線失敗，請稍後重試。";
  if (error.status === 401) return "Token 無效或已過期。";
  if (error.status === 403) return `權限不足：${error.message}`;
  if (error.status === 404) return "找不到 repository、branch 或檔案，請檢查 token 權限。";
  if (error.status === 409) return "檔案已被其他提交更新，請重新整理後再試。";
  if (error.status === 413 || error.status === 422) return `GitHub 拒絕這次寫入：${error.message}`;
  return error.message;
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let binary = "";
    for (let index = 0; index < chunk.length; index += 1) {
      binary += String.fromCharCode(chunk[index]);
    }
    chunks.push(binary);
  }
  return btoa(chunks.join(""));
}

function normalizeRepositoryPath(path) {
  return path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/");
}

function validRepositoryPath(path) {
  return path && !path.endsWith("/") && !path.split("/").some((part) => part === ".." || part === ".");
}

function confirmCommit(title, text) {
  return new Promise((resolve) => {
    elements.confirmTitle.textContent = title;
    elements.confirmText.textContent = text;
    elements.confirmDialog.addEventListener("close", () => {
      resolve(elements.confirmDialog.returnValue === "confirm");
    }, { once: true });
    elements.confirmDialog.showModal();
  });
}

async function saveCurrentText() {
  if (!state.currentFile || elements.textEditor.hidden || elements.textEditor.disabled) return;

  const message = elements.editCommitMessage.value.trim() || `Update ${state.currentFile.path}`;
  const confirmed = await confirmCommit(
    "確認儲存文字檔？",
    `${state.currentFile.path} 將寫入 ${state.branch}，commit 訊息為「${message}」。`,
  );
  if (!confirmed) return;

  setBusy(elements.saveButton, true, "正在儲存…", "儲存到 GitHub");
  try {
    const bytes = new TextEncoder().encode(elements.textEditor.value);
    const result = await githubJson(
      `/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${encodePath(state.currentFile.path)}`,
      {
        method: "PUT",
        body: {
          message,
          content: bytesToBase64(bytes),
          branch: state.branch,
          sha: state.currentFile.sha,
        },
      },
    );

    state.currentFile.sha = result.content.sha;
    state.currentFile.size = bytes.length;
    state.filesByPath.set(state.currentFile.path, state.currentFile);
    elements.fileMeta.textContent = `${formatBytes(bytes.length)} · ${result.content.sha.slice(0, 9)}`;
    renderFileList();
    showToast("已建立 commit 並儲存到 GitHub。");
  } catch (error) {
    showToast(`儲存失敗：${friendlyError(error)}`, true);
  } finally {
    setBusy(elements.saveButton, false, "正在儲存…", "儲存到 GitHub");
  }
}

function chooseUpload(file) {
  state.selectedUpload = file || null;
  if (!file) {
    elements.selectedUpload.textContent = "尚未選擇檔案";
    elements.uploadButton.disabled = true;
    return;
  }

  elements.selectedUpload.textContent = `${file.name} · ${formatBytes(file.size)}`;
  if (!elements.uploadPath.value.trim() || !state.currentFile) {
    elements.uploadPath.value = file.name;
  }
  elements.uploadCommitMessage.value = state.filesByPath.has(elements.uploadPath.value.trim())
    ? `Replace ${elements.uploadPath.value.trim()}`
    : `Upload ${elements.uploadPath.value.trim() || file.name}`;
  elements.uploadButton.disabled = file.size > MAX_FILE_BYTES;

  if (file.size > MAX_FILE_BYTES) {
    showToast("此檔案超過 GitHub API 的 100 MB 上限。", true);
  }
}

async function uploadSelectedFile() {
  const file = state.selectedUpload;
  const path = normalizeRepositoryPath(elements.uploadPath.value);
  if (!file) return;
  if (!validRepositoryPath(path)) {
    showToast("請輸入有效的 GitHub 檔案路徑。", true);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showToast("檔案超過 100 MB，無法使用 GitHub API 上傳。", true);
    return;
  }

  const existing = state.filesByPath.get(path);
  const message = elements.uploadCommitMessage.value.trim() || `${existing ? "Replace" : "Upload"} ${path}`;
  const confirmed = await confirmCommit(
    existing ? "確認取代檔案？" : "確認上傳檔案？",
    `${path}（${formatBytes(file.size)}）將寫入 ${state.branch}，commit 訊息為「${message}」。`,
  );
  if (!confirmed) return;

  setBusy(elements.uploadButton, true, "正在上傳…", "上傳到 GitHub");
  elements.uploadProgress.hidden = false;
  elements.uploadProgressText.textContent = "正在讀取並編碼檔案…";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    elements.uploadProgressText.textContent = "正在傳送到 GitHub，請勿關閉分頁…";
    const body = {
      message,
      content: bytesToBase64(bytes),
      branch: state.branch,
    };
    if (existing) body.sha = existing.sha;

    await githubJson(
      `/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${encodePath(path)}`,
      { method: "PUT", body },
    );

    elements.uploadProgressText.textContent = "上傳完成，正在更新清單…";
    await loadFiles();
    chooseUpload(null);
    elements.uploadFileInput.value = "";
    showToast(existing ? "檔案已取代並建立 commit。" : "檔案已上傳並建立 commit。");
    const uploaded = state.filesByPath.get(path);
    if (uploaded) await openFile(uploaded);
  } catch (error) {
    showToast(`上傳失敗：${friendlyError(error)}`, true);
  } finally {
    setBusy(elements.uploadButton, false, "正在上傳…", "上傳到 GitHub");
    elements.uploadButton.disabled = !state.selectedUpload || state.selectedUpload.size > MAX_FILE_BYTES;
    elements.uploadProgress.hidden = true;
  }
}

async function connect() {
  const token = elements.tokenInput.value.trim();
  const owner = elements.ownerInput.value.trim();
  const repo = elements.repoInput.value.trim();
  const branch = elements.branchInput.value.trim();
  if (!token || !owner || !repo || !branch) return;

  state.token = token;
  state.owner = owner;
  state.repo = repo;
  state.branch = branch;
  elements.authError.textContent = "";
  setBusy(elements.connectButton, true, "正在驗證…", "驗證並開啟管理頁");

  try {
    const repository = await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
    let account = null;
    try {
      account = await githubJson("/user");
    } catch {
      // Repository-scoped tokens can still work even if profile access is unavailable.
    }

    await loadFiles();
    try {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // The in-memory token still works when browser storage is unavailable.
    }
    saveRepositoryPreference();
    elements.repoLabel.textContent = repository.full_name;
    elements.branchLabel.textContent = branch;
    elements.accountName.textContent = account?.login || "Token 已驗證";
    elements.accountAvatar.src = account?.avatar_url || "";
    elements.accountAvatar.hidden = !account?.avatar_url;
    elements.tokenInput.value = "";
    elements.authView.hidden = true;
    elements.workspace.hidden = false;
    showToast("已安全連接 GitHub。");
  } catch (error) {
    state.token = "";
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Nothing else is required when browser storage is unavailable.
    }
    elements.workspace.hidden = true;
    elements.authView.hidden = false;
    elements.authError.textContent = friendlyError(error);
  } finally {
    setBusy(elements.connectButton, false, "正在驗證…", "驗證並開啟管理頁");
  }
}

function logout() {
  state.token = "";
  state.files = [];
  state.filesByPath.clear();
  state.currentFile = null;
  state.selectedUpload = null;
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory token is cleared above.
  }
  resetPreview();
  elements.workspace.hidden = true;
  elements.authView.hidden = false;
  elements.authError.textContent = "";
  elements.tokenInput.value = "";
  elements.tokenInput.focus();
  showToast("Token 已從此分頁清除。");
}

elements.authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  connect();
});

elements.toggleTokenButton.addEventListener("click", () => {
  const visible = elements.tokenInput.type === "text";
  elements.tokenInput.type = visible ? "password" : "text";
  elements.toggleTokenButton.textContent = visible ? "顯示" : "隱藏";
});

elements.fileSearch.addEventListener("input", renderFileList);
elements.fileList.addEventListener("click", (event) => {
  const button = event.target.closest(".file-item");
  if (!button) return;
  const file = state.filesByPath.get(button.dataset.path);
  if (file) openFile(file);
});

elements.refreshButton.addEventListener("click", async () => {
  setBusy(elements.refreshButton, true, "更新中…", "重新整理");
  try {
    await loadFiles();
    showToast("檔案清單已更新。");
  } catch (error) {
    showToast(`更新失敗：${friendlyError(error)}`, true);
  } finally {
    setBusy(elements.refreshButton, false, "更新中…", "重新整理");
  }
});

elements.logoutButton.addEventListener("click", logout);
elements.saveButton.addEventListener("click", saveCurrentText);
elements.uploadButton.addEventListener("click", uploadSelectedFile);
elements.uploadFileInput.addEventListener("change", () => chooseUpload(elements.uploadFileInput.files[0]));
elements.cancelConfirmButton.addEventListener("click", () => elements.confirmDialog.close("cancel"));
elements.confirmActionButton.addEventListener("click", () => elements.confirmDialog.close("confirm"));

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) chooseUpload(file);
});

elements.uploadPath.addEventListener("input", () => {
  if (!state.selectedUpload) return;
  const path = normalizeRepositoryPath(elements.uploadPath.value);
  elements.uploadCommitMessage.value = `${state.filesByPath.has(path) ? "Replace" : "Upload"} ${path || state.selectedUpload.name}`;
});

elements.textEditor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    const start = elements.textEditor.selectionStart;
    const end = elements.textEditor.selectionEnd;
    elements.textEditor.setRangeText("  ", start, end, "end");
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentText();
  }
});

loadRepositoryPreference();
let sessionToken = "";
try {
  sessionToken = sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
} catch {
  sessionToken = "";
}
if (sessionToken) {
  elements.tokenInput.value = sessionToken;
  connect();
}
