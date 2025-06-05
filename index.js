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
const SPEED = 5;

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

function overlaps(id, x, y) {
  for (const [pid, p] of Object.entries(players)) {
    if (pid === id) continue;
    if (Math.abs(p.x - x) < SIZE && Math.abs(p.y - y) < SIZE) {
      return true;
    }
  }
  return false;
}

io.on('connection', (socket) => {
  console.log('user connected', socket.id);

  socket.on('join', () => {
    const startX = Math.floor(Math.random() * 400);
    const startY = Math.floor(Math.random() * 400);
    players[socket.id] = { x: startX, y: startY, color: randomColor() };
    socket.emit('init', { id: socket.id, players });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });
  });

  socket.on('move', (dir) => {
    const player = players[socket.id];
    if (!player) return;
    let { x, y } = player;
    if (dir === 'up') y -= SPEED;
    if (dir === 'down') y += SPEED;
    if (dir === 'left') x -= SPEED;
    if (dir === 'right') x += SPEED;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x > 780) x = 780; // canvas width 800 - SIZE
    if (y > 580) y = 580; // canvas height 600 - SIZE
    if (!overlaps(socket.id, x, y)) {
      player.x = x;
      player.y = y;
      io.emit('state', players);
    }
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
