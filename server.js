const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = new Map(); // Using Map instead of object for better performance
const rooms = new Map(); // Using Map for rooms

// Initialize default rooms
rooms.set('general', {
  id: 'general',
  name: 'General',
  description: 'General discussion',
  messages: []
});

rooms.set('random', {
  id: 'random',
  name: 'Random',
  description: 'Random conversations',
  messages: []
});

rooms.set('tech', {
  id: 'tech',
  name: 'Tech Talk',
  description: 'Technology discussions',
  messages: []
});

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("login", (username) => {
    if (!username) return;
    
    const user = {
      id: socket.id,
      username,
      room: 'general'
    };
    
    users.set(socket.id, user);
    socket.join('general');
    
    // Send updated user list to all clients
    io.emit("user-list", Array.from(users.values()));
    // Send message history for the general room
    socket.emit("message-history", rooms.get('general').messages);
    
    console.log(`User ${username} joined with ID ${socket.id}`);
  });

  socket.on("join-room", (roomId) => {
    const user = users.get(socket.id);
    if (!user || !rooms.has(roomId)) return;
    
    // Leave previous room
    socket.leave(user.room);
    
    // Join new room
    socket.join(roomId);
    user.room = roomId;
    users.set(socket.id, user);
    
    // Send message history for the new room
    socket.emit("message-history", rooms.get(roomId).messages);
    
    console.log(`User ${user.username} joined room ${roomId}`);
  });

  socket.on("create-room", (roomData) => {
    if (!roomData || !roomData.name || rooms.has(roomData.id)) return;
    
    const newRoom = {
      id: roomData.id,
      name: roomData.name,
      description: roomData.description || "No description",
      messages: []
    };
    
    rooms.set(roomData.id, newRoom);
    io.emit("new-room", newRoom);
    
    console.log(`New room created: ${roomData.name}`);
  });

  socket.on("send-message", (messageData) => {
    const user = users.get(socket.id);
    if (!user || !messageData || !messageData.text || !rooms.has(user.room)) return;
    
    const message = {
      id: Date.now().toString(),
      username: user.username,
      text: messageData.text,
      timestamp: new Date(),
      room: user.room
    };
    
    // Add message to room's message history
    rooms.get(user.room).messages.push(message);
    
    // Broadcast message to all clients in the room
    io.to(user.room).emit("receive-message", message);
    
    console.log(`Message from ${user.username} in ${user.room}: ${messageData.text}`);
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      io.emit("user-list", Array.from(users.values()));
      console.log(`User ${user.username} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});