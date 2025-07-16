const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const users = {};
const rooms = {
  general: [],
  random: [],
  tech: []
};

io.on("connection", socket => {
  console.log("New connection:", socket.id);

  socket.on("login", username => {
    users[socket.id] = { username, room: "general" };
    socket.join("general");
    io.to("general").emit("user-list", Object.values(users));
    socket.emit("message-history", rooms["general"]);
  });

  socket.on("join-room", room => {
    const user = users[socket.id];
    socket.leave(user.room);
    socket.join(room);
    users[socket.id].room = room;
    socket.emit("message-history", rooms[room]);
  });

  socket.on("create-room", room => {
    if (!rooms[room.id]) {
      rooms[room.id] = [];
      io.emit("new-room", room);
    }
  });

  socket.on("send-message", ({ room, text, username }) => {
    if (!room || !rooms[room]) return;

    const msg = {
      username: username || (users[socket.id]?.username || "Anonymous"),
      text,
      timestamp: new Date()
    };

    rooms[room].push(msg);
    io.to(room).emit("receive-message", msg);
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      delete users[socket.id];
      io.to(user.room).emit("user-list", Object.values(users));
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
