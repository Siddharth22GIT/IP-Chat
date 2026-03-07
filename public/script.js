// ── Connect to Socket.IO server ──
const socket = io({
  transports: ["polling", "websocket"],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// ── State ──
let myUsername = "";
let myRoom = "";
let cryptoKey = null; // AES-GCM key derived from IP

// ── DOM references ──
const joinScreen      = document.getElementById("join-screen");
const chatScreen      = document.getElementById("chat-screen");
const usernameInput   = document.getElementById("username-input");
const ipInput         = document.getElementById("ip-input");
const joinBtn         = document.getElementById("join-btn");
const joinError       = document.getElementById("join-error");
const messagesArea    = document.getElementById("messages");
const messageInput    = document.getElementById("message-input");
const sendBtn         = document.getElementById("send-btn");
const leaveBtn        = document.getElementById("leave-btn");
const roomDisplay     = document.getElementById("room-display");
const headerIp        = document.getElementById("header-ip");
const headerUsername  = document.getElementById("header-username");
const sidebarUsername = document.getElementById("sidebar-username");
const userCount       = document.getElementById("user-count");
const clearBtn        = document.getElementById("clear-btn");
const imageBtn        = document.getElementById("image-btn");
const imageInput      = document.getElementById("image-input");
const menuToggle      = document.getElementById("menu-toggle");
const sidebar         = document.querySelector(".sidebar");

// ── Connection status ──
socket.on("connect", () => { console.log("✅ Connected:", socket.id); });
socket.on("connect_error", (err) => { console.error("❌ Error:", err.message); });
socket.on("disconnect", (reason) => { console.warn("⚠️ Disconnected:", reason); });

// ── Mobile keyboard fix ──
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const cs = document.getElementById("chat-screen");
    if (cs) cs.style.height = window.visualViewport.height + "px";
    scrollToBottom();
  });
}

// ── Wake up server ──
async function wakeServer() {
  const statusEl = document.getElementById("wake-status");
  try {
    statusEl.textContent = "Connecting to server...";
    await fetch("/ping");
    statusEl.textContent = "";
    joinBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = "Server is waking up, please wait...";
    setTimeout(wakeServer, 3000);
  }
}
joinBtn.disabled = true;
wakeServer();

// ────────────────────────────────────────
// E2E ENCRYPTION — Web Crypto API (AES-GCM)
// ────────────────────────────────────────

// Derive a 256-bit AES key from the IP address string
async function deriveKeyFromIP(ip) {
  const encoder = new TextEncoder();
  // Import IP as raw key material
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(ip),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  // Derive a strong AES-GCM key using PBKDF2
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("ipchat-salt-v1"), // fixed salt
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt a string — returns base64 string of IV + ciphertext
async function encryptText(plainText) {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // random IV
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plainText)
  );
  // Combine IV + ciphertext and encode as base64
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

// Decrypt a base64 string — returns original plain text
async function decryptText(base64) {
  try {
    const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "🔒 Unable to decrypt message";
  }
}

// ── Validate IP ──
function isValidIP(value) {
  const trimmed = value.trim();
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^[0-9a-fA-F:]{3,}$/;
  return ipv4.test(trimmed) || ipv6.test(trimmed);
}

// ── JOIN ──
async function joinRoom() {
  const username = usernameInput.value.trim();
  const ip = ipInput.value.trim();
  if (!username) { showError("Please enter a username."); usernameInput.focus(); return; }
  if (!ip) { showError("Please enter an IP address."); ipInput.focus(); return; }
  if (!isValidIP(ip)) { showError("That doesn't look like a valid IP address."); ipInput.focus(); return; }

  // Disable button and show generating key status
  joinBtn.disabled = true;
  joinBtn.querySelector("span").textContent = "SECURING...";

  // Derive encryption key from IP before joining
  cryptoKey = await deriveKeyFromIP(ip);

  myUsername = username;
  myRoom = ip;
  socket.emit("join_room", { username: myUsername, room: myRoom });

  joinScreen.classList.remove("active");
  chatScreen.classList.add("active");
  roomDisplay.textContent = myRoom;
  headerIp.textContent = myRoom;
  headerUsername.textContent = myUsername;
  sidebarUsername.textContent = myUsername;
  messageInput.focus();
}

function showError(msg) {
  joinError.textContent = msg;
  joinError.style.animation = "none";
  void joinError.offsetWidth;
  joinError.style.animation = "";
  joinBtn.disabled = false;
  joinBtn.querySelector("span").textContent = "CONNECT";
}

joinBtn.addEventListener("click", joinRoom);
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
ipInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });

