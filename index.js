const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Player and world state
const players = {}; // id -> { x, y, color, name }
const blocks = []; // [{x, y, type}]
const projectiles = []; // {id, owner, x, y, vx, vy}
const pairTimers = {}; // "id1-id2" -> ms of contact
const heartTimeouts = {}; // timers for explosions after hearts
const SIZE = 20;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1000;
const CHECK_INTERVAL = 50;
const PROJECTILE_SPEED = 10;

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

function randomSpawn() {
  return {
    x: Math.floor(Math.random() * (WORLD_WIDTH - SIZE)),
    y: 0
  };
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function respawnPlayer(id) {
  const pos = randomSpawn();
  const p = players[id];
  if (!p) return;
  p.x = pos.x;
  p.y = pos.y;
  io.emit('playerRespawn', { id, x: p.x, y: p.y });
}

io.on('connection', (socket) => {
  console.log('user connected', socket.id);

  socket.on('join', ({ color, name }) => {
    const spawn = randomSpawn();
    players[socket.id] = {
      x: spawn.x,
      y: spawn.y,
      color: color || randomColor(),
      name: name || 'Player'
    };
    socket.emit('init', { id: socket.id, players, blocks });
    socket.broadcast.emit('playerJoined', { id: socket.id, player: players[socket.id] });
  });

  socket.on('update', (pos) => {
    const player = players[socket.id];
    if (!player) return;
    player.x = Math.max(0, Math.min(WORLD_WIDTH - SIZE, pos.x));
    player.y = Math.max(0, Math.min(WORLD_HEIGHT - SIZE, pos.y));
    players[socket.id] = player;
    socket.broadcast.emit('state', players);
  });

  socket.on('placeBlock', (block) => {
    if (!block) return;
    block.x = Math.max(0, Math.min(WORLD_WIDTH - SIZE, Math.floor(block.x / SIZE) * SIZE));
    block.y = Math.max(0, Math.min(WORLD_HEIGHT - SIZE, Math.floor(block.y / SIZE) * SIZE));
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

  socket.on('shoot', (target) => {
    const p = players[socket.id];
    if (!p) return;
    const startX = p.x + SIZE / 2;
    const startY = p.y + SIZE / 2;
    const dx = target.x - startX;
    const dy = target.y - startY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    projectiles.push({
      id: Date.now() + Math.random(),
      owner: socket.id,
      x: startX,
      y: startY,
      vx: (dx / dist) * PROJECTILE_SPEED,
      vy: (dy / dist) * PROJECTILE_SPEED
    });
  });

  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('playerLeft', socket.id);
  });
});

function checkPairs() {
  const ids = Object.keys(players);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const id1 = ids[i];
      const id2 = ids[j];
      const p1 = players[id1];
      const p2 = players[id2];
      if (!p1 || !p2) continue;
      const key = id1 < id2 ? id1 + '-' + id2 : id2 + '-' + id1;
      if (Math.abs(p1.x - p2.x) < SIZE && Math.abs(p1.y - p2.y) < SIZE) {
        pairTimers[key] = (pairTimers[key] || 0) + CHECK_INTERVAL;
        if (pairTimers[key] >= 5000 && !heartTimeouts[key]) {
          const hx = (p1.x + p2.x) / 2 + SIZE / 2;
          const hy = (p1.y + p2.y) / 2 + SIZE / 2;
          io.emit('hearts', { x: hx, y: hy });
          heartTimeouts[key] = setTimeout(() => {
            explode(hx, hy);
            delete heartTimeouts[key];
          }, 3000);
          pairTimers[key] = 0;
        }
      } else {
        pairTimers[key] = 0;
      }
    }
  }
}

function explode(x, y) {
  io.emit('explode', { x, y });
  const radius = SIZE * 2;
  for (const id of Object.keys(players)) {
    const p = players[id];
    const dx = p.x + SIZE / 2 - x;
    const dy = p.y + SIZE / 2 - y;
    if (Math.sqrt(dx * dx + dy * dy) <= radius) {
      respawnPlayer(id);
    }
  }
}

function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.x += pr.vx;
    pr.y += pr.vy;
    if (pr.x < 0 || pr.y < 0 || pr.x > WORLD_WIDTH || pr.y > WORLD_HEIGHT) {
      projectiles.splice(i, 1);
      continue;
    }
    const bi = blocks.findIndex(b => rectsOverlap(pr.x, pr.y, 2, 2, b.x, b.y, SIZE, SIZE));
    if (bi !== -1) {
      const b = blocks[bi];
      blocks.splice(bi, 1);
      io.emit('blockRemoved', b);
      projectiles.splice(i, 1);
      continue;
    }
    for (const [id, p] of Object.entries(players)) {
      if (id === pr.owner) continue;
      if (rectsOverlap(pr.x, pr.y, 2, 2, p.x, p.y, SIZE, SIZE)) {
        respawnPlayer(id);
        projectiles.splice(i, 1);
        break;
      }
    }
  }
  io.emit('projectiles', projectiles);
}

setInterval(() => {
  checkPairs();
  updateProjectiles();
}, CHECK_INTERVAL);

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
