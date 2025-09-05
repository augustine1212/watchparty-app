// server.js
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

// keep a simple in-memory map of rooms -> sockets
const rooms = {};

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join-room', ({ roomId, displayName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.displayName = displayName || 'Anonymous';

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push(socket.id);

    // Tell existing clients a new peer joined
    socket.to(roomId).emit('peer-joined', { id: socket.id, displayName: socket.displayName });

    // Send existing peers list to the newcomer
    const otherPeers = rooms[roomId].filter(id => id !== socket.id);
    socket.emit('room-peers', { peers: otherPeers });

    // send chat history? (not implemented: simple)
    console.log(`${socket.displayName} joined ${roomId}`);
  });

  // Signaling messages for WebRTC
  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Chat message
  socket.on('chat-message', ({ roomId, name, message }) => {
    io.to(roomId).emit('chat-message', { id: socket.id, name, message, ts: Date.now() });
  });

  // YouTube sync events: broadcast to others in room
  socket.on('yt-event', ({ roomId, event, payload }) => {
    socket.to(roomId).emit('yt-event', { from: socket.id, event, payload });
  });

  // Request for host state (new joiner asks)
  socket.on('request-host-state', ({ roomId }) => {
    socket.to(roomId).emit('request-host-state', { requester: socket.id });
  });

  // Host replies with current state
  socket.on('host-state', ({ roomId, state }) => {
    io.to(roomId).emit('host-state', { state });
  });

  // handle disconnect
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('peer-left', { id: socket.id, displayName: socket.displayName });
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
    console.log('socket disconnected', socket.id);
  });
});

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
