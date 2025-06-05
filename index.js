const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Player management
const players = {}; // id -> { x, y, color }
const SIZE = 20;

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

io.on('connection', (socket) => {
  console.log('user connected', socket.id);

  socket.on('join', () => {
    const startX = Math.floor(Math.random() * 760);
    const startY = 0;
    players[socket.id] = { x: startX, y: startY, color: randomColor() };
    socket.emit('init', { id: socket.id, players });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });
  });

  socket.on('update', (pos) => {
    const player = players[socket.id];
    if (!player) return;
    player.x = pos.x;
    player.y = pos.y;
    players[socket.id] = player;
    socket.broadcast.emit('state', players);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('playerLeft', socket.id);
  });
});

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
