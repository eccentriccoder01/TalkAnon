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

    socket.on("send-message", text => {
        const user = users[socket.id];
        if (!user || !user.room) {
            console.log("Message blocked: user or room not found");
            return;
        }

        const msg = {
            username: user.username,
            text,
            timestamp: new Date()
        };

        rooms[user.room].push(msg);
        io.to(user.room).emit("receive-message", msg);
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
