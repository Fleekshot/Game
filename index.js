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
const blocks = []; // [{x, y, type, color, indestructible}]
const projectiles = []; // {id, owner, x, y, vx, vy}
const SIZE = 20;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1000;
const GROUND_Y = WORLD_HEIGHT - 50;
const SPAWN_X = WORLD_WIDTH / 2 - SIZE * 2;
const SPAWN_Y = 0;
const CHECK_INTERVAL = 50;
const PROJECTILE_SPEED = 10;

function addBlock(x, y, type = 'solid', color = '#888', indestructible = false) {
  blocks.push({ x, y, type, color, indestructible });
}

function buildWorld() {
  const spawnWidth = 6;
  const spawnHeight = 2;
  for (let i = 0; i < spawnWidth; i++) {
    for (let j = 0; j < spawnHeight; j++) {
      addBlock(SPAWN_X + i * SIZE, GROUND_Y - (j + 1) * SIZE, 'solid', '#ffff00', true);
    }
  }

  // tower
  for (let y = 0; y < 8; y++) {
    addBlock(200, GROUND_Y - (y + 1) * SIZE);
    addBlock(220, GROUND_Y - (y + 1) * SIZE);
  }

  // hut
  for (let x = 600; x < 660; x += SIZE) {
    addBlock(x, GROUND_Y - SIZE);
    addBlock(x, GROUND_Y - 2 * SIZE);
  }
  addBlock(620, GROUND_Y - 3 * SIZE);
  addBlock(640, GROUND_Y - 3 * SIZE);

  // ruins
  addBlock(900, GROUND_Y - SIZE);
  addBlock(920, GROUND_Y - 2 * SIZE);
  addBlock(940, GROUND_Y - 2 * SIZE);

  // floating islands
  for (let x = 400; x < 500; x += SIZE) {
    addBlock(x, GROUND_Y - 10 * SIZE);
  }
  for (let x = 1000; x < 1080; x += SIZE) {
    addBlock(x, GROUND_Y - 14 * SIZE);
  }
}

buildWorld();

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16);
}

function randomSpawn() {
  return { x: SPAWN_X, y: SPAWN_Y };
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
    if (index !== -1 && !blocks[index].indestructible) {
      const b = blocks.splice(index, 1)[0];
      io.emit('blockRemoved', b);
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
    if (bi !== -1 && !blocks[bi].indestructible) {
      const b = blocks.splice(bi, 1)[0];
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
  updateProjectiles();
}, CHECK_INTERVAL);

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
