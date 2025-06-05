const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Player and world state
const players = {}; // id -> { x, y, color }
const blocks = []; // [{x, y, type}]
const SIZE = 20;
const WORLD_WIDTH = 2000;

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

io.on('connection', (socket) => {
  console.log('user connected', socket.id);

  socket.on('join', (color) => {
    const startX = Math.floor(Math.random() * (WORLD_WIDTH - SIZE));
    const startY = 0;
    players[socket.id] = { x: startX, y: startY, color: color || randomColor() };
    socket.emit('init', { id: socket.id, players, blocks });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });
  });

  socket.on('update', (pos) => {
    const player = players[socket.id];
    if (!player) return;
    player.x = Math.max(0, Math.min(WORLD_WIDTH - SIZE, pos.x));
    player.y = pos.y;
    players[socket.id] = player;
    socket.broadcast.emit('state', players);
  });

  socket.on('placeBlock', (block) => {
    if (!block) return;
    block.x = Math.max(0, Math.min(WORLD_WIDTH - SIZE, Math.floor(block.x / SIZE) * SIZE));
    block.y = Math.floor(block.y / SIZE) * SIZE;
    block.type = block.type === 'vine' ? 'vine' : 'solid';
    const exists = blocks.find(b => b.x === block.x && b.y === block.y);
    if (!exists) {
      blocks.push(block);
      io.emit('blockPlaced', block);
    }
  });

  socket.on('removeBlock', (block) => {
    block.x = Math.floor(block.x / SIZE) * SIZE;
    block.y = Math.floor(block.y / SIZE) * SIZE;
    const index = blocks.findIndex(b => b.x === block.x && b.y === block.y);
    if (index !== -1) {
      blocks.splice(index, 1);
      io.emit('blockRemoved', block);
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
