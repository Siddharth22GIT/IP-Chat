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

// ── DOM references ──
const joinScreen    = document.getElementById("join-screen");
const chatScreen    = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username-input");
const ipInput       = document.getElementById("ip-input");
const joinBtn       = document.getElementById("join-btn");
const joinError     = document.getElementById("join-error");
const messagesArea  = document.getElementById("messages");
const messageInput  = document.getElementById("message-input");
const sendBtn       = document.getElementById("send-btn");
const leaveBtn      = document.getElementById("leave-btn");
const roomDisplay   = document.getElementById("room-display");
const headerIp      = document.getElementById("header-ip");
const headerUsername  = document.getElementById("header-username");
const sidebarUsername = document.getElementById("sidebar-username");
const userCount     = document.getElementById("user-count");
const clearBtn      = document.getElementById("clear-btn");
const menuToggle    = document.getElementById("menu-toggle");
const sidebar       = document.querySelector(".sidebar");

// ── Connection status ──
socket.on("connect", () => {
  console.log("✅ Connected to server:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
});

socket.on("disconnect", (reason) => {
  console.warn("⚠️ Disconnected:", reason);
});


function isValidIP(value) {
  const trimmed = value.trim();
  // Simple IPv4 pattern
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  // Very loose IPv6 / custom pattern — allow colons and hex
  const ipv6 = /^[0-9a-fA-F:]{3,}$/;
  return ipv4.test(trimmed) || ipv6.test(trimmed);
}

// ── JOIN ──
function joinRoom() {
  const username = usernameInput.value.trim();
  const ip       = ipInput.value.trim();

  // Validation
  if (!username) {
    showError("Please enter a username.");
    usernameInput.focus();
    return;
  }
  if (!ip) {
    showError("Please enter an IP address.");
    ipInput.focus();
    return;
  }
  if (!isValidIP(ip)) {
    showError("That doesn't look like a valid IP address.");
    ipInput.focus();
    return;
  }

  myUsername = username;
  myRoom     = ip;

  // Tell the server we're joining
  socket.emit("join_room", { username: myUsername, room: myRoom });

  // Switch screens
  joinScreen.classList.remove("active");
  chatScreen.classList.add("active");

  // Update UI labels
  roomDisplay.textContent     = myRoom;
  headerIp.textContent        = myRoom;
  headerUsername.textContent  = myUsername;
  sidebarUsername.textContent = myUsername;

  // Focus the message box
  messageInput.focus();
}

function showError(msg) {
  joinError.textContent = msg;
  // Re-trigger animation
  joinError.style.animation = "none";
  void joinError.offsetWidth;
  joinError.style.animation = "";
}

joinBtn.addEventListener("click", joinRoom);
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom(); });
ipInput.addEventListener("keydown",       (e) => { if (e.key === "Enter") joinRoom(); });

// ── SEND MESSAGE ──
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  socket.emit("send_message", { message: text, room: myRoom });
  messageInput.value = "";
  messageInput.focus();
}

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── CLEAR CHAT ──
clearBtn.addEventListener("click", () => {
  if (confirm("Clear the chat for everyone in this room?")) {
    socket.emit("clear_chat", { room: myRoom });
  }
});

// Server tells everyone to clear
socket.on("chat_cleared", ({ clearedBy }) => {
  // Remove all message/system nodes except the welcome line
  messagesArea.innerHTML = `<div class="welcome-msg"><span>— Start of conversation —</span></div>`;
  appendSystemMessage(`${clearedBy} cleared the chat`);
});


leaveBtn.addEventListener("click", () => {
  // Reload to reset everything cleanly
  location.reload();
});

// ── MOBILE SIDEBAR TOGGLE ──
menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
});

// Close sidebar when clicking outside on mobile
document.addEventListener("click", (e) => {
  if (
    sidebar.classList.contains("open") &&
    !sidebar.contains(e.target) &&
    e.target !== menuToggle
  ) {
    sidebar.classList.remove("open");
  }
});

// ── SOCKET EVENTS ──

// Receive a chat message
socket.on("receive_message", ({ username, message, timestamp, senderId }) => {
  const isSelf = senderId === socket.id;
  appendMessage({ username, message, timestamp, isSelf });
});

// Someone joined
socket.on("user_joined", ({ message }) => {
  appendSystemMessage(message);
});

// Someone left
socket.on("user_left", ({ message }) => {
  appendSystemMessage(message);
});

// Room info on first join
socket.on("room_info", ({ userCount: count }) => {
  userCount.textContent = count;
});

// Single source of truth for online count — fires for everyone on join/leave
socket.on("update_count", ({ userCount: count }) => {
  userCount.textContent = count;
});

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

// Prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
