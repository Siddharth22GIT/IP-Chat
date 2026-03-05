const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true
});

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    if (filePath.endsWith(".js"))  res.setHeader("Content-Type", "application/javascript");
  }
}));

// Health check — keeps the server alive and confirms it's running
app.get("/ping", (req, res) => res.json({ status: "ok" }));
const rooms = {};

io.on("connection", (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // When a user joins a room
  socket.on("join_room", ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;

    // Add user to room tracking
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, username });

    console.log(`👤 ${username} joined room: ${room}`);

    // Notify others in the room
    socket.to(room).emit("user_joined", {
      message: `${username} joined the room`,
    });

    // Send room info to the joining user
    socket.emit("room_info", {
      userCount: rooms[room].length,
      room,
    });

    // Push updated count to EVERYONE in the room
    io.to(room).emit("update_count", { userCount: rooms[room].length });
  });

  // When a user sends a message
  socket.on("send_message", ({ message, room }) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Broadcast to everyone in the room (including sender)
    io.to(room).emit("receive_message", {
      username: socket.username,
      message,
      timestamp,
      senderId: socket.id,
    });
  });

  // When a user clears the chat for everyone in the room
  socket.on("clear_chat", ({ room }) => {
    io.to(room).emit("chat_cleared", { clearedBy: socket.username });
  });

  // When a user disconnects
  socket.on("disconnect", () => {
    const { username, room } = socket;
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter((u) => u.id !== socket.id);

      // Notify remaining users
      socket.to(room).emit("user_left", {
        message: `${username} left the room`,
      });

      // Push updated count to everyone still in the room
      io.to(room).emit("update_count", { userCount: rooms[room].length });

      // Clean up empty rooms
      if (rooms[room].length === 0) delete rooms[room];
    }

    console.log(`❌ Disconnected: ${username || socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Chat server running at http://localhost:${PORT}\n`);
});