// ── SEND MESSAGE ──
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  stopTyping();
  const encrypted = await encryptText(text);
  socket.emit("send_message", { message: encrypted, room: myRoom });
  messageInput.value = "";
  messageInput.focus();
}
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── SEND IMAGE ──
imageBtn.addEventListener("click", () => imageInput.click());

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert("Image too large! Please choose an image under 2MB.");
    imageInput.value = "";
    return;
  }
  const indicator = document.createElement("div");
  indicator.className = "uploading-indicator";
  indicator.textContent = "Encrypting & sending...";
  messagesArea.appendChild(indicator);
  scrollToBottom();

  const reader = new FileReader();
  reader.onload = async (e) => {
    const encrypted = await encryptText(e.target.result); // encrypt base64 image
    socket.emit("send_image", { imageData: encrypted, room: myRoom });
    indicator.remove();
    imageInput.value = "";
  };
  reader.readAsDataURL(file);
});

// ── Timestamp helper ──
function getTimestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── TYPING INDICATOR ──
const typingIndicator = document.getElementById("typing-indicator");
let typingTimeout = null;
let isTyping = false;
const typingUsers = {};

messageInput.addEventListener("input", () => {
  if (!myRoom) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing_start", { room: myRoom });
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit("typing_stop", { room: myRoom });
  }, 1500);
});

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    clearTimeout(typingTimeout);
    socket.emit("typing_stop", { room: myRoom });
  }
}

socket.on("user_typing", ({ username }) => {
  typingUsers[username] = true;
  renderTypingIndicator();
});

socket.on("user_stopped_typing", ({ username }) => {
  delete typingUsers[username];
  renderTypingIndicator();
});

function renderTypingIndicator() {
  const names = Object.keys(typingUsers);
  if (names.length === 0) { typingIndicator.innerHTML = ""; return; }
  const label = names.length === 1
    ? `<span class="typing-name">${escapeHtml(names[0])}</span> is typing`
    : names.length === 2
    ? `<span class="typing-name">${escapeHtml(names[0])}</span> and <span class="typing-name">${escapeHtml(names[1])}</span> are typing`
    : `<span class="typing-name">Several people</span> are typing`;
  typingIndicator.innerHTML = `${label}<div class="typing-dots"><span></span><span></span><span></span></div>`;
  scrollToBottom();
}

// ── CLEAR CHAT ──
clearBtn.addEventListener("click", () => {
  if (confirm("Clear the chat for everyone in this room?")) {
    socket.emit("clear_chat", { room: myRoom });
  }
});
socket.on("chat_cleared", ({ clearedBy }) => {
  messagesArea.innerHTML = `<div class="welcome-msg"><span>— Start of conversation —</span></div>`;
  appendSystemMessage(`${clearedBy} cleared the chat`);
  Object.keys(typingUsers).forEach(k => delete typingUsers[k]);
  renderTypingIndicator();
});

// ── LEAVE ROOM ──
leaveBtn.addEventListener("click", () => location.reload());

// ── MOBILE SIDEBAR ──
menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));
document.addEventListener("click", (e) => {
  if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && e.target !== menuToggle) {
    sidebar.classList.remove("open");
  }
});

// ── SOCKET EVENTS ──
socket.on("receive_message", async ({ username, message, senderId }) => {
  const decrypted = await decryptText(message);
  appendMessage({ username, message: decrypted, timestamp: getTimestamp(), isSelf: senderId === socket.id });
});

socket.on("receive_image", async ({ username, imageData, senderId }) => {
  const decrypted = await decryptText(imageData);
  appendImage({ username, imageData: decrypted, timestamp: getTimestamp(), isSelf: senderId === socket.id });
});

socket.on("user_joined", ({ message }) => appendSystemMessage(message));
socket.on("user_left", ({ message }) => appendSystemMessage(message));
socket.on("room_info", ({ userCount: count }) => { userCount.textContent = count; });
socket.on("update_count", ({ userCount: count }) => { userCount.textContent = count; });

// ── HELPERS ──
function appendMessage({ username, message, timestamp, isSelf }) {
  const div = document.createElement("div");
  div.className = `msg ${isSelf ? "self" : "other"}`;
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${escapeHtml(username)}</span>
      <span class="msg-time">${timestamp}</span>
    </div>
    <div class="msg-bubble">${escapeHtml(message)}</div>
  `;
  messagesArea.appendChild(div);
  scrollToBottom();
}

function appendImage({ username, imageData, timestamp, isSelf }) {
  const div = document.createElement("div");
  div.className = `msg ${isSelf ? "self" : "other"}`;
  div.innerHTML = `
    <div class="msg-meta">
      <span class="msg-author">${escapeHtml(username)}</span>
      <span class="msg-time">${timestamp}</span>
    </div>
    <div class="msg-bubble" style="padding:6px;background:transparent;border:none;">
      <img src="${imageData}" class="msg-image" alt="Image" />
    </div>
  `;
  div.querySelector(".msg-image").addEventListener("click", (e) => openImageOverlay(e.target.src));
  messagesArea.appendChild(div);
  scrollToBottom();
}

function openImageOverlay(src) {
  const overlay = document.createElement("div");
  overlay.className = "img-overlay";
  overlay.innerHTML = `<img src="${src}" alt="Full image" />`;
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

function appendSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;
  messagesArea.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}