const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true,
  maxHttpBufferSize: 5e6
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    if (filePath.endsWith(".js"))  res.setHeader("Content-Type", "application/javascript");
  }
}));

app.get("/ping", (req, res) => res.json({ status: "ok" }));
const rooms = {};

function broadcastMembers(room) {
  if (!rooms[room]) return;
  const members = rooms[room].map(u => ({ id: u.id, username: u.username }));
  io.to(room).emit("members_update", { members });
}

io.on("connection", (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  socket.on("join_room", ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, username });
    console.log(`👤 ${username} joined room: ${room}`);
    socket.to(room).emit("user_joined", { message: `${username} joined the room` });
    socket.emit("room_info", { userCount: rooms[room].length, room });
    broadcastMembers(room);
  });

  socket.on("send_image", ({ imageData, room, reply }) => {
    io.to(room).emit("receive_image", {
      username: socket.username, imageData, senderId: socket.id, reply: reply || null
    });
  });

  socket.on("typing_start", ({ room }) => {
    socket.to(room).emit("user_typing", { username: socket.username });
  });

  socket.on("typing_stop", ({ room }) => {
    socket.to(room).emit("user_stopped_typing", { username: socket.username });
  });

  socket.on("send_message", ({ message, room, reply }) => {
    io.to(room).emit("receive_message", {
      username: socket.username, message, senderId: socket.id, reply: reply || null
    });
  });

  socket.on("clear_chat", ({ room }) => {
    io.to(room).emit("chat_cleared", { clearedBy: socket.username });
  });

  socket.on("disconnect", () => {
    const { username, room } = socket;
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter((u) => u.id !== socket.id);
      socket.to(room).emit("user_left", { message: `${username} left the room` });
      broadcastMembers(room);
      if (rooms[room].length === 0) delete rooms[room];
    }
    console.log(`❌ Disconnected: ${username || socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n✅ Chat server running at http://localhost:${PORT}\n`));